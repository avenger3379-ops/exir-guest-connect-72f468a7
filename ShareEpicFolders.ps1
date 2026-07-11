<#
.SYNOPSIS
    Ensures the required Epic Games folders (H:\Epic Games, AppData\Local, ProgramData\Epic)
    are shared with Everyone:FullControl on this client, ready for GoodSync sync operations.

.NOTES
    - Must run with Administrator privileges (designed to be triggered via a Scheduled Task
      that already runs as SYSTEM / highest privileges, so no UAC prompt appears).
    - Idempotent: safe to run multiple times, only makes changes when needed.
    - Adjust paths in $sharesToEnsure below if your folder layout differs.
#>

$ErrorActionPreference = "Stop"

$logDir  = "C:\ProgramData\GameSyncShare"
$logFile = Join-Path $logDir "share-setup.log"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

function Write-Log {
    param([string]$msg)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $logFile -Value $line
}

# ShareName = Local path to share.
# NOTE: change "gamer" below to the actual Windows username on this client if different.
$sharesToEnsure = @{
    "DriveH"          = "H:\Epic Games"
    "gamerdata"        = "C:\Users\gamer\AppData\Local"
    "ProgramDataEpic"  = "C:\ProgramData\Epic"
}

Write-Log "===== Share setup run started ====="

foreach ($shareName in $sharesToEnsure.Keys) {
    $path = $sharesToEnsure[$shareName]

    try {
        if (-not (Test-Path $path)) {
            Write-Log "Path not found, creating: $path"
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }

        # --- Ensure SMB Share exists and points to the correct path ---
        $existingShare = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue

        if (-not $existingShare) {
            Write-Log "Creating SMB share '$shareName' -> $path"
            New-SmbShare -Name $shareName -Path $path -FullAccess "Everyone" | Out-Null
        }
        elseif ($existingShare.Path -ne $path) {
            Write-Log "Share '$shareName' points to wrong path ($($existingShare.Path)). Recreating."
            Remove-SmbShare -Name $shareName -Force
            New-SmbShare -Name $shareName -Path $path -FullAccess "Everyone" | Out-Null
        }
        else {
            Write-Log "Share '$shareName' already exists and is correct."
        }

        # --- Ensure Share-level permission = Everyone Full Control ---
        $shareAccess = Get-SmbShareAccess -Name $shareName |
            Where-Object { $_.AccountName -eq "Everyone" -and $_.AccessRight -eq "Full" }

        if (-not $shareAccess) {
            Write-Log "Granting Everyone:Full (share permission) on '$shareName'"
            Grant-SmbShareAccess -Name $shareName -AccountName "Everyone" -AccessRight Full -Force | Out-Null
        }

        # --- Ensure NTFS permission = Everyone Full Control (skip if already set, to avoid slow recursive re-scan every run) ---
        $acl = Get-Acl $path
        $hasEveryoneFull = $acl.Access | Where-Object {
            $_.IdentityReference -match "Everyone" -and $_.FileSystemRights -match "FullControl"
        }

        if (-not $hasEveryoneFull) {
            Write-Log "Setting NTFS permissions (Everyone:FullControl, recursive) on $path -- this may take a while on large folders"
            icacls "$path" /grant "Everyone:(OI)(CI)F" /T /C | Out-Null
        }
        else {
            Write-Log "NTFS Everyone:FullControl already present on $path, skipping."
        }

        Write-Log "OK: $shareName ($path)"
    }
    catch {
        Write-Log "ERROR on '$shareName' ($path): $($_.Exception.Message)"
    }
}

Write-Log "===== Share setup run finished ====="
