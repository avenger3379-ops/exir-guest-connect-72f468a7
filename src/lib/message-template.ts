// ─────────────────────────────────────────────────────────────────────────
// Message popup template — a single, self-contained HTML document string.
//
// Used in TWO places:
//   1) Live preview inside the "Send Message" modal (<iframe srcDoc={...}>).
//   2) The real popup: the agent saves this string as a .hta file and runs
//      it on the client PC via `mshta.exe` (see ping-agent.mjs → /message).
//
// #2 is opened by mshta.exe (Internet Explorer 11 / MSHTML engine), so the
// markup is written to be IE11-safe on purpose:
//   - no CSS custom properties / var() (not supported by MSHTML)
//   - no oklch()/lab() colors — plain hex/rgba only
//   - no real backdrop-filter (unsupported) — the "glass" look is faked with
//     a semi-transparent panel over soft glow blobs painted on the body, so
//     it reads as glassmorphism without needing a real blur filter
//   - JS is ES5 only: no const/let, no arrow functions, no template strings
// Keeping it IE11-safe costs nothing in a modern browser preview, so one
// template safely serves both consumers.
// ─────────────────────────────────────────────────────────────────────────

import { NOTIFICATION_SOUND_BASE64 } from "./notification-sound";

export interface MessageButtonOpt {
  label: string;
}

export interface BuildMessageOptions {
  text: string;
  theme: "dark" | "light";
  machineLabel?: string; // e.g. "VIP10" — shown as a small tag
  imageDataUrl?: string; // optional image shown inside the message
  logoDataUrl?: string; // optional gamenet logo (data: URL)
  countdownSeconds?: number; // big digital countdown, e.g. "5:00 تا خاموش شدن سیستم"
  countdownLabel?: string; // e.g. "تا خاموش شدن سیستم"
  autoCloseSeconds?: number; // Discord/Steam-style toast: auto-dismiss with a shrinking bar
  soundOn?: boolean; // play a short notification chime on open (default: true)
  buttons: MessageButtonOpt[]; // 1–2 buttons
  fontRegularBase64?: string; // Vazirmatn Regular, base64 (no data: prefix)
  fontBoldBase64?: string; // Vazirmatn Bold, base64 (no data: prefix)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(s: string): string {
  return escapeHtml(s).replace(/\r\n|\r|\n/g, "<br />");
}

// Fallback brand mark (a simple game controller glyph) — used only when the
// user hasn't uploaded a logo in Settings. Plain shapes only, so it also
// renders correctly under MSHTML.
function fallbackMark(accent: string): string {
  return (
    '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M6.5 8.5h13a4 4 0 0 1 4 4.6l-.8 5a3 3 0 0 1-5.3 1.4L15.8 17H10.2l-1.6 2.5a3 3 0 0 1-5.3-1.4l-.8-5a4 4 0 0 1 4-4.6Z" ' +
    'fill="none" stroke="' + accent + '" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<line x1="7.6" y1="12.8" x2="7.6" y2="15.6" stroke="' + accent + '" stroke-width="1.6" stroke-linecap="round"/>' +
    '<line x1="6.2" y1="14.2" x2="9" y2="14.2" stroke="' + accent + '" stroke-width="1.6" stroke-linecap="round"/>' +
    '<circle cx="17" cy="12.8" r="1.05" fill="' + accent + '"/>' +
    '<circle cx="19.2" cy="15" r="1.05" fill="' + accent + '"/>' +
    "</svg>"
  );
}

