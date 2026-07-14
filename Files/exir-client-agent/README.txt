Exir Client Agent — install on each VIP client PC
==================================================

Why: replaces PsExec / WMIC entirely. Removes the SmartLaunch / UltraVNC /
NetLimiter conflict, and the "agent unreachable" errors when sending a
message or applying QoS.

Setup (per client PC, once)
---------------------------
1. Install Node.js 18+ (LTS) from https://nodejs.org — accept all defaults
   so that "Add to PATH" is enabled.

2. Copy this whole folder to:  C:\ExirClientAgent
   You should end up with:
      C:\ExirClientAgent\exir-client-agent.mjs
      C:\ExirClientAgent\install-service.ps1
      C:\ExirClientAgent\README.txt

3. Right-click install-service.ps1  →  Run with PowerShell  →  answer Yes
   to the admin prompt. It:
      - opens firewall port 8766 (LAN only)
      - registers a Scheduled Task named "ExirClientAgent" that starts at
        every logon (in the user's interactive session, so popups are
        visible on-screen)
      - starts the task and verifies the /health endpoint

4. Test from the operator PC:
      curl http://192.168.3.101:8766/health
   Should reply:
      { "ok": true, "agent": "exir-client", "machine": "VIP01", ... }

Optional per-VIP settings
-------------------------
Set once via env var if you use non-default paths:
   EXIR_MACHINE_ID     e.g. VIP01  (defaults to Windows hostname, uppercased)
   NETLIMITER_NLQ      full path to nlq.exe if not the default install

To set them permanently:
   setx EXIR_MACHINE_ID VIP01
Then re-run install-service.ps1 so the scheduled task picks up the new env.

Uninstall
---------
   schtasks /Delete /TN ExirClientAgent /F
   Remove-NetFirewallRule -DisplayName "Exir Client Agent (8766)"
   Remove folder C:\ExirClientAgent
