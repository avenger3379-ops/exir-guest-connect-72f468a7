param(
    [string]$AdminUser = "Gamer",
    [string]$AdminPass = "3379",
    [string]$ScriptDestFolder = "C:\GameNet-Monitor"
)

# ─────────────────────────────────────────────────────────────────────────
# EXIR - راه‌اندازی یک‌جای پیش‌نیازهای NetLimiter QoS روی هر VIP
#
# این اسکریپت روی هر VIP فقط یک‌بار اجرا می‌شه (به‌عنوان Administrator) و
# همهٔ کارهایی که دستی انجام دادیم رو خودکار می‌کنه:
#   1) پسورد یوزر ادمین محلی رو ست می‌کنه
#   2) دو تنظیم رجیستری که مشکل "Access is denied" در PsExec رو حل می‌کنن
#   3) فایل netlimiter-qos.ps1 رو در مسیر مقصد می‌سازه (خودش، بدون نیاز
#      به کپی دستی جدا - محتواش همینجا embed شده)
#   4) یک تست محلی سریع می‌زنه تا مطمئن بشه NetLimiter API در دسترسه
#
# اجرا (روی هر VIP، به‌عنوان Administrator):
#   powershell -ExecutionPolicy Bypass -File .\Setup-NetLimiter-VIP.ps1
#
# اگه یوزر/پسورد یا مسیر متفاوتی می‌خوای:
#   powershell -ExecutionPolicy Bypass -File .\Setup-NetLimiter-VIP.ps1 -AdminUser gamer -AdminPass 1234 -ScriptDestFolder "C:\GameNet-Monitor"
# ─────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

function Section([string]$title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Ok([string]$msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Err([string]$msg)  { Write-Host "  [X]  $msg" -ForegroundColor Red }

# ── 0) چک ادمین بودن ────────────────────────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Err "این اسکریپت باید با دسترسی Administrator اجرا بشه."
    Write-Host "  روی PowerShell راست‌کلیک کن -> Run as Administrator، بعد دوباره اجرا کن."
    Read-Host "برای بستن Enter بزن"
    exit 1
}

Write-Host ""
Write-Host "EXIR NetLimiter VIP Setup" -ForegroundColor Magenta
Write-Host "کامپیوتر: $env:COMPUTERNAME"
Write-Host "یوزر هدف: $AdminUser"
Write-Host "مسیر مقصد اسکریپت: $ScriptDestFolder"

# ── 1) پسورد یوزر ادمین محلی ─────────────────────────────────────────────
Section "1) تنظیم پسورد یوزر $AdminUser"
try {
    net user $AdminUser $AdminPass | Out-Null
    Ok "پسورد یوزر '$AdminUser' ست شد."
} catch {
    Err ("نتونستم پسورد یوزر '$AdminUser' رو ست کنم: " + $_.Exception.Message)
    Warn "مطمئن شو یوزر '$AdminUser' واقعاً روی این سیستم وجود داره (net user)."
}

# مطمئن شو عضو Administrators هم هست
try {
    $members = net localgroup Administrators
    if ($members -notmatch "^\s*$AdminUser\s*$") {
        net localgroup Administrators $AdminUser /add | Out-Null
        Ok "یوزر '$AdminUser' به گروه Administrators اضافه شد."
    } else {
        Ok "یوزر '$AdminUser' از قبل عضو Administrators هست."
    }
} catch {
    Warn ("چک/افزودن به گروه Administrators ناموفق بود: " + $_.Exception.Message)
}

# ── 2) تنظیمات رجیستری برای رفع مشکل PsExec Access Denied ───────────────
Section "2) تنظیمات رجیستری (رفع Access Denied در PsExec)"
try {
    reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v LocalAccountTokenFilterPolicy /t REG_DWORD /d 1 /f | Out-Null
    Ok "LocalAccountTokenFilterPolicy = 1 ست شد."
} catch {
    Err ("تنظیم LocalAccountTokenFilterPolicy ناموفق بود: " + $_.Exception.Message)
}

try {
    reg add "HKLM\SYSTEM\CurrentControlSet\Control\Lsa" /v forceguest /t REG_DWORD /d 0 /f | Out-Null
    Ok "forceguest = 0 ست شد (حالت Classic فعال شد)."
} catch {
    Err ("تنظیم forceguest ناموفق بود: " + $_.Exception.Message)
}

# ── 3) ساخت پوشه مقصد و نوشتن netlimiter-qos.ps1 ────────────────────────
Section "3) استقرار netlimiter-qos.ps1"
try {
    if (-not (Test-Path $ScriptDestFolder)) {
        New-Item -ItemType Directory -Path $ScriptDestFolder -Force | Out-Null
        Ok "پوشهٔ '$ScriptDestFolder' ساخته شد."
    } else {
        Ok "پوشهٔ '$ScriptDestFolder' از قبل وجود داره."
    }

    $qosScriptContent = @'
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("500K", "1M", "2M", "UNL")]
    [string]$Tier,

    # مقدار محدودیت به "بایت بر ثانیه" - از سرور مرکزی (ping-agent.mjs) پاس
    # داده می‌شه، اونجا تنظیمات تیرها متمرکزه (QOS_TIER_KBYTES در .env) و این
    # اسکریپت دیگه جدول تیر ثابت نداره - برای Tier=UNL لازم نیست.
    [Parameter(Mandatory=$false)]
    [int]$Bytes = 0
)

