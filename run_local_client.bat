@echo off
REM Simple launcher for Windows - runs Python script
REM This is a fallback if executable isn't built yet

echo Starting Fireworks Planner Local Client...
echo.

python start_local_client.py

if errorlevel 1 (
    echo.
    echo ERROR: Failed to start local client
    echo Make sure Python is installed and dependencies are installed:
    echo   pip install -r backend/requirements.txt
    pause
)

