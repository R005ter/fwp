# Fireworks Planner - Start Servers Script
# This script starts both backend and frontend servers

Write-Host "Starting Fireworks Planner Servers..." -ForegroundColor Cyan
Write-Host ""

# Start Backend
Write-Host "Starting Backend Server..." -ForegroundColor Yellow
$backendPath = Join-Path $PSScriptRoot "backend"
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; .\venv\Scripts\Activate.ps1; python server.py"

# Wait a moment for backend to initialize
Start-Sleep -Seconds 2

# Start Frontend
Write-Host "Starting Frontend Server..." -ForegroundColor Yellow
$frontendPath = Join-Path $PSScriptRoot "frontend"
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; python -m http.server 8080"

Write-Host ""
Write-Host "Servers starting in new windows!" -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop servers: Close the terminal windows or run stop-servers.ps1" -ForegroundColor Gray
