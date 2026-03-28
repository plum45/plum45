@echo off
title Stacy Relay (Local PC Listener)
echo.
echo ============================================
echo   Stacy AI - Local PC Relay Mode
echo   Listening for commands from Cloud...
echo ============================================
echo.
cd /d "%~dp0"
node server.js --relay
pause
