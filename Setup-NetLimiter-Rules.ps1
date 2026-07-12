# ─────────────────────────────────────────────────────────────────────────────
# Setup-NetLimiter-Rules.ps1
# Creates 4 named NetLimiter Pro 4 rules on the local machine so the Exir
# dashboard can toggle them remotely via nlq.exe SetLimit.
#
# Rules created (both upload+download):
#   Exir-500K   → 500 kbit/s (64000 B/s)
#   Exir-1M     → 1 Mbit/s   (131072 B/s)
#   Exir-2M     → 2 Mbit/s   (262144 B/s)
#   Exir-UNL    → unlimited (rule present but limit=0, meaning "no cap"
#                 when enabled, and NetLimiter simply won't throttle)
#
# Run once per VIP (as Administrator):
#     powershell -ExecutionPolicy Bypass -File Setup-NetLimiter-Rules.ps1
#
# Requires NetLimiter Pro 4 installed at the default path. Change $Nlq if not.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$Nlq = "C:\Program Files\Locktime Software\NetLimiter 4\nlq.exe"
if (-not (Test-Path $Nlq)) {
    Write-Host "ERROR: nlq.exe not found at $Nlq" -ForegroundColor Red
    Write-Host "Install NetLimiter Pro 4 or edit `$Nlq at the top of this file." -ForegroundColor Yellow
    exit 1
}

$Rules = @(
    @{ Name = "Exir-500K"; Bps = 64000  }
    @{ Name = "Exir-1M";   Bps = 131072 }
    @{ Name = "Exir-2M";   Bps = 262144 }
    @{ Name = "Exir-UNL";  Bps = 0      }
)

foreach ($r in $Rules) {
    Write-Host "→ creating $($r.Name) ($($r.Bps) B/s)" -ForegroundColor Cyan
    # AddRule creates it if missing; SetLimit configures value & starts disabled.
    & $Nlq AddRule "/name=$($r.Name)" "/filter=any" 2>$null | Out-Null
    & $Nlq SetLimit "/rule=$($r.Name)" "/dir=both" "/enable=0" "/limit=$($r.Bps)" | Out-Null
}

Write-Host ""
Write-Host "✓ Done. All 4 Exir rules created and disabled." -ForegroundColor Green
Write-Host "  The dashboard will enable exactly one when you pick a tier." -ForegroundColor Green
