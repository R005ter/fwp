@echo off
echo Stopping Fireworks Planner...
powershell -ExecutionPolicy Bypass -File "%~dp0stop-servers.ps1"
pause




