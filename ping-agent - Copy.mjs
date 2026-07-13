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
import { platform, tmpdir } from "node:os";
import { createSocket } from "node:dgram";
import { promises as fs } from "node:fs";
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

  // ── Send Message (branded popup on the client's screen) ──────────────
  if (req.method === "POST" && req.url === "/message") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 8_000_000) req.destroy(); }); // allow embedded image/font
    req.on("end", () => {
      void handleMessage(body)
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

// ─────────────────────────────────────────────────────────────────────────
// Send Message — deploys a self-contained .hta (built by the dashboard,
// message-template.ts) to the client PC and opens it with mshta.exe *inside
// the user's interactive desktop session*, so the styled popup actually
// appears on their screen (not hidden in a background session).
//
// Delivery path, same layering as power control:
//   1) net use \\host\IPC$  → authenticate with admin creds
//   2) copy the .hta to \\host\C$\Windows\Temp\ via the admin share
//   3) PsExec -i -d mshta.exe "<remote path>"  → run in interactive session
//   4) WMIC process call create (fallback if PsExec isn't installed) — note:
//      WMIC always launches in Session 0, so the popup won't be visible to
//      the user in that fallback. Install Sysinternals PsExec on the admin
//      PC (and put it on PATH) for guaranteed visibility.
// ─────────────────────────────────────────────────────────────────────────
async function handleMessage(body) {
  const { machine, host, user, pass, html } = JSON.parse(body || "{}");
  if (!host) return { ok: false, error: "host required" };
  if (!html || typeof html !== "string") return { ok: false, error: "html required" };
  const IS_WIN = platform() === "win32";
  if (!IS_WIN) return { ok: false, error: "remote message delivery requires Windows operator PC" };

  const fileName = `exir-msg-${Date.now()}.hta`;
  const localTmp = path.join(tmpdir(), fileName);
  const remoteDir = `\\\\${host}\\C$\\Windows\\Temp`;
  const remotePath = `${remoteDir}\\${fileName}`;
  const remoteLocalPath = `C:\\Windows\\Temp\\${fileName}`;

  try {
    await fs.writeFile(localTmp, html, "utf8");
  } catch (e) {
    return { ok: false, error: `could not stage temp file: ${e.message}` };
  }

  const authenticate = () =>
    new Promise((resolve) => {
      if (user && pass) {
        execFile("net", ["use", `\\\\${host}\\IPC$`, `/user:${user}`, pass], { timeout: 5000 }, () => resolve());
      } else resolve();
    });

  const copyToRemote = () =>
    fs.copyFile(localTmp, remotePath).then(
      () => ({ ok: true }),
      (e) => ({ ok: false, error: e.message }),
    );

  await authenticate();
  const copyResult = await copyToRemote();
  if (!copyResult.ok) {
    await fs.unlink(localTmp).catch(() => {});
    return {
      ok: false,
      error: `could not copy to \\\\${host}\\C$ (${copyResult.error}). Check admin creds and that Admin$/C$ sharing is enabled.`,
    };
  }

  return await new Promise((resolve) => {
    const cleanupLocal = () => fs.unlink(localTmp).catch(() => {});

    const tryPsExec = () => {
      const psArgs = [`\\\\${host}`, "-u", user, "-p", pass, "-i", "-d", "-accepteula", "mshta.exe", remoteLocalPath];
      execFile("psexec", psArgs, { timeout: 15000 }, (err, _out, stderr) => {
        cleanupLocal();
        if (!err) return resolve({ ok: true, note: `psexec → ${machine || host}` });
        if (err.code === "ENOENT") return tryWmic();
        const msg = (stderr || err.message || "").toString().trim();
        resolve({ ok: false, error: `psexec: ${msg.slice(0, 200)}` });
      });
    };

    // Fallback: WMIC can launch the process remotely, but only in Session 0
    // (non-interactive) — the window won't be visible without PsExec.
    const tryWmic = () => {
      const cmd = `mshta.exe ${remoteLocalPath}`;
      const wmicArgs = ["/node:" + host, "/user:" + user, "/password:" + pass, "process", "call", "create", cmd];
      execFile("wmic", wmicArgs, { timeout: 15000 }, (err, _out, stderr) => {
        cleanupLocal();
        if (!err) {
          return resolve({
            ok: true,
            note: `wmic → ${machine || host} (PsExec not found — window may be invisible; install PsExec for guaranteed visibility)`,
          });
        }
        const msg = (stderr || err.message || "").toString().trim();
        resolve({ ok: false, error: `no PsExec found, wmic also failed: ${msg.slice(0, 200)}` });
      });
    };

    tryPsExec();
  });
}

// ─────────────────────────────────────────────────────────────────────────
// تنظیمات مقدار هر تیر QoS — اینجا تنها جایی است که باید برای تغییر مقدار
// تیرها ویرایش شود. هر تیر هم برای MikroTik و هم برای NetLimiter از همینجا
// خونده می‌شه، پس همیشه هم‌ارز و هماهنگ می‌مونن.
//
// راه ساده‌تر (بدون دست زدن به کد): این متغیرها رو در .env ست کن، خودکار
// جایگزین مقادیر پیش‌فرض زیر می‌شن (نیازی به تغییر این فایل نیست، فقط
// ری‌استارت agent لازمه):
//
//   QOS_500K_KBYTES=500     # کیلوبایت بر ثانیه (سرعت دانلود واقعی روی کلاینت)
//   QOS_1M_KBYTES=1000
//   QOS_2M_KBYTES=2000
//
// این عدد (کیلوبایت/ثانیه) هم برای محاسبهٔ bytes/sec که به NetLimiter
// می‌فرستیم استفاده می‌شه، هم برای ساخت رشتهٔ max-limit مایکروتیک (که واحدش
// بیت/ثانیه است، پس ضرب در 8 می‌شه). یعنی کافیه فقط یک عدد رو عوض کنی.
// ─────────────────────────────────────────────────────────────────────────
function qosKBytes(envKey, fallbackKB) {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : fallbackKB;
}

function mikrotikRateString(bytesPerSec) {
  const bits = bytesPerSec * 8;
  if (bits >= 1_000_000 && bits % 1_000_000 === 0) return `${bits / 1_000_000}M`;
  if (bits >= 1_000 && bits % 1_000 === 0) return `${bits / 1_000}k`;
  return String(bits);
}

// کیلوبایت/ثانیه تعریف‌شده برای هر تیر (پیش‌فرض‌ها: 500K=500KB/s, 1M=1000KB/s, 2M=2000KB/s)
const QOS_TIER_KBYTES = {
  "500K": qosKBytes("QOS_500K_KBYTES", 500),
  "1M": qosKBytes("QOS_1M_KBYTES", 1000),
  "2M": qosKBytes("QOS_2M_KBYTES", 2000),
};

// Tier → Mikrotik max-limit (upload/download). هر دو جهت با یک مقدار (چون
// NetLimiter هم فقط جهت دانلود رو محدود می‌کنه، برای هم‌ارزی این‌طور ساده‌تره).
// اگه خواستی آپلود/دانلود جدا باشه، این خط رو دستی ویرایش کن.
// "UNL" یعنی محدودیت برداشته می‌شه.
const TIER_LIMIT = Object.fromEntries(
  Object.entries(QOS_TIER_KBYTES).map(([tier, kb]) => {
    const rate = mikrotikRateString(kb * 1000); // KB اینجا بر مبنای 1000 (دسیمال) حساب می‌شه
    return [tier, `${rate}/${rate}`];
  }),
);

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

// NetLimiter Pro 4 tier → bytes/sec (per direction, download only). "UNL" disables the rule.
// از همون تنظیم مشترک QOS_TIER_KBYTES بالا محاسبه می‌شه تا با MikroTik هم‌ارز بمونه.
const NL_TIER_BPS = Object.fromEntries(
  Object.entries(QOS_TIER_KBYTES).map(([tier, kb]) => [tier, kb * 1000]),
);

// Runs netlimiter-qos.ps1 on the target VIP over PsExec.
//
// IMPORTANT: nlq.exe does NOT exist in NetLimiter 4.1.13 (it was a CLI tool
// from older NetLimiter versions). Instead, netlimiter-qos.ps1 talks directly
// to NetLimiter.dll via .NET reflection (Add-Type + NLClient), and maintains
// a SINGLE LimitRule on the Internet zone's download (In) direction — it
// updates LimitSize/IsEnabled on that one rule rather than juggling 4
// separate named rules. So Setup-NetLimiter-Rules.ps1 / Exir-500K.. rules
// are no longer used by this backend.
//
// The exact byte value is computed HERE (from QOS_TIER_KBYTES above) and
// passed as -Bytes on every call — the VIP-side script no longer has its
// own hardcoded tier table, so tier values can be changed in one place
// (this file / .env) without re-copying anything to any VIP.
//
// The script must be pre-copied once to NETLIMITER_QOS_SCRIPT path on every
// VIP (default C:\GameNet-Monitor\netlimiter-qos.ps1).
//
// We run PsExec with -s (execute as LocalSystem on the target). This was
// required in testing: running as the plain client admin user hit
// "Logon failure: the user has not been granted the requested logon type"
// (error 1385) even after granting SeBatchLogonRight/SeInteractiveLogonRight
// — -s sidesteps that entirely because PsExec no longer has to impersonate
// the client user for the child process, it just uses -u/-p to authenticate
// the initial connection.
//
// One-time setup needed on each VIP for PsExec auth to succeed at all
// (local/workgroup account, not domain):
//   reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f
//   reg add "HKLM\SYSTEM\CurrentControlSet\Control\Lsa" /v forceguest /t REG_DWORD /d 0 /f
// پاک کردن Session قدیمی SMB به یک هاست، قبل از هر تماس PsExec.
//
// چرا لازمه: ویندوز برای هر ترکیب «این سرور → یک IP مقصد» فقط یک Session
// SMB هم‌زمان نگه می‌داره، با یک ست credential کش‌شده. اگه یه پروسهٔ دیگه
// (مثلاً Smartlaunch که خودش هم به کلاینت‌ها وصل می‌شه، یا یه تست دستی
// قبلی) قبلاً Session باز کرده باشه با credential دیگه، تماس بعدی PsExec با
// "Access is denied" (کد 5) یا "Multiple connections..." (کد 1219) رد
// می‌شه. پاک کردن Session قبل از هر تلاش این تداخل رو حذف می‌کنه.
function clearSmbSession(host) {
  return new Promise((resolve) => {
    execFile("net", ["use", `\\\\${host}\\IPC$`, "/delete", "/y"], { timeout: 5000 }, () => {
      // نتیجه مهم نیست؛ اگه Sessionای نبود هم خطا می‌ده که بی‌ضرره.
      resolve();
    });
  });
}

async function handleQosNetLimiter({ machine, enabled, tier }) {
  const psexec = process.env.PSEXEC_PATH || "psexec.exe";
  const scriptPath = process.env.NETLIMITER_QOS_SCRIPT || "C:\\GameNet-Monitor\\netlimiter-qos.ps1";
  const user = process.env.CLIENT_ADMIN_USER || process.env.MIKROTIK_USER;
  const pass = process.env.CLIENT_ADMIN_PASS || process.env.MIKROTIK_PASS;
  const nn = String(machine || "").replace(/\D/g, "").padStart(2, "0");
  const host = process.env.CLIENT_SUBNET
    ? `${process.env.CLIENT_SUBNET}${nn}`
    : `${process.env.MIKROTIK_SUBNET || "192.168.3.1"}${nn}`;
  const machineHost = machine || `VIP${nn}`; // psexec accepts hostname too

  await clearSmbSession(host);

  const activeTier = enabled && tier !== "off" && tier ? tier : "UNL";
  const bytesArg = activeTier !== "UNL" ? String(Math.round(NL_TIER_BPS[activeTier] || 0)) : null;

  const args = [
    "-accepteula", "-nobanner",
    `\\\\${host}`,
    ...(user ? ["-u", user] : []),
    ...(pass ? ["-p", pass] : []),
    "-s",
    "cmd", "/c", "powershell", "-ExecutionPolicy", "Bypass",
    "-File", scriptPath, "-Tier", activeTier,
    ...(bytesArg ? ["-Bytes", bytesArg] : []),
  ];

  const result = await new Promise((resolve) => {
    execFile(psexec, args, { timeout: 20000, windowsHide: true }, (err, stdout, stderr) => {
      if (err && err.code === "ENOENT") {
        return resolve({ ok: false, error: "psexec not found (set PSEXEC_PATH or install PsExec)" });
      }
      // netlimiter-qos.ps1 prints exactly one JSON line on stdout; find it
      // regardless of any PsExec banner text mixed in around it.
      const text = String(stdout || "");
      const jsonLine = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.startsWith("{") && l.endsWith("}"));
      if (jsonLine) {
        try {
          return resolve(JSON.parse(jsonLine));
        } catch {
          // fall through to error handling below
        }
      }
      if (err) return resolve({ ok: false, error: (stderr || err.message || "").toString().slice(0, 200) });
      resolve({ ok: false, error: "no JSON output from netlimiter-qos.ps1", raw: text.slice(0, 200) });
    });
  });

  return {
    ok: !!result.ok,
    backend: "netlimiter",
    machine: machineHost,
    host,
    tier: activeTier,
    limit_bps: activeTier !== "UNL" ? Math.round(NL_TIER_BPS[activeTier] || 0) : "unlimited",
    ...(result.ok ? {} : { error: result.error || "unknown error" }),
  };
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
// ShareEpicFolders.ps1 is spawned remotely via PsExec using the same
// CLIENT_ADMIN_USER/PASS + CLIENT_SUBNET envs used by the power/qos flows.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const psexec = process.env.PSEXEC_PATH || "psexec.exe";
  const scriptPath = path.join(__dirname, "ShareEpicFolders.ps1");

  // Ship the script content over stdin to avoid pre-copying — PsExec supports -c to copy exe, but for ps1 we base64-embed the file into a one-liner.
  let script;
  try { script = readFileSync(scriptPath, "utf8"); } catch (e) { return { ok: false, error: `cannot read ShareEpicFolders.ps1: ${e.message}` }; }
  const b64 = Buffer.from(script, "utf16le").toString("base64");

  const args = [
    "-accepteula", "-nobanner",
    `\\\\${host}`,
    ...(user ? ["-u", user] : []),
    ...(pass ? ["-p", pass] : []),
    "-h",
    "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-EncodedCommand", b64,
  ];

  return await new Promise((resolve) => {
    execFile(psexec, args, { timeout: 60_000, windowsHide: true }, (err, _stdout, stderr) => {
      if (err && err.code === "ENOENT") return resolve({ ok: false, error: `psexec not found (set PSEXEC_PATH)` });
      if (err) return resolve({ ok: false, error: (stderr || err.message || "").toString().slice(0, 220) });
      resolve({ ok: true, note: `shares configured on ${host}` });
    });
  });
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
