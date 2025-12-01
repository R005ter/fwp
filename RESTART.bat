@echo off
echo Restarting Fireworks Planner...
powershell -ExecutionPolicy Bypass -File "%~dp0restart-servers.ps1"

