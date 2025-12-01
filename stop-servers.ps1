# Fireworks Planner - Stop Servers Script
# This script stops both backend and frontend servers

Write-Host "Stopping Fireworks Planner Servers..." -ForegroundColor Red
Write-Host ""

# Stop Python processes running the servers
$backendProcess = Get-Process python -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like "*server.py*"}
$frontendProcess = Get-Process python -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like "*http.server*"}

if ($backendProcess) {
    Write-Host "Stopping Backend Server (PID: $($backendProcess.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $backendProcess.Id -Force
    Write-Host "Backend stopped" -ForegroundColor Green
} else {
    Write-Host "Backend server not running" -ForegroundColor Gray
}

if ($frontendProcess) {
    Write-Host "Stopping Frontend Server (PID: $($frontendProcess.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $frontendProcess.Id -Force
    Write-Host "Frontend stopped" -ForegroundColor Green
} else {
    Write-Host "Frontend server not running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