# ─────────────────────────────────────────────────────────────────────────
# EXIR - NetLimiter QoS controller
#
# محدود می‌کنه سرعت دانلود کل ترافیک اینترنت این PC (زون Internet داخلی
# NetLimiter) بر اساس مقدار $Bytes (بایت بر ثانیه). آپلود دست‌نخورده می‌مونه.
#
# خروجی: فقط یک خط JSON روی stdout چاپ می‌شه تا ping-agent.mjs بتونه
# پارسش کنه. هر پیام دیگه‌ای (لاگ/خطا) روی stderr می‌ره.
# ─────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

function Write-Err([string]$msg) {
    [Console]::Error.WriteLine($msg)
}

function Emit-Result($obj) {
    $obj | ConvertTo-Json -Compress | Write-Output
}

try {
    if ($Tier -ne "UNL" -and $Bytes -le 0) {
        throw "Bytes باید برای هر تیر غیر از UNL یک مقدار مثبت باشه (پارامتر -Bytes رو چک کن)"
    }

    $candidatePaths = @(
        "C:\Program Files\Locktime Software\NetLimiter 4\NetLimiter.dll",
        "C:\Program Files\Locktime Software\NetLimiter\NetLimiter.dll",
        "C:\Program Files (x86)\Locktime Software\NetLimiter 4\NetLimiter.dll",
        "C:\Program Files (x86)\Locktime Software\NetLimiter\NetLimiter.dll"
    )
    $dllPath = $null
    foreach ($p in $candidatePaths) {
        if (Test-Path $p) { $dllPath = $p; break }
    }
    if (-not $dllPath) {
        $found = Get-ChildItem -Path "C:\" -Filter "NetLimiter.dll" -Recurse -ErrorAction SilentlyContinue -File | Select-Object -First 1
        if ($found) { $dllPath = $found.FullName }
    }
    if (-not $dllPath) { throw "NetLimiter.dll not found on this system" }

    Add-Type -Path $dllPath

    $svc = New-Object "NetLimiter.Service.NLClient"
    $svc.Connect()

    if (-not $svc.IsLimiterEnabled) {
        $svc.IsLimiterEnabled = $true
    }

    $zone = $svc.GetInternetZone()

    $rule = $null
    foreach ($r in $svc.Rules) {
        if ($r -is [NetLimiter.Service.LimitRule] -and
            $r.FilterId -eq $zone.Id -and
            $r.Dir -eq [NetLimiter.Service.RuleDir]::In) {
            $rule = $r
            break
        }
    }

    if ($Tier -eq "UNL") {
        if ($rule) {
            $rule.IsEnabled = $false
            $svc.UpdateRule($rule)
        }
        Emit-Result @{ ok = $true; tier = $Tier; limit = "unlimited" }
        exit 0
    }

    if ($rule) {
        $rule.LimitSize = [uint32]$Bytes
        $rule.IsEnabled = $true
        $svc.UpdateRule($rule)
    } else {
        $newRule = New-Object NetLimiter.Service.LimitRule
        $newRule.FilterId = $zone.Id
        $newRule.Dir = [NetLimiter.Service.RuleDir]::In
        $newRule.LimitSize = [uint32]$Bytes
        $newRule.IsEnabled = $true
        $svc.AddRule($newRule)
    }

    Emit-Result @{ ok = $true; tier = $Tier; limitBytesPerSec = $Bytes }
    exit 0

} catch {
    Write-Err $_.Exception.ToString()
    Emit-Result @{ ok = $false; error = $_.Exception.Message }
    exit 1
}
'@

    $destFile = Join-Path $ScriptDestFolder "netlimiter-qos.ps1"
    Set-Content -Path $destFile -Value $qosScriptContent -Encoding UTF8 -Force
    Ok "فایل '$destFile' نوشته شد."
} catch {
    Err ("نوشتن netlimiter-qos.ps1 ناموفق بود: " + $_.Exception.Message)
}

