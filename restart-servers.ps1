# Fireworks Planner - Restart Servers Script
# This script stops and restarts both backend and frontend servers

Write-Host "Restarting Fireworks Planner Servers..." -ForegroundColor Cyan
Write-Host ""

# Stop servers first
& "$PSScriptRoot\stop-servers.ps1"

Write-Host ""
Write-Host "Waiting 2 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 2

# Start servers
& "$PSScriptRoot\start-servers.ps1"
