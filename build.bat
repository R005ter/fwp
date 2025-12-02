@echo off
REM Build executable for Windows
echo Building Fireworks Planner Local Client Executable...
echo.

REM Check if PyInstaller is installed
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo PyInstaller not found. Installing...
    pip install pyinstaller
)

REM Run build script
python build_executable.py

pause