# ── 4) تست محلی سریع ──────────────────────────────────────────────────────
Section "4) تست محلی (فقط برای اطمینان از دسترسی به NetLimiter API)"
try {
    # 1,000,000 بایت/ثانیه = تست معادل تیر "1M" با تعریف جدید (1 مگابایت/ثانیه)
    $testOut = & powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptDestFolder "netlimiter-qos.ps1") -Tier 1M -Bytes 1000000 2>&1 | Out-String
    $jsonLine = ($testOut -split "`r?`n") | Where-Object { $_.Trim().StartsWith("{") } | Select-Object -First 1
    if ($jsonLine -and $jsonLine -match '"ok":true') {
        Ok "تست محلی موفق بود -> $jsonLine"
        # برگردوندن به حالت آزاد بعد از تست
        & powershell -ExecutionPolicy Bypass -File (Join-Path $ScriptDestFolder "netlimiter-qos.ps1") -Tier UNL 2>&1 | Out-Null
        Ok "محدودیت تستی برداشته شد (تیر UNL ست شد)."
    } else {
        Warn "تست محلی JSON موفق برنگردوند. خروجی کامل:"
        Write-Host $testOut
        Warn "این می‌تونه یعنی NetLimiter نصب نیست یا سرویسش بالا نیست. این بخش رو دستی چک کن."
    }
} catch {
    Warn ("تست محلی با خطا مواجه شد: " + $_.Exception.Message)
}

# ── خلاصه ──────────────────────────────────────────────────────────────
Section "خلاصه"
Write-Host "  اگه همه مراحل بالا [OK] بودن، این VIP آماده‌ست و از سرور مرکزی"
Write-Host "  می‌تونی با PsExec (فلگ -s) بهش دستور QoS بدی."
Write-Host ""
Write-Host "  دستور تست از سرور مرکزی:"
Write-Host "  PsExec.exe \\<این-VIP-IP> -u $AdminUser -p $AdminPass -s cmd /c powershell -ExecutionPolicy Bypass -File `"$ScriptDestFolder\netlimiter-qos.ps1`" -Tier 1M -Bytes 1000000" -ForegroundColor DarkGray
Write-Host "  (در عمل ping-agent.mjs خودش -Bytes رو بر اساس تنظیمات QOS_TIER_KBYTES در .env محاسبه و پاس می‌ده)" -ForegroundColor DarkGray
Write-Host ""

Read-Host "برای بستن Enter بزن"
