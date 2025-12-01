# Fireworks Planner - Start Servers Script
# This script starts both backend and frontend servers

Write-Host "Starting Fireworks Planner Servers..." -ForegroundColor Cyan
Write-Host ""

# Load environment variables from .env file if it exists
$backendPath = Join-Path $PSScriptRoot "backend"
$envFile = Join-Path $backendPath ".env"

$envVars = @{}
if (Test-Path $envFile) {
    Write-Host "Loading environment variables from .env file..." -ForegroundColor Green
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($key -and $value) {
                $envVars[$key] = $value
                Write-Host "  Loaded: $key" -ForegroundColor Gray
            }
        }
    }
} else {
    Write-Host "No .env file found. Google OAuth will be disabled." -ForegroundColor Yellow
    Write-Host "Create backend\.env with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in." -ForegroundColor Yellow
    Write-Host "See GOOGLE_OAUTH_SETUP.md for instructions." -ForegroundColor Yellow
}

# Build environment variable string for the child process
$envString = ""
foreach ($key in $envVars.Keys) {
    $envString += "`$env:$key='$($envVars[$key])'; "
}

# Start Backend
Write-Host "Starting Backend Server..." -ForegroundColor Yellow
$backendCommand = "cd '$backendPath'; $envString .\venv\Scripts\Activate.ps1; python server.py"
Start-Process pwsh -ArgumentList "-NoExit", "-Command", $backendCommand

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
