@ECHO OFF

ECHO **********************************
ECHO *                                *
ECHO *   Running Monitoring Server    *
ECHO *                                *
ECHO **********************************
ECHO.
ECHO.

CD /D C:\1\gamenet-watcher-main

npm run dev

ECHO.
ECHO Server stopped.
PAUSE
