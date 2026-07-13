// ─────────────────────────────────────────────────────────────────────────
// Punishment overlay — a full-screen, glass/blur "time-out" popup for a
// single client PC. Delivered through the exact same pipe as the normal
// Send Message popup (see message.ts → postHtmlToClient), so it needs no
// new agent code, no new PsExec usage, nothing extra to fight with
// SmartLaunch/UltraVNC on the client.
//
// Same MSHTML/mshta constraints as message-template.ts apply here:
//   - no CSS var()/oklch()/lab(), no real backdrop-filter
//   - JS is ES5 only
//
// Honesty note (kept here, not just in chat, so it isn't lost later):
// this is a best-effort deterrent, not an OS-level lock. A borderless,
// chromeless, refocusing full-screen HTA has no close/minimize UI and
// re-steals focus for the whole countdown, which stops a casual click-away.
// It cannot block a hardware Alt+Tab / Win key at the OS level — no script
// running in an unprivileged window can. If you need a *guaranteed* lock,
// that has to happen one level down (an agent-side input block), which is
// a separate, riskier feature — see the chat reply for that option.
// ─────────────────────────────────────────────────────────────────────────

import { NOTIFICATION_SOUND_BASE64 } from "./notification-sound";

export interface BuildPunishOptions {
  machineLabel?: string; // e.g. "VIP10"
  title?: string; // default: "تذکر مدیریت گیم‌نت"
  reason?: string; // optional short line, e.g. "رفتار نامناسب"
  seconds?: number; // countdown length, default 15
  soundOn?: boolean; // default true
  logoDataUrl?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPunishHtml(opts: BuildPunishOptions): string {
  const seconds = Math.max(1, Math.round(opts.seconds || 15));
  const soundOn = opts.soundOn !== false;
  const title = escapeHtml(opts.title || "تذکر مدیریت گیم‌نت");
  const reason = opts.reason ? escapeHtml(opts.reason) : "";
  const machineTag = opts.machineLabel
    ? '<span class="pn-tag">' + escapeHtml(opts.machineLabel) + "</span>"
    : "";
  const fontStack = "'Vazirmatn','Segoe UI','Tahoma','B Nazanin',Arial,sans-serif";

  const soundBlock = soundOn
    ? '<audio id="pnSnd" preload="auto" loop><source src="data:audio/wav;base64,' +
      NOTIFICATION_SOUND_BASE64 +
      '" /></audio>'
    : "";

  return (
    "<!doctype html>\n" +
    '<html lang="fa" dir="rtl">\n' +
    "<head>\n" +
    '<meta charset="utf-8" />\n' +
    '<hta:application id="pnPunish" applicationname="ExirGamenetPunish" border="none" ' +
    'caption="no" icon="" maximizebutton="no" minimizebutton="no" showintaskbar="no" ' +
    'singleinstance="yes" sysmenu="no" windowstate="maximize" scroll="no" navigable="no" ' +
    'selection="no" contextmenu="no" />\n' +
    "<title>تنبیه</title>\n" +
    "<style>\n" +
    "html,body{margin:0;padding:0;height:100%;width:100%;}\n" +
    "*{box-sizing:border-box;}\n" +
    "body{font-family:" +
    fontStack +
    ";background:#05060c;color:#f2f4ff;" +
    "display:flex;align-items:center;justify-content:center;min-height:100%;overflow:hidden;position:relative;}\n" +
    // Frosted-glass illusion: several oversized, heavily-blurred glow blobs
    // behind a translucent dark scrim, since MSHTML has no backdrop-filter.
    ".pn-blob{position:absolute;border-radius:50%;filter:blur(2px);opacity:.5;}\n" +
    ".pn-b1{width:60vw;height:60vw;top:-20vw;left:-15vw;background:radial-gradient(circle,#ff2d5533,transparent 70%);}\n" +
    ".pn-b2{width:55vw;height:55vw;bottom:-18vw;right:-15vw;background:radial-gradient(circle,#ff8a0033,transparent 70%);}\n" +
    ".pn-b3{width:40vw;height:40vw;top:30%;left:35%;background:radial-gradient(circle,#ff003c22,transparent 70%);}\n" +
    ".pn-scrim{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(10,8,16,.55),rgba(4,4,8,.94));}\n" +
    ".pn-noise{position:absolute;inset:0;opacity:.05;" +
    "background-image:repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 3px);}\n" +
    ".pn-card{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;padding:40px;max-width:640px;}\n" +
    ".pn-icon-wrap{position:relative;width:150px;height:150px;margin-bottom:18px;}\n" +
    "@keyframes pnBlink{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.92);}}\n" +
    ".pn-icon{width:100%;height:100%;animation:pnBlink 1s ease-in-out infinite;filter:drop-shadow(0 0 22px #ff2d4d);}\n" +
    ".pn-title{font-size:30px;font-weight:700;margin:4px 0 6px;color:#fff;text-shadow:0 0 18px #ff2d4d99;}\n" +
    ".pn-reason{font-size:15px;color:#ffb4c0;margin:0 0 22px;}\n" +
    ".pn-tag{display:inline-block;margin-bottom:14px;font-size:12px;letter-spacing:.05em;color:#ff8a9a;" +
    "border:1px solid #ff2d4d55;border-radius:999px;padding:3px 12px;background:#ff2d4d14;}\n" +
    ".pn-ring-wrap{position:relative;width:132px;height:132px;margin:6px 0 14px;}\n" +
    ".pn-ring-wrap svg{transform:rotate(-90deg);}\n" +
    ".pn-ring-track{fill:none;stroke:rgba(255,255,255,.10);stroke-width:8;}\n" +
    ".pn-ring-fill{fill:none;stroke:#ff2d4d;stroke-width:8;stroke-linecap:round;" +
    "transition:stroke-dashoffset 1s linear;}\n" +
    ".pn-ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
    "font-size:44px;font-weight:700;direction:ltr;text-shadow:0 0 14px #ff2d4d;}\n" +
    ".pn-bar-track{width:min(70vw,420px);height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;}\n" +
    ".pn-bar-fill{height:100%;width:100%;border-radius:999px;background:linear-gradient(90deg,#ff2d4d,#ff8a00);" +
    "transition:width linear;}\n" +
    ".pn-hint{margin-top:22px;font-size:12px;color:#8992ac;letter-spacing:.02em;}\n" +
    "</style>\n" +
    "</head>\n" +
    "<body>\n" +
    '<span class="pn-blob pn-b1"></span>' +
    '<span class="pn-blob pn-b2"></span>' +
    '<span class="pn-blob pn-b3"></span>' +
    '<div class="pn-scrim"></div>' +
    '<div class="pn-noise"></div>' +
    '<div class="pn-card">' +
    machineTag +
    '<div class="pn-icon-wrap">' +
    '<svg class="pn-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<polygon points="50,6 96,90 4,90" fill="none" stroke="#ff2d4d" stroke-width="7" stroke-linejoin="round"/>' +
    '<line x1="50" y1="38" x2="50" y2="64" stroke="#ff2d4d" stroke-width="8" stroke-linecap="round"/>' +
    '<circle cx="50" cy="77" r="4.5" fill="#ff2d4d"/>' +
    "</svg>" +
    "</div>" +
    '<div class="pn-title">' +
    title +
    "</div>" +
    (reason ? '<div class="pn-reason">' + reason + "</div>" : "") +
    '<div class="pn-ring-wrap">' +
    '<svg width="132" height="132" viewBox="0 0 132 132">' +
    '<circle class="pn-ring-track" cx="66" cy="66" r="58"/>' +
    '<circle class="pn-ring-fill" id="pnRing" cx="66" cy="66" r="58"/>' +
    "</svg>" +
    '<div class="pn-ring-num" id="pnNum">' +
    seconds +
    "</div>" +
    "</div>" +
    '<div class="pn-bar-track"><div class="pn-bar-fill" id="pnBar"></div></div>' +
    '<div class="pn-hint">این پیام تا پایان زمان‌سنج به‌طور خودکار بسته می‌شود</div>' +
    "</div>\n" +
    soundBlock +
    "\n" +
    "<script>\n" +
    "(function(){\n" +
    "  try{ window.resizeTo(screen.width, screen.height); window.moveTo(0,0); }catch(e){}\n" +
    "  try{ window.focus(); }catch(e){}\n" +
    // Best-effort "stay on top / stay in front": HTA has no real topmost
    // flag, so we periodically steal focus back for the full countdown.
    // This is what actually deters an idle click-away; it is not, and
    // cannot be, an OS-level input block (see file header note).
    "  var focusTimer = setInterval(function(){ try{ window.focus(); }catch(e){} }, 400);\n" +
    "  function blockKey(e){\n" +
    "    e = e || window.event;\n" +
    "    try{ e.returnValue = false; }catch(ex){}\n" +
    "    if (e.preventDefault) e.preventDefault();\n" +
    "    return false;\n" +
    "  }\n" +
    "  document.onkeydown = blockKey;\n" +
    "  document.oncontextmenu = blockKey;\n" +
    "  window.onhelp = function(){ return false; };\n" +
    // Best-effort: on MSHTML, returning a value from onbeforeunload can
    // itself block the close attempt (rather than just prompting) until
    // it's cleared below when the countdown legitimately ends.
    "  var allowClose = false;\n" +
    "  window.onbeforeunload = function(e){ if (!allowClose) { e = e || window.event; if (e) e.returnValue = ''; return ''; } };\n" +
    (soundOn
      ? "  try{\n" +
        "    var snd = document.getElementById('pnSnd');\n" +
        "    if (snd && snd.play) { var p = snd.play(); if (p && p['catch']) p['catch'](function(){}); }\n" +
        "  }catch(e){}\n"
      : "") +
    "  var total = " +
    seconds +
    ";\n" +
    "  var full = total;\n" +
    "  var ring = document.getElementById('pnRing');\n" +
    "  var num = document.getElementById('pnNum');\n" +
    "  var bar = document.getElementById('pnBar');\n" +
    "  var circumference = 2 * Math.PI * 58;\n" +
    "  if (ring) { ring.style.strokeDasharray = circumference + 'px'; ring.style.strokeDashoffset = '0px'; }\n" +
    "  if (bar) { bar.style.transitionDuration = full + 's'; setTimeout(function(){ bar.style.width = '0%'; }, 30); }\n" +
    "  function tick(){\n" +
    "    if (num) num.innerHTML = String(total);\n" +
    "    if (ring) { var frac = total / full; ring.style.strokeDashoffset = (circumference * (1 - frac)) + 'px'; }\n" +
    "    if (total <= 0) {\n" +
    "      clearInterval(focusTimer);\n" +
    "      allowClose = true;\n" +
    "      document.onkeydown = null;\n" +
    "      window.onbeforeunload = null;\n" +
    "      try{ var s = document.getElementById('pnSnd'); if (s) s.pause(); }catch(e){}\n" +
    "      try{ window.close(); }catch(e){}\n" +
    "      try{ self.close(); }catch(e){}\n" +
    "      return;\n" +
    "    }\n" +
    "    total -= 1;\n" +
    "    setTimeout(tick, 1000);\n" +
    "  }\n" +
    "  tick();\n" +
    "})();\n" +
    "</script>\n" +
    "</body>\n" +
    "</html>"
  );
}
