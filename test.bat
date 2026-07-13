
@ECHO OFF

ECHO **********************************
ECHO *                                *
ECHO *   Running Monitoring Server    *
ECHO *                                *
ECHO **********************************
ECHO.
ECHO.

CD /D C:\1\gamenet-watcher-main
$env:MIKROTIK_HOST="192.168.3.200"
$env:MIKROTIK_USER="exir-agent"
$env:MIKROTIK_PASS="#22302791B#"
npm run dev

ECHO.
ECHO Server stopped.
PAUSE
