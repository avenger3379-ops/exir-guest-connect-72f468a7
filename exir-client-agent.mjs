// ─────────────────────────────────────────────────────────────────────────
// Exir Client Agent — runs on EACH VIP client PC (not the operator).
// Purpose: replace PsExec / WMIC entirely.
//
// The operator's ping-agent (on the server) posts JSON to
//   http://<client-ip>:8766/message   → shows a message window locally
//   http://<client-ip>:8766/punish    → same, with kbd lock + Alt+F4 block
//   http://<client-ip>:8766/netlimiter/apply → set/re-apply NetLimiter tier
//                                               body: { tier, bytes }
//   http://<client-ip>:8766/net/info  → GET, returns the client's actual
//                                        current IPv4 config: { ok, ip, mask,
//                                        gateway, dns1, dns2 }. Anything the
//                                        OS doesn't report comes back as ""
//                                        — never a guessed/placeholder value.
//   http://<client-ip>:8766/health    → { ok:true, machine, version }
//
// Everything runs in the interactive user session because the agent itself
// runs there (see install-service.ps1: uses "Run at logon" scheduled task,
// NOT a session-0 service). No PsExec, no SMB shares, no admin creds.
// Zero npm dependencies — just Node.js 18+.
//
// This is now the PREFERRED path for every QoS change (ping-agent.mjs tries
// this first, and only falls back to PsExec + netlimiter-qos.ps1 over SMB if
// this agent is unreachable). Since this agent already runs locally on the
// VIP, applying QoS through it never touches SMB at all, so it can't collide
// with SmartLaunch's or UVNC's own SMB sessions to the same host — that
// collision (Windows error 5 "Access is denied" / 1219 "Multiple
// connections...") was the actual cause of QoS silently failing to apply
// while UVNC/SmartLaunch held a session open.
// ─────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";

const VERSION = "1.2.0";
const PORT = Number(process.env.EXIR_CLIENT_PORT || 8766);
const MACHINE = (process.env.EXIR_MACHINE_ID || hostname()).toUpperCase();
// NOTE: nlq.exe does NOT exist in NetLimiter 4.1.13 (it was a CLI tool from
// older NetLimiter versions — see ping-agent.mjs comments). The working
// approach talks to NetLimiter.dll directly via .NET reflection, which is
// what netlimiter-qos.ps1 (deployed on every VIP by Setup-NetLimiter-VIP.ps1)
// already does. This agent just runs that same script locally — since this
// agent runs IN the interactive user session already, no PsExec/SMB call is
// needed at all, which is exactly what sidesteps the SmartLaunch/UVNC SMB
// session conflicts.
const NETLIMITER_QOS_SCRIPT = process.env.NETLIMITER_QOS_SCRIPT ||
  "C:\\GameNet-Monitor\\netlimiter-qos.ps1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TMP = join(tmpdir(), "exir-agent");
try { mkdirSync(TMP, { recursive: true }); } catch { /* ignore */ }

function readBody(req, limit = 4_000_000) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > limit) { req.destroy(); reject(new Error("payload too large")); }
    });
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

// ── Local popup launcher (uses mshta.exe, always available on Windows) ──
function launchHta(html, { punish = false } = {}) {
  const fname = `exir_${punish ? "punish" : "msg"}_${Date.now()}.hta`;
  const path = join(TMP, fname);
  // If punish, inject a small kill-guard <script> so Alt+F4 / Esc close is
  // blocked for the countdown duration — the HTML template already does this
  // for punish payloads; we don't need to modify it here.
  writeFileSync(path, html, "utf8");
  const child = spawn("mshta.exe", [path], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.on("error", (e) => console.error("[exir-agent] mshta launch failed:", e.message));
  child.unref();
  return { path };
}

// ── NetLimiter re-apply (called after UVNC/SmartLaunch drops the rule state,
// or directly by the server as the PREFERRED path for every QoS change) ──
//
// Runs netlimiter-qos.ps1 locally (no PsExec, no SMB — this agent already
// lives in the interactive session on the VIP). $Bytes is computed centrally
// by ping-agent.mjs (QOS_TIER_KBYTES in .env) and just passed straight
// through, same contract as the PsExec fallback path.
function runQosScript(tier, bytes) {
  return new Promise((resolve) => {
    const args = [
      "-ExecutionPolicy", "Bypass",
      "-File", NETLIMITER_QOS_SCRIPT,
      "-Tier", tier,
      ...(bytes > 0 ? ["-Bytes", String(bytes)] : []),
    ];
    execFile("powershell", args, { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      // netlimiter-qos.ps1 prints exactly one JSON line on stdout.
      const text = String(stdout || "");
      const jsonLine = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.startsWith("{") && l.endsWith("}"));
      if (jsonLine) {
        try { return resolve(JSON.parse(jsonLine)); } catch { /* fall through */ }
      }
      resolve({
        ok: false,
        error: (stderr || err?.message || "no JSON output from netlimiter-qos.ps1").toString().slice(0, 300),
      });
    });
  });
}

