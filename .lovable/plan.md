
# فاز ۱ — پایان تداخل با SmartLaunch/UltraVNC/NetLimiter و اصلاح پنجرهٔ Send Message

## چرا این طرح
تک‌ریشهٔ همهٔ خطاها (`agent unreachable: Failed to fetch`, پیام‌ها که ارسال نمی‌شن، QoS که بعد از UVNC می‌پره، Discovery که کند شده و پنجرهٔ پیام که همش ری‌رندر می‌شه) یک چیز است:
سرور از راه دور روی کلاینت `PsExec` می‌زند و SmartLaunch/UltraVNC/NetLimiter مرتب آن را می‌بندند یا Handle می‌گیرند.
تنها راه پایدار: **یک عامل کوچک همیشه‌روشن روی هر کلاینت** که به سرور HTTP گوش می‌دهد — دیگر نیازی به `PsExec` برای پیام/تنبیه/QoS نیست.

## کارهایی که انجام می‌شود

### ۱) Exir Client Agent (فایل جدید، بدون هیچ وابستگی)
- فایل تازه: `Files/exir-client-agent/exir-client-agent.mjs`
  - یک سرور Node.js تک‌فایل، پورت `8766`.
  - Endpointها:
    - `POST /message`  ← پیام شیشه‌ای با تایمر/صدا/دکمه‌ها را همان‌جا با `mshta` باز می‌کند (بدون هیچ ارتباط شبکه‌ای بیرونی).
    - `POST /punish`   ← همان با کیبورد قفل + Alt+F4 خنثی.
    - `POST /netlimiter/apply` ← فوراً `nlq.exe` را محلی صدا می‌زند تا Ruleها را دوباره فعال کند (تداخل UVNC حل).
    - `GET  /health`   ← فقط `{ ok:true, machine, version }`.
  - HTML قالب کامل (تیره/روشن، بلور، لوگو، تصویر، تایمر Discord، صدا، دکمه‌ها) توی همان فایل embed می‌شود — دیگر وابسته به شبکهٔ لحظه‌ای نیست.
- فایل تازه: `Files/exir-client-agent/install-service.ps1`
  - با `nssm` (اگر بود) یا `sc.exe` یک سرویس ویندوز `ExirClientAgent` می‌سازد که در Boot اجرا می‌شود.
- فایل تازه: `Files/exir-client-agent/README.txt` — راه‌اندازی گام‌به‌گام برای هر VIP.

### ۲) `ping-agent.mjs` روی سرور
- ابتدا HTTP به `http://<client-ip>:8766/message` (تایم‌اوت ۳ ثانیه). اگر موفق شد، برگرد.
- فقط در صورت شکست، به مسیر قدیمی `PsExec/WMIC` fallback شود.
- همین منطق برای `/punish` و برای re-apply کردن NetLimiter بعد از UVNC.
- Endpoint تازه: `POST /netlimiter/reapply` که مستقیماً کلاینت `/netlimiter/apply` را صدا می‌زند.

### ۳) `src/lib/vnc-config.ts`
- بعد از بسته شدن UVNC (رویداد `beforeunload` روی پنجرهٔ VNC یا زمان‌سنج پس از launch)، به‌طور اتوماتیک `POST /netlimiter/reapply` روی کلاینت هدف زده شود تا Ruleها برگردند.

### ۴) پنجرهٔ Send Message (رفع «صفحه مدام رفرش می‌شود»)
- علت: پیش‌نمایش iframe هر ۲۰۰ms کل HTML را دوباره می‌سازد و در حین تایپ، فوکوس/اسکرول را می‌کند.
- تغییرات در `src/components/monitoring/SendMessageModal.tsx`:
  - state ورودی‌ها را با `useRef` + `React.memo` روی بخش پیش‌نمایش جدا کن.
  - پیش‌نمایش را از ۲۰۰ms به «فقط وقتی کاربر ۸۰۰ms تایپ نکرد» ببر، و از حالت iframe به یک نمونهٔ static سبک (بدون rebuild کامل) تبدیل کن.
  - پنجره را با `React.memo` و کلید ثابت (`key={machine}`) از parent جدا کن تا با ری‌فرش لیست کلاینت‌ها (هر ۳ ثانیه در `index.tsx`) هرگز re-mount نشود.
- خطای «agent unreachable»: پیام خطا واضح‌تر شود و لینک راهنمای عامل کلاینت به آن اضافه شود.

## آنچه تغییر نمی‌کند
- Discovery Engine، GoodSync، UI موجود QoS/Power، و هیچ منطق بیزینسی دیگر دست‌کاری نمی‌شود.
- ظاهر و قالب پیامی که خودت پیاده کرده‌ای حفظ می‌شود — فقط پایدار و بی‌تداخل می‌شود.

## بعد از این تغییرات، کاری که تو باید بکنی
1. پوشهٔ `Files/exir-client-agent/` را روی هر VIP کپی کن.
2. `install-service.ps1` را با کلیک راست → Run as Admin اجرا کن.
3. یک‌بار Reboot، بعد در داشبورد از Send Message یا Punish استفاده کن — دیگر خطای PsExec یا refresh نخواهی داشت.

اگر تأیید کنی، پیاده‌سازی را شروع می‌کنم.
