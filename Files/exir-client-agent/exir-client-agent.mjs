// ─────────────────────────────────────────────────────────────────────────
// Exir Client Agent — runs on EACH VIP client PC (not the operator).
// Purpose: replace PsExec / WMIC entirely.
//
// The operator's ping-agent (on the server) posts JSON to
//   http://<client-ip>:8766/message   → shows a message window locally
//   http://<client-ip>:8766/punish    → same, with kbd lock + Alt+F4 block
//   http://<client-ip>:8766/netlimiter/apply → set/re-apply NetLimiter tier
//                                               body: { tier, bytes }
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

const VERSION = "1.1.0";
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

// ── Network tools (Phase 6) ───────────────────────────────────────────────
// All of these run locally on the VIP under the interactive user session, no
// PsExec / SMB needed. The agent runs from a Scheduled Task at logon, but the
// network commands themselves (ipconfig /flushdns, netsh interface ip set,
// registry writes to WinINET) need admin. Install the scheduled task with
// "Run with highest privileges" (install-service.ps1 sets that flag) — then
// these all work without any UAC prompt.

function runPs(script, timeout = 12000) {
  return new Promise((resolve) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, error: (stderr || err.message || "").toString().slice(0, 400) });
        } else {
          resolve({ ok: true, output: String(stdout || "").slice(0, 800) });
        }
      },
    );
  });
}

function flushDns() {
  return new Promise((resolve) => {
    execFile("ipconfig", ["/flushdns"], { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: (stderr || err.message || "").toString().slice(0, 300) });
      resolve({ ok: true, output: String(stdout || "").slice(0, 400) });
    });
  });
}

function disableProxy() {
  // Clears WinINET (IE/Edge/most apps) proxy state. DOES NOT touch DNS or IP.
  const script = [
    "$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';",
    "Set-ItemProperty -Path $k -Name ProxyEnable -Value 0 -Type DWord -Force;",
    "Remove-ItemProperty -Path $k -Name ProxyServer -ErrorAction SilentlyContinue;",
    "Remove-ItemProperty -Path $k -Name AutoConfigURL -ErrorAction SilentlyContinue;",
    "Remove-ItemProperty -Path $k -Name ProxyOverride -ErrorAction SilentlyContinue;",
    // Also clear WinHTTP (background services). Requires admin — Scheduled Task
    // runs with highest privileges so this succeeds.
    "netsh winhttp reset proxy | Out-Null;",
    "'ok'",
  ].join(" ");
  return runPs(script);
}

// Picks the primary Ethernet/Wi-Fi adapter (the one with a default gateway).
// Returns its InterfaceAlias — that's what `netsh interface ip set` needs.
async function primaryAdapter() {
  const r = await runPs(
    "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1 -ExpandProperty InterfaceAlias)",
    6000,
  );
  return r.ok ? (r.output || "").trim() : "";
}

async function setIp({ ip, mask, gateway, dns1, dns2, adapter }) {
  const iface = (adapter && String(adapter).trim()) || (await primaryAdapter());
  if (!iface) return { ok: false, error: "could not detect network adapter" };
  const prefix = maskToPrefix(mask) || 24;
  // Reset then set — same pattern netsh docs recommend.
  const parts = [
    `netsh interface ipv4 set address name="${iface}" source=static addr=${ip} mask=${mask} gateway=${gateway} | Out-Null`,
    `netsh interface ipv4 set dnsservers name="${iface}" source=static addr=${dns1} register=primary validate=no | Out-Null`,
  ];
  if (dns2) parts.push(`netsh interface ipv4 add dnsservers name="${iface}" addr=${dns2} index=2 validate=no | Out-Null`);
  parts.push(`'ok · ${iface} · ${ip}/${prefix} gw=${gateway} dns=${dns1}${dns2 ? "," + dns2 : ""}'`);
  return runPs(parts.join("; "), 15000);
}

function maskToPrefix(mask) {
  if (!mask) return null;
  return String(mask).split(".").reduce((a, b) => a + ((Number(b) >>> 0).toString(2).match(/1/g)?.length || 0), 0);
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

    json(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    json(res, 500, { ok: false, error: String(e?.message || e) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[exir-client-agent] v${VERSION} · ${MACHINE} · listening on 0.0.0.0:${PORT}`);
});
