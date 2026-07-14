# Exir Client Agent — installer (run once per VIP as Administrator).
#
# Creates a Scheduled Task that starts the Node.js agent at user logon and
# keeps it running in the user's interactive session — that's what lets the
# message popup actually appear on the player's screen (a service running in
# session 0 wouldn't be visible).
#
# Requirements on the client PC:
#   - Node.js 18+ installed and on PATH (nodejs.org LTS installer is fine)
#   - This folder copied to C:\ExirClientAgent\
#
# Usage:
#   Right-click install-service.ps1 → Run with PowerShell (as Admin)

$ErrorActionPreference = "Stop"

$AgentDir  = "C:\ExirClientAgent"
$AgentFile = Join-Path $AgentDir "exir-client-agent.mjs"
$TaskName  = "ExirClientAgent"

if (-not (Test-Path $AgentFile)) {
    Write-Error "Missing $AgentFile — copy the Files\exir-client-agent folder to $AgentDir first."
    exit 1
}

# Find node.exe
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
    Write-Error "node.exe not found on PATH. Install Node.js 18+ from https://nodejs.org and re-run."
    exit 1
}
Write-Host "Node.js: $node"

# Punch a firewall hole for port 8766 (LAN only)
Write-Host "Opening firewall port 8766 (LAN)…"
New-NetFirewallRule -DisplayName "Exir Client Agent (8766)" `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8766 `
    -Profile Any -ErrorAction SilentlyContinue | Out-Null

# Remove existing task if present
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

# Create scheduled task: run at logon of any user, run whether user is logged
# on or not is deliberately NOT used — we want the interactive session.
$action  = New-ScheduledTaskAction -Execute $node -Argument "`"$AgentFile`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365)
$principal = New-ScheduledTaskPrincipal -GroupId "S-1-5-32-545" -RunLevel Highest  # BUILTIN\Users

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host ""
Write-Host "Installed scheduled task: $TaskName"
Write-Host "Starting agent now…"
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2

# Quick health check
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:8766/health" -TimeoutSec 3
    Write-Host "Health OK: $($r | ConvertTo-Json -Compress)"
} catch {
    Write-Warning "Agent didn't respond on :8766 yet. Try logging out & back in, or run manually: node `"$AgentFile`""
}
