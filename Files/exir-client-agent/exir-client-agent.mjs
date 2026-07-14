// ─────────────────────────────────────────────────────────────────────────
// Exir Client Agent — runs on EACH VIP client PC (not the operator).
// Purpose: replace PsExec / WMIC entirely.
//
// The operator's ping-agent (on the server) posts JSON to
//   http://<client-ip>:8766/message   → shows a message window locally
//   http://<client-ip>:8766/punish    → same, with kbd lock + Alt+F4 block
//   http://<client-ip>:8766/netlimiter/apply → re-apply NetLimiter rules
//   http://<client-ip>:8766/health    → { ok:true, machine, version }
//
// Everything runs in the interactive user session because the agent itself
// runs there (see install-service.ps1: uses "Run at logon" scheduled task,
// NOT a session-0 service). No PsExec, no SMB shares, no admin creds.
// Zero npm dependencies — just Node.js 18+.
// ─────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";

const VERSION = "1.0.0";
const PORT = Number(process.env.EXIR_CLIENT_PORT || 8766);
const MACHINE = (process.env.EXIR_MACHINE_ID || hostname()).toUpperCase();
const NLQ = process.env.NETLIMITER_NLQ ||
  "C:\\Program Files\\Locktime Software\\NetLimiter 4\\nlq.exe";

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

// ── NetLimiter re-apply (called after UVNC drops the rule state) ────────
const NL_RULES = ["Exir-500K", "Exir-1M", "Exir-2M", "Exir-UNL"];

function nlqRun(args) {
  return new Promise((resolve) => {
    execFile(NLQ, args, { timeout: 8000 }, (err, out, stderr) => {
      resolve({ ok: !err, out: String(out || ""), err: String(stderr || err?.message || "") });
    });
  });
}

async function applyNetLimiter(tier) {
  // Disable all, enable the one that matches.
  const want = tier ? `Exir-${tier}` : null;
  for (const r of NL_RULES) {
    await nlqRun(["EnableRule", r, r === want ? "1" : "0"]);
  }
  return { ok: true, applied: want || "none" };
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
      const { tier } = JSON.parse(body || "{}"); // e.g. "500K", "1M", "2M", "UNL", or null
      const r = await applyNetLimiter(tier);
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
