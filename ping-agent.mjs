// ─────────────────────────────────────────────────────────────────────────
// EXIR Ping Agent
// A tiny local HTTP server that performs REAL ICMP pings using the operating
// system's `ping` command, so the dashboard can show true latency for LAN
// devices (gateway, DNS, IPs) that browsers can never reach via fetch().
//
// It starts automatically alongside the project (see "dev" script in
// package.json) — you do NOT need to open it manually.
//
// The browser dashboard POSTs a list of hosts to http://localhost:8765/ping
// and gets back the latency (ms) for each, or -1 when the host is unreachable.
// ─────────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { platform } from "node:os";
import { createSocket } from "node:dgram";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const PORT = Number(process.env.PING_AGENT_PORT || 8765);
const IS_WIN = platform() === "win32";
const TIMEOUT_MS = 1500;

// Run a single OS ping and resolve to latency in ms, or -1 on loss/timeout.
function pingOne(host) {
  return new Promise((resolve) => {
    // Basic guard: only allow hostnames / IPs, never shell metacharacters.
    if (!/^[a-zA-Z0-9._-]+$/.test(host)) return resolve(-1);

    const args = IS_WIN
      ? ["-n", "1", "-w", String(TIMEOUT_MS), host]
      : ["-c", "1", "-W", String(Math.ceil(TIMEOUT_MS / 1000)), host];

    execFile("ping", args, { timeout: TIMEOUT_MS + 500 }, (err, stdout) => {
      if (err && !stdout) return resolve(-1);
      const text = String(stdout);
      // Windows: "time=16ms" / "time<1ms" / "Average = 16ms"
      // Unix:    "time=16.3 ms"
      let m = text.match(/time[=<]\s*([\d.]+)\s*ms/i);
      if (!m) m = text.match(/Average\s*=\s*([\d.]+)\s*ms/i);
      if (m) return resolve(Math.round(parseFloat(m[1])));
      // No time found → treat as loss (host did not reply).
      resolve(-1);
    });
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runExe(file, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code, stdout: String(stdout || ""), stderr: String(stderr || ""), error: err?.message || "" });
    });
  });
}

function hostForMachine(machine, fallbackHost = "") {
  if (fallbackHost) return fallbackHost;
  const nn = String(machine || "").replace(/\D/g, "").padStart(2, "0");
  return process.env.CLIENT_SUBNET ? `${process.env.CLIENT_SUBNET}${nn}` : `${process.env.MIKROTIK_SUBNET || "192.168.3.1"}${nn}`;
}

async function primeRemoteAuth(host, user, pass) {
  if (!host || !user || !pass || platform() !== "win32") return;
  await runExe("net", ["use", `\\\\${host}\\IPC$`, `/user:${user}`, pass, "/persistent:no"], 5000);
  await runExe("net", ["use", `\\\\${host}\\ADMIN$`, `/user:${user}`, pass, "/persistent:no"], 5000);
}

