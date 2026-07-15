param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("500K", "1M", "2M", "UNL")]
    [string]$Tier,

    # مقدار محدودیت به "بایت بر ثانیه". از سرور مرکزی (ping-agent.mjs) پاس
    # داده می‌شه؛ اونجا تنظیمات تیرها متمرکزه (QOS_TIER_KBYTES در .env) پس
    # این اسکریپت دیگه جدول تیر ثابت نداره و نیازی به تغییر/کپی مجدد روی
    # هر VIP نیست وقتی مقدار یه تیر عوض می‌شه. برای Tier=UNL لازم نیست.
    [Parameter(Mandatory=$false)]
    [int]$Bytes = 0
)

# ─────────────────────────────────────────────────────────────────────────
# EXIR - NetLimiter QoS controller
#
# محدود می‌کنه سرعت دانلود کل ترافیک اینترنت این PC (زون Internet داخلی
# NetLimiter) بر اساس مقدار $Bytes (بایت بر ثانیه) که از سرور مرکزی پاس
# داده شده. آپلود دست‌نخورده می‌مونه.
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

# NetLimiter از optimistic concurrency استفاده می‌کنه — هر Rule یک "revision"
# داره و اگه بین خوندن Rule و صدا زدن UpdateRule یه پروسه‌ی دیگه (مثلاً یه
# فراخوانی هم‌زمان دیگه از همین اسکریپت، یا reapply خودکار بعد از UVNC که
# با یه کلیک دستی هم‌زمان شده) همون Rule رو عوض کرده باشه، خطای
# "There is already newer revision of the rule ..." می‌گیریم. این خطا
# transient‌ه: صرفاً باید Rule رو تازه بخونیم و دوباره تلاش کنیم.
function Test-RevisionConflict([string]$msg) {
    return $msg -match "newer revision"
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

    $maxAttempts = 4
    $lastErr = $null

    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            # هر تلاش یک Connect تازه می‌زنه تا آخرین revision رولها رو ببینه —
            # این خودش کافیه که تداخل transient رفع بشه.
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
            $lastErr = $_
            if ((Test-RevisionConflict $_.Exception.Message) -and $attempt -lt $maxAttempts) {
                Write-Err "attempt $attempt/$maxAttempts hit a revision conflict, retrying: $($_.Exception.Message)"
                Start-Sleep -Milliseconds (150 * $attempt)
                continue
            }
            throw $lastErr
        }
    }

} catch {
    Write-Err $_.Exception.ToString()
    Emit-Result @{ ok = $false; error = $_.Exception.Message }
    exit 1
}
