# Start Fireworks Planner with full output monitoring
# This script runs the server and shows all output in real-time

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Fireworks Planner - Monitored Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting servers... All output will be displayed below." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

# Run Python script and show output
python start_local_client.py




