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
import { execFile } from "node:child_process";
import { platform } from "node:os";
import { createSocket } from "node:dgram";
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
      const psArgs =
        flag === "/l"
          ? [`\\\\${host}`, "-u", user, "-p", pass, "-h", "-accepteula", "shutdown", "/l", "/f"]
          : [`\\\\${host}`, "-u", user, "-p", pass, "-h", "-accepteula", "shutdown", flag, "/t", "0", "/f"];
      execFile("psexec", psArgs, { timeout: 15000 }, (err, _out, stderr) => {
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
  "500K": "512k/512k",
  "1M": "1M/1M",
  "2M": "2M/2M",
};

async function handleQos(body) {
  const { machine, enabled, tier } = JSON.parse(body || "{}");
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
  // Ignore self-signed cert issues on the LAN router.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  // Find existing queue for this station.
  const listRes = await fetch(
    `${base}/queue/simple?name=${encodeURIComponent(queueName)}`,
    opts("GET"),
  );
  const list = listRes.ok ? await listRes.json() : [];
  const existing = Array.isArray(list) && list[0];

  const limit = enabled && tier !== "off" && tier !== "UNL" ? TIER_LIMIT[tier] : null;
  const disabled = !enabled || tier === "off";

  if (existing) {
    const payload = {
      target,
      "max-limit": limit || "0/0",
      disabled: disabled || !limit ? "true" : "false",
    };
    await fetch(`${base}/queue/simple/${existing[".id"]}`, opts("PATCH", payload));
  } else {
    const payload = {
      name: queueName,
      target,
      "max-limit": limit || "0/0",
      disabled: disabled || !limit ? "true" : "false",
    };
    await fetch(`${base}/queue/simple`, opts("PUT", payload));
  }
  return { ok: true, machine, tier, limit: limit || "unlimited" };
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
