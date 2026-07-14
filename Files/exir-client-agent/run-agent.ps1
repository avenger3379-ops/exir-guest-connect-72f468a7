# Hidden launcher for exir-client-agent.
# Called by the Scheduled Task via: powershell.exe -WindowStyle Hidden -File run-agent.ps1
# Waits on node.exe and forwards its exit code, so Task Scheduler's
# "restart on failure" setting actually triggers if the agent crashes.

$ErrorActionPreference = "Stop"

$AgentFile = "C:\ExirClientAgent\exir-client-agent.mjs"

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
    exit 1
}

& $node $AgentFile
exit $LASTEXITCODE