async function applyNetLimiter(tier, bytes) {
  const t = tier && tier !== "off" ? tier : "UNL";
  const b = Number(bytes) || 0;
  const r = await runQosScript(t, b);
  return {
    ok: !!r.ok,
    tier: t,
    ...(r.ok
      ? { limitBytesPerSec: r.limitBytesPerSec ?? (t !== "UNL" ? b : "unlimited") }
      : { error: r.error || "unknown error" }),
  };
}

// ── Live network info (GET /net/info) ──────────────────────────────────
// Reads whatever the OS actually has configured on the active adapter right
// now — IP, subnet mask, default gateway, DNS servers — and returns exactly
// that. Any field the OS doesn't report comes back as "" (never a made-up
// placeholder); the operator UI is expected to render those as empty boxes
// rather than guessing.
const NET_INFO_PS = `
$ErrorActionPreference = 'SilentlyContinue'
function PrefixToMask($p) {
  if (-not $p) { return '' }
  $bits = ('1' * [int]$p).PadRight(32, '0')
  $bytes = for ($i = 0; $i -lt 32; $i += 8) { [Convert]::ToByte($bits.Substring($i, 8), 2) }
  return ($bytes -join '.')
}
$cfg = Get-NetIPConfiguration | Where-Object {
  $_.IPv4Address -and $_.NetAdapter.Status -eq 'Up'
} | Sort-Object { if ($_.IPv4DefaultGateway) { 0 } else { 1 } } | Select-Object -First 1
$ip = ''; $mask = ''; $gw = ''; $dns = @()
if ($cfg) {
  $ip = [string]$cfg.IPv4Address.IPAddress
  $mask = PrefixToMask $cfg.IPv4Address.PrefixLength
  if ($cfg.IPv4DefaultGateway) { $gw = [string]$cfg.IPv4DefaultGateway.NextHop }
  if ($cfg.DNSServer) {
    $dns = @($cfg.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses } | Where-Object { $_ })
  }
}
$obj = [PSCustomObject]@{
  ok = $true
  ip = $ip
  mask = $mask
  gateway = $gw
  dns1 = if ($dns.Count -ge 1) { $dns[0] } else { '' }
  dns2 = if ($dns.Count -ge 2) { $dns[1] } else { '' }
}
$obj | ConvertTo-Json -Compress
`.trim();

function readNetInfo() {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", NET_INFO_PS],
      { timeout: 8000, windowsHide: true },
      (err, stdout, stderr) => {
        const text = String(stdout || "");
        const jsonLine = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.startsWith("{") && l.endsWith("}"));
        if (jsonLine) {
          try {
            const parsed = JSON.parse(jsonLine);
            return resolve({
              ok: true,
              ip: parsed.ip || "",
              mask: parsed.mask || "",
              gateway: parsed.gateway || "",
              dns1: parsed.dns1 || "",
              dns2: parsed.dns2 || "",
            });
          } catch { /* fall through */ }
        }
        resolve({
          ok: false,
          error: (stderr || err?.message || "no JSON output from Get-NetIPConfiguration").toString().slice(0, 300),
        });
      },
    );
  });
}

// ── Server ──────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }

  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
      return json(res, 200, { ok: true, agent: "exir-client", machine: MACHINE, version: VERSION });
    }

    if (req.method === "POST" && (req.url === "/message" || req.url === "/punish")) {
      const body = await readBody(req);
      const { html } = JSON.parse(body || "{}");
      if (!html || typeof html !== "string") return json(res, 400, { ok: false, error: "html required" });
      const { path } = launchHta(html, { punish: req.url === "/punish" });
      return json(res, 200, { ok: true, note: `mshta local (${MACHINE})`, path });
    }

    if (req.method === "POST" && req.url === "/netlimiter/apply") {
      const body = await readBody(req);
      // tier: "500K" | "1M" | "2M" | "UNL" | null. bytes: precomputed B/s for
      // the tier (ignored for UNL) — server centralizes the tier→bytes table.
      const { tier, bytes } = JSON.parse(body || "{}");
      const r = await applyNetLimiter(tier, bytes);
      return json(res, 200, r);
    }

    if (req.method === "GET" && req.url === "/net/info") {
      const r = await readNetInfo();
      return json(res, r.ok ? 200 : 502, r);
    }

    json(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    json(res, 500, { ok: false, error: String(e?.message || e) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[exir-client-agent] v${VERSION} · ${MACHINE} · listening on 0.0.0.0:${PORT}`);
});