async function runRemotePowerShell({ host, user, pass, script, timeout = 30000, prefer = "auto" }) {
  if (platform() !== "win32") return { ok: false, method: "none", error: "requires Windows operator PC" };
  await primeRemoteAuth(host, user, pass);
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const errors = [];

  if (prefer !== "psexec") {
    const ps = await runExe("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
      `Invoke-Command -ComputerName '${host.replace(/'/g, "''")}' ${user ? `-Credential (New-Object pscredential('${String(user).replace(/'/g, "''")}',(ConvertTo-SecureString '${String(pass || "").replace(/'/g, "''")}' -AsPlainText -Force))) ` : ""}-ScriptBlock { param($b) powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand $b } -ArgumentList '${encoded}'`,
    ], timeout);
    if (ps.ok) return { ok: true, method: "winrm", stdout: ps.stdout };
    errors.push(`winrm: ${(ps.stderr || ps.error).slice(0, 120)}`);

    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const local = path.join(__dirname, `.exir-remote-${stamp}.ps1`);
    const remoteUnc = `\\\\${host}\\ADMIN$\\Temp\\exir-remote-${stamp}.ps1`;
    const remotePath = `C:\\Windows\\Temp\\exir-remote-${stamp}.ps1`;
    const task = `ExirRemote-${stamp}`;
    try {
      writeFileSync(local, script, "utf8");
      const copy = await runExe("cmd.exe", ["/c", "copy", "/Y", local, remoteUnc], 10000);
      if (copy.ok) {
        const d = new Date(Date.now() + 60_000);
        const st = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        const base = ["/Create", "/S", host, "/TN", task, "/SC", "ONCE", "/ST", st, "/TR", `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${remotePath}"`, "/RL", "HIGHEST", "/F"];
        const create = await runExe("schtasks.exe", user ? [...base, "/RU", user, "/RP", pass || ""] : [...base, "/RU", "SYSTEM"], 10000);
        if (create.ok) {
          const run = await runExe("schtasks.exe", ["/Run", "/S", host, "/TN", task], timeout);
          await runExe("schtasks.exe", ["/Delete", "/S", host, "/TN", task, "/F"], 8000);
          if (run.ok) return { ok: true, method: "schtasks", stdout: run.stdout };
          errors.push(`schtasks/run: ${(run.stderr || run.error).slice(0, 120)}`);
        } else errors.push(`schtasks/create: ${(create.stderr || create.error).slice(0, 120)}`);
      } else errors.push(`copy: ${(copy.stderr || copy.error).slice(0, 120)}`);
    } finally {
      try { unlinkSync(local); } catch { /* ignore */ }
    }
  }

  const psexec = process.env.PSEXEC_PATH || "psexec.exe";
  const px = await runExe(psexec, [
    "-accepteula", "-nobanner", `\\\\${host}`,
    ...(user ? ["-u", user] : []), ...(pass ? ["-p", pass] : []),
    "-h", "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded,
  ], timeout);
  if (px.ok) return { ok: true, method: "psexec", stdout: px.stdout };
  errors.push(`psexec: ${(px.stderr || px.error).slice(0, 160)}`);
  return { ok: false, method: "failed", error: errors.join(" | ") };
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    const wantsHtml = req.url === "/";
    if (wantsHtml) {
      res.writeHead(200, { ...CORS, "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>EXIR Ping Agent</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #071018; color: #e8fff7; font-family: Tahoma, Arial, sans-serif; }
      main { width: min(560px, calc(100vw - 32px)); border: 1px solid rgba(51,255,170,.35); border-radius: 14px; padding: 24px; background: rgba(8,20,30,.82); box-shadow: 0 0 34px rgba(51,255,170,.12); }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 8px 0; color: #a7c7bd; line-height: 1.8; }
      code { direction: ltr; display: inline-block; color: #33ffaa; }
      .dot { display:inline-block; width:10px; height:10px; border-radius:50%; background:#33ffaa; box-shadow:0 0 12px #33ffaa; margin-left:8px; }
    </style>
  </head>
  <body>
    <main>
      <h1><span class="dot"></span>Ping Agent فعال است</h1>
      <p>این سرویس باید کنار داشبورد باز بماند تا پینگ واقعی DNS و IPهای لوکال را بگیرد.</p>
      <p>داشبورد: <code>http://localhost:8080</code></p>
      <p>وضعیت JSON: <code>http://localhost:${PORT}/health</code></p>
    </main>
  </body>
</html>`);
    }
    res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, agent: "exir-ping" }));
  }

  if (req.method === "POST" && req.url === "/ping") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 10_000) req.destroy(); // guard
    });
    req.on("end", async () => {
      try {
        const { hosts } = JSON.parse(body || "{}");
        const list = Array.isArray(hosts) ? hosts.slice(0, 24) : [];
        const results = await Promise.all(
          list.map((h) => pingOne(String(h).replace(/^https?:\/\//, "").split("/")[0])),
        );
        res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ results }));
      } catch {
        res.writeHead(400, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad request" }));
      }
    });
    return;
  }

  // ── Steam status proxy ──────────────────────────────────────────────
  // The browser can't fetch crowbar.steamstat.us directly (no CORS headers),
  // so it always fell back to "unknown" (gray). We fetch it here from Node —
  // no CORS restriction — and hand the JSON back to the dashboard.
  if (req.method === "GET" && req.url === "/steam") {
    fetch("https://crowbar.steamstat.us/Barney", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://steamstat.us/",
        Origin: "https://steamstat.us",
      },
    })
      .then((r) => r.json())
      .then((json) => {
        res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      })
      .catch((e) => {
        res.writeHead(502, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e?.message || e) }));
      });
    return;
  }

  // ── VNC launcher ────────────────────────────────────────────────────
  // Spawns UltraVNC directly on the operator PC (no .bat download needed).
  if (req.method === "POST" && req.url === "/vnc") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 10_000) req.destroy();
    });
    req.on("end", () => {
      try {
        const { viewerPath, host, port, password } = JSON.parse(body || "{}");
        if (!viewerPath || !host) throw new Error("viewerPath and host required");
        const args = ["-connect", `${host}:${port || 5900}`];
        if (password) args.push("-password", String(password));
        execFile(String(viewerPath), args, () => {});
        res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { ...CORS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      }
    });
    return;
  }

  // ── QoS → Mikrotik ──────────────────────────────────────────────────
  // Sets a per-station simple-queue bandwidth limit via the Mikrotik REST API.
  // Configure once with env vars, e.g. in package.json or your shell:
  //   MIKROTIK_HOST=192.168.3.1  MIKROTIK_USER=admin  MIKROTIK_PASS=secret
  // Station IP defaults to 192.168.3.1<nn> for VIP<nn>.
  if (req.method === "POST" && req.url === "/qos") {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 10_000) req.destroy();
    });
    req.on("end", () => {
      void handleQos(body)
        .then((result) => {
          res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        })
        .catch((e) => {
          res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
        });
    });
    return;
  }

  // ── Power control (WoL / Shutdown / Restart / Logoff) ────────────────
  if (req.method === "POST" && req.url === "/power") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 10_000) req.destroy(); });
    req.on("end", () => {
      void handlePower(body)
        .then((r) => { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify(r)); })
        .catch((e) => { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(e?.message || e) })); });
    });
    return;
  }

  // ── LanCache SSH tail ────────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/cache/tail") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 20_000) req.destroy(); });
    req.on("end", () => {
      void handleCacheTail(body)
        .then((r) => { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify(r)); })
        .catch((e) => { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, lines: [], error: String(e?.message || e) })); });
    });
    return;
  }

  // ── GoodSync deploy (Fortnite / FallGuys) ────────────────────────────
  if (req.method === "POST" && (req.url === "/goodsync/start" || req.url === "/goodsync/cancel" || req.url === "/goodsync/share")) {
    let body = "";
    const url = req.url;
    req.on("data", (c) => { body += c; if (body.length > 10_000) req.destroy(); });
    req.on("end", () => {
      const p =
        url === "/goodsync/start"  ? handleGsStart(body)  :
        url === "/goodsync/cancel" ? handleGsCancel(body) :
                                     handleGsShare(body);
      void p
        .then((r) => { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify(r)); })
        .catch((e) => { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(e?.message || e) })); });
    });
    return;
  }
  if (req.method === "GET" && req.url === "/goodsync/status") {
    res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, jobs: listGsJobs() }));
  }

  // ── Client screen actions (message / 15s warning) ─────────────────────
  if (req.method === "POST" && (req.url === "/message" || req.url === "/punish")) {
    let body = "";
    const url = req.url;
    req.on("data", (c) => { body += c; if (body.length > 30_000) req.destroy(); });
    req.on("end", () => {
      const p = url === "/message" ? handleClientMessage(body) : handlePunish(body);
      void p
        .then((r) => { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify(r)); })
        .catch((e) => { res.writeHead(200, { ...CORS, "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(e?.message || e) })); });
    });
    return;
  }

  res.writeHead(404, CORS);
  res.end();
});

// SSH client — imported lazily to keep boot fast.
let _SshClient = null;
async function getSshClient() {
  if (_SshClient) return _SshClient;
  const mod = await import("ssh2");
  _SshClient = mod.Client || mod.default?.Client;
  return _SshClient;
}

async function handleCacheTail(body) {
  const { host, port, user, pass, path, lines } = JSON.parse(body || "{}");
  if (!host || !user || !path) return { ok: false, lines: [], error: "host, user, path required" };
  const n = Math.min(2000, Math.max(1, Number(lines) || 400));
  const safePath = String(path).replace(/[`$;&|<>"'\\]/g, "");
  const Client = await getSshClient();
  return await new Promise((resolve) => {
    const conn = new Client();
    let out = "";
    let err = "";
    const done = (result) => { try { conn.end(); } catch { /* ignore */ } resolve(result); };
    const timer = setTimeout(() => done({ ok: false, lines: [], error: "ssh timeout" }), 8000);
    conn.on("ready", () => {
      conn.exec(`tail -n ${n} ${safePath}`, (e, stream) => {
        if (e) { clearTimeout(timer); return done({ ok: false, lines: [], error: e.message }); }
        stream.on("close", () => {
          clearTimeout(timer);
          const arr = out.split(/\r?\n/).filter(Boolean);
          done({ ok: true, lines: arr, error: err || undefined });
        }).on("data", (d) => { out += d.toString(); })
          .stderr.on("data", (d) => { err += d.toString(); });
      });
    }).on("error", (e) => { clearTimeout(timer); done({ ok: false, lines: [], error: e.message }); })
      .connect({ host, port: Number(port) || 22, username: user, password: pass, readyTimeout: 6000 });
  });
}


function sendMagicPacket(mac, broadcast = "255.255.255.255") {
  return new Promise((resolve, reject) => {
    const hex = mac.replace(/[^0-9a-fA-F]/g, "");
    if (hex.length !== 12) return reject(new Error("bad MAC"));
    const macBuf = Buffer.from(hex, "hex");
    const pkt = Buffer.alloc(6 + 16 * 6, 0xff);
    for (let i = 0; i < 16; i++) macBuf.copy(pkt, 6 + i * 6);
    const sock = createSocket("udp4");
    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(pkt, 0, pkt.length, 9, broadcast, (err) => {
        sock.close();
        err ? reject(err) : resolve();
      });
    });
  });
}

async function handlePower(body) {
  const { action, machine, host, mac, user, pass } = JSON.parse(body || "{}");
  if (action === "wol") {
    if (!mac) return { ok: false, error: "MAC not set (configure in Settings)" };
    await sendMagicPacket(mac);
    return { ok: true, note: `magic packet → ${mac}` };
  }
  if (!host) return { ok: false, error: "host required" };
  const IS_WIN = platform() === "win32";
  if (!IS_WIN) return { ok: false, error: "remote power actions require Windows operator PC" };
  // Windows shutdown.exe: /s shutdown, /r restart, /l logoff (local only)
  // For remote logoff we use `logoff` via `query session`. Simplest: shutdown /m + /s /r
  const flag = action === "shutdown" ? "/s" : action === "restart" ? "/r" : action === "logoff" ? "/l" : null;
  if (!flag) return { ok: false, error: `unknown action ${action}` };
  if (action === "logoff") {
    // Remote logoff: use PsExec-style fallback → try `shutdown /m /l` (works with proper perms via net use)
    // Best-effort: mount IPC$ with creds then invoke logoff via wmic if available.
    const args = ["/m", `\\\\${host}`, "/l", "/f"];
    return await runShutdown(args, user, pass, host, machine);
  }
  const args = ["/m", `\\\\${host}`, flag, "/t", "0", "/f"];
  return await runShutdown(args, user, pass, host, machine);
}

function runShutdown(args, user, pass, host, machine) {
  return new Promise((resolve) => {
    const flag = args.includes("/l") ? "/l" : args.includes("/r") ? "/r" : "/s";

    // Try Windows built-in `shutdown /m \\host …` first.
    const tryShutdown = () =>
      execFile("shutdown", args, { timeout: 8000 }, (err, _out, stderr) => {
        if (!err) return resolve({ ok: true, note: `shutdown → ${machine}` });
        const msg = (stderr || err.message || "").toString().trim();
        const accessDenied = /access is denied|denied\.?\s*\(5\)|\b5\b/i.test(msg);
        if (accessDenied && user && pass) return tryPsExec(msg);
        resolve({ ok: false, error: msg.slice(0, 200) });
      });

    // Fallback #1: PsExec (Sysinternals) — most reliable for admin ops with creds.
    const tryPsExec = (prevMsg) => {
      const psexec = process.env.PSEXEC_PATH || "psexec.exe";
      const psArgs =
        flag === "/l"
          ? [`\\\\${host}`, "-u", user, "-p", pass, "-h", "-accepteula", "shutdown", "/l", "/f"]
          : [`\\\\${host}`, "-u", user, "-p", pass, "-h", "-accepteula", "shutdown", flag, "/t", "0", "/f"];
      execFile(psexec, psArgs, { timeout: 15000 }, (err, _out, stderr) => {
        if (!err) return resolve({ ok: true, note: `psexec → ${machine}` });
        // PsExec not installed → try WMIC as last resort.
        if (err.code === "ENOENT") return tryWmic(prevMsg);
        const msg = (stderr || err.message || "").toString().trim();
        if (/access is denied|denied|\b5\b/i.test(msg)) return tryWmic(prevMsg);
        resolve({ ok: false, error: `psexec: ${msg.slice(0, 200)}` });
      });
    };

    // Fallback #2: WMIC remote process create — works when RPC/WMI allowed.
    const tryWmic = (prevMsg) => {
      const shutdownFlag = flag === "/l" ? "logoff" : flag === "/r" ? "reboot" : "shutdown";
      // Note: WMIC's Win32Shutdown values: 0 logoff, 1 shutdown, 2 reboot, 4 force, 6 force+reboot, 5 force+shutdown, 8 poweroff
      const code = shutdownFlag === "logoff" ? 4 : shutdownFlag === "reboot" ? 6 : 5;
      const wmicArgs = [
        "/node:" + host,
        "/user:" + user,
        "/password:" + pass,
        "os",
        "call",
        "win32shutdown",
        String(code),
      ];
      execFile("wmic", wmicArgs, { timeout: 15000 }, (err, _out, stderr) => {
        if (!err) return resolve({ ok: true, note: `wmic → ${machine}` });
        if (err.code === "ENOENT") {
          return resolve({
            ok: false,
            error: `access denied and no PsExec/WMIC available. ${prevMsg.slice(0, 120)}`,
          });
        }
        const msg = (stderr || err.message || "").toString().trim();
        resolve({ ok: false, error: `wmic: ${msg.slice(0, 200)} | shutdown: ${prevMsg.slice(0, 120)}` });
      });
    };

    // Establish auth to remote IPC$ first (best-effort) then run.
    if (user && pass) {
      execFile("net", ["use", `\\\\${host}\\IPC$`, `/user:${user}`, pass], { timeout: 5000 }, () => tryShutdown());
    } else tryShutdown();
  });
}

// Tier → Mikrotik max-limit (upload/download). "UNL" removes the limit.
const TIER_LIMIT = {
  "500K": "1M/512k",
  "1M": "1M/1M",
  "2M": "2M/2M",
};

async function handleQos(body) {
  const parsed = JSON.parse(body || "{}");
  const backend = parsed.backend || "mikrotik";
  if (backend === "netlimiter") return handleQosNetLimiter(parsed);
  return handleQosMikrotik(parsed);
}

async function handleQosMikrotik({ machine, enabled, tier }) {
  const host = process.env.MIKROTIK_HOST;
  const user = process.env.MIKROTIK_USER;
  const pass = process.env.MIKROTIK_PASS;
  if (!host || !user) {
    return { ok: false, note: "mikrotik not configured (set MIKROTIK_HOST/USER/PASS)" };
  }
  const nn = String(machine || "").replace(/\D/g, "").padStart(2, "0");
  const target = `${process.env.MIKROTIK_SUBNET || "192.168.3.1"}${nn}`;
  const queueName = `qos-${machine}`;
  const auth = "Basic " + Buffer.from(`${user}:${pass || ""}`).toString("base64");
  const base = `https://${host}/rest`;
  const opts = (method, payload) => ({
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const listRes = await fetch(
    `${base}/queue/simple?name=${encodeURIComponent(queueName)}`,
    opts("GET"),
  );
  const list = listRes.ok ? await listRes.json() : [];
  const existing = Array.isArray(list) && list[0];
  const limit = enabled && tier !== "off" && tier !== "UNL" ? TIER_LIMIT[tier] : null;
  const disabled = !enabled || tier === "off";
  if (existing) {
    const payload = { target, "max-limit": limit || "0/0", disabled: disabled || !limit ? "true" : "false" };
    await fetch(`${base}/queue/simple/${existing[".id"]}`, opts("PATCH", payload));
  } else {
    const payload = { name: queueName, target, "max-limit": limit || "0/0", disabled: disabled || !limit ? "true" : "false" };
    await fetch(`${base}/queue/simple`, opts("PUT", payload));
  }
  return { ok: true, backend: "mikrotik", machine, tier, limit: limit || "unlimited" };
}

// NetLimiter Pro 4 tier → bytes/sec (per direction). "UNL" disables the rule.
const NL_TIER_BPS = {
  "500K": 500 * 1024 / 8,   // 500 kbit/s → 64000 B/s
  "1M":   1 * 1024 * 1024 / 8,
  "2M":   2 * 1024 * 1024 / 8,
};

// Runs nlq.exe on the target VIP over PsExec. Expects a per-tier rule already
// created on each client (see Setup-NetLimiter-Rules.ps1 shipped with the repo).
// Rule names: Exir-500K, Exir-1M, Exir-2M, Exir-UNL. Only one is enabled at a time.
async function handleQosNetLimiter({ machine, enabled, tier }) {
  const nlq = process.env.NETLIMITER_NLQ || "C:\\Program Files\\Locktime Software\\NetLimiter 4\\nlq.exe";
  const user = process.env.CLIENT_ADMIN_USER || process.env.MIKROTIK_USER;
  const pass = process.env.CLIENT_ADMIN_PASS || process.env.MIKROTIK_PASS;
  const nn = String(machine || "").replace(/\D/g, "").padStart(2, "0");
  const host = process.env.CLIENT_SUBNET
    ? `${process.env.CLIENT_SUBNET}${nn}`
    : `${process.env.MIKROTIK_SUBNET || "192.168.3.1"}${nn}`;
  const machineHost = machine || `VIP${nn}`;

  const tiers = ["500K", "1M", "2M", "UNL"];
  const activeTier = enabled && tier !== "off" ? tier : null;

  // Build a batch of nlq calls: disable all rules first, then enable the active one.
  // nlq.exe SetLimit /rule="<name>" /dir=both /enable=<0|1> /limit=<bytes>
  const cmds = [];
  for (const t of tiers) {
    cmds.push({ rule: `Exir-${t}`, enable: 0, limit: 0 });
  }
  if (activeTier === "UNL") {
    cmds.push({ rule: "Exir-UNL", enable: 1, limit: 0 });
  } else if (activeTier) {
    const bps = Math.round(NL_TIER_BPS[activeTier] || 0);
    cmds.push({ rule: `Exir-${activeTier}`, enable: 1, limit: bps });
  }

  const commandLines = cmds.map((c) => `& '${nlq.replace(/'/g, "''")}' SetLimit '/rule=${c.rule}' '/dir=both' '/enable=${c.enable}' '/limit=${c.limit}'`).join("\n");
  const remote = await runRemotePowerShell({
    host, user, pass, timeout: 20000,
    script: `$ErrorActionPreference='Stop'\n${commandLines}\n'netlimiter qos applied'`,
  });
  const ok = remote.ok;
  return {
    ok,
    backend: "netlimiter",
    machine: machineHost,
    host,
    tier: activeTier || "off",
    limit_bps: activeTier && activeTier !== "UNL" ? Math.round(NL_TIER_BPS[activeTier]) : (activeTier === "UNL" ? "unlimited" : 0),
    method: remote.method,
    error: remote.ok ? undefined : remote.error,
    results: cmds.map((c) => ({ rule: c.rule, ok })),
  };
}

function psQuote(s) {
  return String(s || "").replace(/'/g, "''");
}

function overlayScript({ title, message, seconds = 15, severe = false }) {
  const sec = Math.max(3, Math.min(60, Number(seconds) || 15));
  const body = psQuote(message || (severe ? "اخطار جدی" : "پیام مدیریت"));
  const ttl = psQuote(title || (severe ? "WARNING" : "EXIR MESSAGE"));
  return `
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$seconds=${sec}; $remaining=$seconds
$window=New-Object Windows.Window
$window.WindowStyle='None'; $window.ResizeMode='NoResize'; $window.Topmost=$true; $window.ShowInTaskbar=$false
$window.WindowState='Maximized'; $window.Background=[Windows.Media.Brushes]::Transparent
$window.Add_Closing({ if ($script:remaining -gt 0) { $_.Cancel=$true } })
$window.Add_PreviewKeyDown({ if ($_.Key -eq 'Escape' -or ($_.SystemKey -eq 'F4') -or ($_.KeyboardDevice.Modifiers -ne 'None')) { $_.Handled=$true } })
$root=New-Object Windows.Controls.Grid
$root.Background=(New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromArgb(210,4,8,18)))
$card=New-Object Windows.Controls.Border
$card.Width=760; $card.MinHeight=420; $card.CornerRadius='28'; $card.Padding='34'; $card.BorderThickness='2'
$card.BorderBrush=(New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromRgb(255,55,85)))
$card.Background=(New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromArgb(175,15,23,42)))
$card.Effect=New-Object Windows.Media.Effects.DropShadowEffect -Property @{ Color=[Windows.Media.Colors]::Red; BlurRadius=38; ShadowDepth=0; Opacity=.85 }
$panel=New-Object Windows.Controls.StackPanel
$icon=New-Object Windows.Controls.TextBlock
$icon.Text='⚠'; $icon.FontSize=112; $icon.HorizontalAlignment='Center'; $icon.Foreground=(New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromRgb(255,45,85)))
$label=New-Object Windows.Controls.TextBlock
$label.Text='${ttl}'; $label.FontSize=32; $label.FontWeight='Black'; $label.TextAlignment='Center'; $label.Foreground=[Windows.Media.Brushes]::White; $label.Margin='0,0,0,8'
$msg=New-Object Windows.Controls.TextBlock
$msg.Text='${body}'; $msg.FontSize=26; $msg.TextWrapping='Wrap'; $msg.TextAlignment='Center'; $msg.Foreground=(New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromRgb(226,232,240))); $msg.Margin='0,0,0,22'
$timer=New-Object Windows.Controls.TextBlock
$timer.Text="$remaining"; $timer.FontSize=56; $timer.FontWeight='Black'; $timer.TextAlignment='Center'; $timer.Foreground=(New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromRgb(34,211,238)))
$bar=New-Object Windows.Controls.ProgressBar
$bar.Minimum=0; $bar.Maximum=$seconds; $bar.Value=$seconds; $bar.Height=18; $bar.Margin='40,18,40,0'; $bar.Foreground=(New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromRgb(255,45,85)))
$panel.Children.Add($icon)|Out-Null; $panel.Children.Add($label)|Out-Null; $panel.Children.Add($msg)|Out-Null; $panel.Children.Add($timer)|Out-Null; $panel.Children.Add($bar)|Out-Null
$card.Child=$panel; $root.Children.Add($card)|Out-Null; $window.Content=$root
$beep=New-Object Windows.Threading.DispatcherTimer; $beep.Interval=[TimeSpan]::FromMilliseconds(650)
$beep.Add_Tick({ [Console]::Beep(1200,160) })
$tick=New-Object Windows.Threading.DispatcherTimer; $tick.Interval=[TimeSpan]::FromSeconds(1)
$tick.Add_Tick({ $script:remaining--; $timer.Text=[string]$script:remaining; $bar.Value=$script:remaining; if ($script:remaining -le 0) { $beep.Stop(); $tick.Stop(); $window.Close() } })
$window.Add_Loaded({ $beep.Start(); $tick.Start(); $window.Activate() })
$window.ShowDialog() | Out-Null
`;
}

async function runInteractiveOverlay({ host, user, pass, script, timeout = 30000 }) {
  const psexec = process.env.PSEXEC_PATH || "psexec.exe";
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const px = await runExe(psexec, [
    "-accepteula", "-nobanner", `\\\\${host}`,
    ...(user ? ["-u", user] : []), ...(pass ? ["-p", pass] : []),
    "-h", "-i", "-d", "powershell.exe", "-STA", "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded,
  ], timeout);
  if (px.ok) return { ok: true, method: "psexec-interactive" };
  const msg = await runExe("msg.exe", ["/SERVER:" + host, "*", "/TIME:15", script.includes("اخطار") ? "اخطار جدی مدیریت" : "پیام مدیریت"], 8000);
  if (msg.ok) return { ok: true, method: "msg-fallback" };
  return { ok: false, method: "failed", error: `psexec: ${(px.stderr || px.error).slice(0, 140)} | msg: ${(msg.stderr || msg.error).slice(0, 140)}` };
}

async function handlePunish(body) {
  const { machine, host: postedHost, seconds, message } = JSON.parse(body || "{}");
  if (!machine && !postedHost) return { ok: false, error: "machine required" };
  const host = hostForMachine(machine, postedHost);
  const user = process.env.CLIENT_ADMIN_USER || process.env.MIKROTIK_USER;
  const pass = process.env.CLIENT_ADMIN_PASS || process.env.MIKROTIK_PASS;
  const r = await runInteractiveOverlay({ host, user, pass, timeout: 25000, script: overlayScript({ title: "هشدار جدی", message: message || "لطفاً قوانین سیستم را رعایت کنید", seconds: seconds || 15, severe: true }) });
  return { ...r, machine, host };
}

async function handleClientMessage(body) {
  const { machine, host: postedHost, title, message, seconds } = JSON.parse(body || "{}");
  if (!machine && !postedHost) return { ok: false, error: "machine required" };
  if (!message) return { ok: false, error: "message required" };
  const host = hostForMachine(machine, postedHost);
  const user = process.env.CLIENT_ADMIN_USER || process.env.MIKROTIK_USER;
  const pass = process.env.CLIENT_ADMIN_PASS || process.env.MIKROTIK_PASS;
  const r = await runInteractiveOverlay({ host, user, pass, timeout: 25000, script: overlayScript({ title: title || "EXIR MESSAGE", message, seconds: seconds || 15, severe: false }) });
  return { ...r, machine, host };
}

// ── GoodSync CLI runner ─────────────────────────────────────────────────
// Runs gs-runner.exe (GoodSync 10+ CLI) sequentially for the jobs mapped
// to each VIP + game. Jobs must already exist in GoodSync (import the
// shipped FortniteFallGuys-Combined.tix once on the operator PC).
//
// Job naming convention (see the .tix file):
//   NN_Fort              → H:\Epic Games
//   NN_Fort_local        → AppData\Local\{EpicGamesLauncher, FortniteGame}
//   NN_Fort_ProgramData  → C:\ProgramData\Epic
//   NN_FallGuys_local    → local FallGuys install
// where NN is the two-digit VIP number.
//
// Configure via env (default path shown):
//   GOODSYNC_PATH=C:\Program Files\Siber Systems\GoodSync\gs-runner.exe
//
// ShareEpicFolders.ps1 is spawned remotely using WinRM / Scheduled Task / PsExec
// fallback with the same CLIENT_ADMIN_USER/PASS + CLIENT_SUBNET envs.

// key → { machine, game, jobs, proc, startedAt, finishedAt, running, ok, exitCode, lastLine, error }
const GS_JOBS = new Map();
const GS_MAX_HISTORY = 20;

function vipNN(m) { return String(m || "").replace(/\D/g, "").padStart(2, "0"); }

function jobsFor(machine, game) {
  const nn = vipNN(machine);
  if (game === "fortnite") return [`${nn}_Fort`, `${nn}_Fort_local`, `${nn}_Fort_ProgramData`];
  if (game === "fallguys") return [`${nn}_FallGuys_local`];
  return [];
}

function listGsJobs() {
  return Array.from(GS_JOBS.values()).map((j) => ({
    key: j.key, machine: j.machine, game: j.game, jobs: j.jobs,
    startedAt: j.startedAt, finishedAt: j.finishedAt,
    running: j.running, ok: j.ok, exitCode: j.exitCode,
    lastLine: j.lastLine, error: j.error,
  }));
}

function trimHistory() {
  const finished = Array.from(GS_JOBS.values()).filter((j) => !j.running).sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));
  while (finished.length > GS_MAX_HISTORY) {
    const drop = finished.shift();
    GS_JOBS.delete(drop.key);
  }
}

async function handleGsStart(body) {
  const { machine, game } = JSON.parse(body || "{}");
  if (!machine || !game) return { ok: false, error: "machine and game required" };
  const jobs = jobsFor(machine, game);
  if (!jobs.length) return { ok: false, error: `unknown game ${game}` };

  const gsPath = process.env.GOODSYNC_PATH || "C:\\Program Files\\Siber Systems\\GoodSync\\gs-runner.exe";
  const key = `${machine}:${game}:${Date.now()}`;
  const rec = {
    key, machine, game, jobs, startedAt: Date.now(),
    running: true, lastLine: `queued ${jobs.length} job(s)`,
    proc: null, ok: undefined, exitCode: null, error: undefined, finishedAt: undefined,
  };
  GS_JOBS.set(key, rec);

  // Run jobs sequentially so we can attribute a failure.
  (async () => {
    try {
      for (const job of jobs) {
        rec.lastLine = `sync ${job}`;
        // gs-runner: sync <jobname> /exit — quiet CLI mode.
        const args = ["sync", job, "/exit"];
        const exit = await new Promise((resolve) => {
          let proc;
          try {
            proc = spawn(gsPath, args, { windowsHide: true });
          } catch (e) {
            return resolve({ code: -1, err: String(e?.message || e) });
          }
          rec.proc = proc;
          let last = "";
          const onData = (d) => {
            const s = d.toString().trim();
            if (s) { last = s.split(/\r?\n/).pop() || last; rec.lastLine = `${job}: ${last.slice(0, 80)}`; }
          };
          proc.stdout?.on("data", onData);
          proc.stderr?.on("data", onData);
          proc.on("error", (e) => resolve({ code: -1, err: e.code === "ENOENT" ? `gs-runner not found at ${gsPath}` : e.message }));
          proc.on("close", (code) => resolve({ code, err: null }));
        });
        rec.proc = null;
        if (exit.err) throw new Error(exit.err);
        if (exit.code !== 0) throw new Error(`${job} exited ${exit.code}`);
      }
      rec.ok = true; rec.exitCode = 0; rec.lastLine = `✓ all ${jobs.length} job(s) done`;
    } catch (e) {
      rec.ok = false; rec.error = String(e?.message || e); rec.exitCode = -1;
    } finally {
      rec.running = false; rec.finishedAt = Date.now();
      trimHistory();
    }
  })();

  return { ok: true, key, jobs };
}

async function handleGsCancel(body) {
  const { key } = JSON.parse(body || "{}");
  const rec = GS_JOBS.get(key);
  if (!rec) return { ok: false, error: "unknown key" };
  if (!rec.running) return { ok: true, note: "already finished" };
  try { rec.proc?.kill("SIGTERM"); } catch { /* ignore */ }
  rec.running = false;
  rec.ok = false;
  rec.error = "cancelled";
  rec.finishedAt = Date.now();
  return { ok: true };
}

async function handleGsShare(body) {
  const { machine } = JSON.parse(body || "{}");
  if (!machine) return { ok: false, error: "machine required" };
  if (platform() !== "win32") return { ok: false, error: "requires Windows operator PC" };

  const nn = vipNN(machine);
  const host = process.env.CLIENT_SUBNET
    ? `${process.env.CLIENT_SUBNET}${nn}`
    : `${process.env.MIKROTIK_SUBNET || "192.168.3.1"}${nn}`;
  const user = process.env.CLIENT_ADMIN_USER || process.env.MIKROTIK_USER;
  const pass = process.env.CLIENT_ADMIN_PASS || process.env.MIKROTIK_PASS;
  const scriptPath = path.join(__dirname, "ShareEpicFolders.ps1");

  let script;
  try { script = readFileSync(scriptPath, "utf8"); } catch (e) { return { ok: false, error: `cannot read ShareEpicFolders.ps1: ${e.message}` }; }
  const r = await runRemotePowerShell({ host, user, pass, script, timeout: 60_000 });
  return r.ok
    ? { ok: true, note: `shares configured on ${host} via ${r.method}` }
    : { ok: false, error: r.error || "remote share failed" };
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  ⚡ EXIR ping agent ready → http://localhost:${PORT}  (real ICMP ping)\n`);
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.log(`  ℹ️  Ping agent already running on port ${PORT} — skipping.`);
  } else {
    console.error("  ping agent error:", e.message);
  }
});