export function buildMessageHtml(opts: BuildMessageOptions): string {
  const isDark = opts.theme !== "light";
  const soundOn = opts.soundOn !== false;

  // ── Palette ──────────────────────────────────────────────────────────
  const bgGrad = isDark
    ? "linear-gradient(160deg,#0a0e1a 0%,#101527 45%,#150f22 100%)"
    : "linear-gradient(160deg,#eef1f8 0%,#e7ecf7 45%,#eaf3f2 100%)";
  const cardBg = isDark ? "rgba(22,28,46,0.62)" : "rgba(255,255,255,0.62)";
  const cardBorder = isDark ? "rgba(255,255,255,0.14)" : "rgba(20,30,50,0.10)";
  const textColor = isDark ? "#f0f4ff" : "#171b26";
  const subColor = isDark ? "#93a3c4" : "#5c6577";
  const accent = isDark ? "#39e6c8" : "#0d9488";
  const accent2 = isDark ? "#ff5fd4" : "#d6336c";
  const shadow = isDark
    ? "0 30px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.05) inset"
    : "0 30px 60px rgba(30,40,70,.18), 0 0 0 1px rgba(255,255,255,.5) inset";
  const btnPrimaryBg = isDark ? "#39e6c8" : "#0d9488";
  const btnPrimaryText = isDark ? "#08150f" : "#ffffff";
  const btnGhostBorder = isDark ? "rgba(255,255,255,.16)" : "rgba(20,30,50,.14)";
  const barTrack = isDark ? "rgba(255,255,255,.08)" : "rgba(20,30,50,.08)";

  // ── Fonts ────────────────────────────────────────────────────────────
  const fontFaces: string[] = [];
  if (opts.fontRegularBase64) {
    fontFaces.push(
      "@font-face{font-family:'Vazirmatn';font-weight:400;font-style:normal;" +
        "src:url(data:font/woff2;base64," + opts.fontRegularBase64 + ") format('woff2');}"
    );
  }
  if (opts.fontBoldBase64) {
    fontFaces.push(
      "@font-face{font-family:'Vazirmatn';font-weight:700;font-style:normal;" +
        "src:url(data:font/woff2;base64," + opts.fontBoldBase64 + ") format('woff2');}"
    );
  }
  const fontStack = "'Vazirmatn','Segoe UI','Tahoma','B Nazanin',Arial,sans-serif";

  // ── Content blocks ───────────────────────────────────────────────────
  const countdownBlock =
    opts.countdownSeconds && opts.countdownSeconds > 0
      ? '<div class="exir-countdown">' +
        '<div class="exir-cd-time" id="exirCdTime">--:--</div>' +
        '<div class="exir-cd-label">' + escapeHtml(opts.countdownLabel || "تا پایان زمان") + "</div>" +
        "</div>"
      : "";

  const imageBlock = opts.imageDataUrl
    ? '<div class="exir-image-wrap"><img class="exir-image" src="' + opts.imageDataUrl + '" alt="" /></div>'
    : "";

  const logoBlock = opts.logoDataUrl
    ? '<img class="exir-logo" src="' + opts.logoDataUrl + '" alt="logo" />'
    : '<span class="exir-logo-mark">' + fallbackMark(isDark ? "#0a0e1a" : "#ffffff") + "</span>";

  const machineTag = opts.machineLabel
    ? '<span class="exir-tag">' + escapeHtml(opts.machineLabel) + "</span>"
    : "";

  const buttons = (opts.buttons.length ? opts.buttons : [{ label: "باشه" }])
    .slice(0, 2)
    .map(function (b, i) {
      const cls = i === 0 ? "exir-btn exir-btn-primary" : "exir-btn exir-btn-ghost";
      return '<button type="button" class="' + cls + '" onclick="exirCloseMsg()">' + escapeHtml(b.label) + "</button>";
    })
    .join("");

  const autoCloseBar =
    opts.autoCloseSeconds && opts.autoCloseSeconds > 0
      ? '<div class="exir-bar-track"><div class="exir-bar-fill" id="exirBarFill"></div></div>'
      : "";

  const soundBlock = soundOn
    ? '<audio id="exirSnd" preload="auto"><source src="data:audio/wav;base64,' + NOTIFICATION_SOUND_BASE64 + '" /></audio>'
    : "";

  const countdownSeconds = opts.countdownSeconds && opts.countdownSeconds > 0 ? opts.countdownSeconds : 0;
  const autoCloseSeconds = opts.autoCloseSeconds && opts.autoCloseSeconds > 0 ? opts.autoCloseSeconds : 0;

  return (
    "<!doctype html>\n" +
    '<html lang="fa" dir="rtl">\n' +
    "<head>\n" +
    '<meta charset="utf-8" />\n' +
    // CRITICAL: mshta.exe (the host that actually opens this file on the
    // client PC) defaults to a legacy IE7 rendering mode. In that mode,
    // gradients/rgba backgrounds, border-radius, box-shadow, flexbox and
    // the HTML5 <audio> element are all silently ignored — which is why,
    // without this line, the popup used to show up as a plain white,
    // square, unrounded box regardless of the chosen theme, and the
    // notification sound never played. This meta tag forces mshta to use
    // the real IE11/Trident engine, where all of the above work normally.
    // Modern browsers (the live preview iframe) simply ignore this tag.
    '<meta http-equiv="X-UA-Compatible" content="IE=11" />\n' +
    // hta:application is ignored (empty, no children) by real browsers; it
    // only takes effect when this file is saved as .hta and opened by
    // mshta.exe on the client PC.
    '<hta:application id="exirMsg" applicationname="ExirGamenetMessage" border="none" ' +
    'caption="no" icon="" maximizebutton="no" minimizebutton="no" showintaskbar="no" ' +
    'singleinstance="no" sysmenu="no" windowstate="normal" scroll="no" navigable="no" ' +
    'selection="no" contextmenu="no" />\n' +
    "<title>پیام گیم‌نت</title>\n" +
    "<style>\n" +
    fontFaces.join("\n") + "\n" +
    "html,body{margin:0;padding:0;height:100%;}\n" +
    "*{box-sizing:border-box;}\n" +
    "body{font-family:" + fontStack + ";background:" + bgGrad + ";color:" + textColor + ";" +
    "display:flex;align-items:center;justify-content:center;min-height:100%;padding:26px;position:relative;overflow:hidden;}\n" +
    // Soft glow "blobs" behind the glass card — this is what sells the
    // glassmorphism look without needing an unsupported backdrop-filter.
    ".exir-blob{position:absolute;border-radius:50%;opacity:.55;}\n" +
    ".exir-blob-a{width:260px;height:260px;top:-70px;left:-60px;" +
    "background:radial-gradient(circle," + accent + "55,transparent 70%);}\n" +
    ".exir-blob-b{width:300px;height:300px;bottom:-90px;right:-80px;" +
    "background:radial-gradient(circle," + accent2 + "4d,transparent 70%);}\n" +
    ".exir-card{position:relative;width:100%;max-width:480px;background:" + cardBg + ";" +
    "border:1px solid " + cardBorder + ";border-radius:22px;box-shadow:" + shadow + ";" +
    "padding:26px 26px 22px;overflow:hidden;animation:exirIn .46s cubic-bezier(.16,1,.3,1) both;}\n" +
    ".exir-card.exir-leaving{animation:exirOut .22s ease forwards;}\n" +
    "@keyframes exirIn{from{opacity:0;transform:translateY(18px) scale(.94);}to{opacity:1;transform:translateY(0) scale(1);}}\n" +
    "@keyframes exirOut{from{opacity:1;transform:translateY(0) scale(1);}to{opacity:0;transform:translateY(10px) scale(.95);}}\n" +
    ".exir-accent-bar{position:absolute;top:0;right:0;left:0;height:4px;" +
    "background:linear-gradient(90deg," + accent + "," + accent2 + ");}\n" +
    ".exir-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}\n" +
    ".exir-brand{display:flex;align-items:center;gap:11px;}\n" +
    ".exir-logo{width:38px;height:38px;border-radius:11px;object-fit:cover;" +
    "box-shadow:0 0 0 1px " + cardBorder + ";}\n" +
    ".exir-logo-mark{display:flex;align-items:center;justify-content:center;width:38px;height:38px;" +
    "border-radius:11px;background:linear-gradient(135deg," + accent + "," + accent2 + ");" +
    "box-shadow:0 6px 18px " + accent + "40;}\n" +
    ".exir-brand-text{font-size:11.5px;color:" + subColor + ";letter-spacing:.02em;}\n" +
    ".exir-brand-title{font-size:13.5px;font-weight:700;color:" + textColor + ";margin:0 0 1px;}\n" +
    ".exir-tag{font-size:10px;color:" + accent + ";border:1px solid " + cardBorder + ";border-radius:999px;" +
    "padding:3px 10px;white-space:nowrap;background:" + (isDark ? "rgba(255,255,255,.05)" : "rgba(13,148,136,.06)") + ";}\n" +
    ".exir-body{font-size:16px;line-height:2;color:" + textColor + ";margin:4px 0 4px;word-wrap:break-word;}\n" +
    ".exir-image-wrap{margin:14px 0 6px;border-radius:14px;overflow:hidden;border:1px solid " + cardBorder + ";}\n" +
    ".exir-image{display:block;width:100%;max-height:230px;object-fit:cover;}\n" +
    ".exir-countdown{margin:18px 0 6px;text-align:center;background:" +
    (isDark ? "rgba(255,255,255,.05)" : "rgba(13,148,136,.07)") +
    ";border:1px solid " + cardBorder + ";border-radius:14px;padding:14px 10px;}\n" +
    ".exir-cd-time{font-size:32px;font-weight:700;letter-spacing:.03em;color:" + accent2 + ";direction:ltr;}\n" +
    ".exir-cd-label{font-size:12px;color:" + subColor + ";margin-top:3px;}\n" +
    ".exir-actions{display:flex;gap:10px;margin-top:20px;}\n" +
    ".exir-btn{flex:1;border-radius:12px;padding:12px 10px;font-family:" + fontStack + ";font-size:14px;" +
    "font-weight:700;cursor:pointer;border:1px solid transparent;}\n" +
    ".exir-btn-primary{background:" + btnPrimaryBg + ";color:" + btnPrimaryText + ";" +
    "box-shadow:0 8px 20px " + accent + "45;}\n" +
    ".exir-btn-ghost{background:transparent;color:" + textColor + ";border-color:" + btnGhostBorder + ";}\n" +
    ".exir-bar-track{margin-top:16px;height:3px;border-radius:999px;background:" + barTrack + ";overflow:hidden;}\n" +
    ".exir-bar-fill{height:100%;width:100%;border-radius:999px;" +
    "background:linear-gradient(90deg," + accent + "," + accent2 + ");" +
    "transition:width linear;}\n" +
    "</style>\n" +
    "</head>\n" +
    "<body>\n" +
    '<span class="exir-blob exir-blob-a"></span>' +
    '<span class="exir-blob exir-blob-b"></span>' +
    '<div class="exir-card" id="exirCard">' +
    '<div class="exir-accent-bar"></div>' +
    '<div class="exir-head">' +
    '<div class="exir-brand">' + logoBlock +
    '<div><div class="exir-brand-title">پیام از مدیریت گیم‌نت</div>' +
    '<div class="exir-brand-text">اطلاع‌رسانی سیستم</div></div>' +
    "</div>" + machineTag +
    "</div>" +
    '<div class="exir-body">' + textToHtml(opts.text || "") + "</div>" +
    imageBlock +
    countdownBlock +
    '<div class="exir-actions">' + buttons + "</div>" +
    autoCloseBar +
    "</div>\n" +
    soundBlock + "\n" +
    "<script>\n" +
    "function exirRealClose(){ try{ window.close(); }catch(e){} try{ self.close(); }catch(e){} }\n" +
    "function exirCloseMsg(){\n" +
    "  var card = document.getElementById('exirCard');\n" +
    "  if (card) { card.className += ' exir-leaving'; setTimeout(exirRealClose, 230); }\n" +
    "  else { exirRealClose(); }\n" +
    "}\n" +
    "(function(){\n" +
    "  try{\n" +
    "    var w = 520, h = 640;\n" +
    "    window.resizeTo(w, h);\n" +
    "    var sw = screen.width, sh = screen.height;\n" +
    "    window.moveTo(Math.round((sw - w) / 2), Math.round((sh - h) / 2));\n" +
    "    window.focus();\n" +
    "  }catch(e){}\n" +
    // Best-effort "always on top": HTA/mshta has no native topmost flag, so
    // we periodically steal focus back for the first ~30s. Not a true
    // OS-level topmost window, but close enough for a short notification.
    "  var focusTries = 0;\n" +
    "  var focusTimer = setInterval(function(){\n" +
    "    focusTries += 1;\n" +
    "    try{ window.focus(); }catch(e){}\n" +
    "    if (focusTries > 9) clearInterval(focusTimer);\n" +
    "  }, 3000);\n" +
    (soundOn
      ? "  try{\n" +
        "    var snd = document.getElementById('exirSnd');\n" +
        "    if (snd && snd.play) { var p = snd.play(); if (p && p['catch']) p['catch'](function(){}); }\n" +
        "  }catch(e){}\n"
      : "") +
    "  var total = " + countdownSeconds + ";\n" +
    "  if (total > 0) {\n" +
    "    var el = document.getElementById('exirCdTime');\n" +
    "    var faDigits = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];\n" +
    "    function toFa(n){ var s = String(n); var out=''; for (var i=0;i<s.length;i++){ var c=s.charAt(i); out += (c>='0'&&c<='9') ? faDigits[parseInt(c,10)] : c; } return out; }\n" +
    "    function pad(n){ return n < 10 ? '0' + n : String(n); }\n" +
    "    function tick(){\n" +
    "      if (total <= 0) {\n" +
    "        if (el) el.innerHTML = toFa('۰۰:۰۰');\n" +
    "        exirCloseMsg();\n" +
    "        return;\n" +
    "      }\n" +
    "      var m = Math.floor(total / 60), s = total % 60;\n" +
    "      if (el) el.innerHTML = toFa(pad(m) + ':' + pad(s));\n" +
    "      total -= 1;\n" +
    "      setTimeout(tick, 1000);\n" +
    "    }\n" +
    "    tick();\n" +
    "  }\n" +
    "  var autoClose = " + autoCloseSeconds + ";\n" +
    "  if (autoClose > 0) {\n" +
    "    var bar = document.getElementById('exirBarFill');\n" +
    "    if (bar) {\n" +
    "      bar.style.transitionDuration = autoClose + 's';\n" +
    "      setTimeout(function(){ bar.style.width = '0%'; }, 40);\n" +
    "    }\n" +
    "    setTimeout(exirCloseMsg, autoClose * 1000);\n" +
    "  }\n" +
    "})();\n" +
    "</script>\n" +
    "</body>\n" +
    "</html>"
  );
}
