#!/usr/bin/env python3
"""
Build standalone executable for Local Client
Uses PyInstaller to create a single-file executable
"""

import os
import sys
import subprocess
from pathlib import Path

def build_executable():
    """Build executable using PyInstaller"""
    
    project_root = Path(__file__).parent
    frontend_dir = project_root / "frontend"
    backend_dir = project_root / "backend"
    
    print("=" * 70)
    print("Building Fireworks Planner Local Client Executable")
    print("=" * 70)
    
    # Check PyInstaller is installed
    try:
        import PyInstaller
        print("✓ PyInstaller found")
    except ImportError:
        print("ERROR: PyInstaller not installed")
        print("Install it with: pip install pyinstaller")
        return False
    
    # Check directories exist
    if not frontend_dir.exists():
        print(f"ERROR: Frontend directory not found: {frontend_dir}")
        return False
    
    if not backend_dir.exists():
        print(f"ERROR: Backend directory not found: {backend_dir}")
        return False
    
    # Check critical dependencies are installed
    print("\nChecking dependencies...")
    critical_deps = ['psycopg2', 'boto3', 'flask', 'yt_dlp']
    missing_deps = []
    for dep in critical_deps:
        try:
            __import__(dep.replace('-', '_'))
            print(f"  ✓ {dep}")
        except ImportError:
            print(f"  ✗ {dep} - MISSING")
            missing_deps.append(dep)
    
    if missing_deps:
        print(f"\nERROR: Missing dependencies: {', '.join(missing_deps)}")
        print("Install them with: pip install -r backend/requirements.txt")
        return False
    
    # Build PyInstaller command
    cmd = [
        "pyinstaller",
        "--onefile",  # Single executable file
        "--name", "FireworksPlanner",
        "--console",  # Show console window (for logs)
        "--add-data", f"{frontend_dir}{os.pathsep}frontend",
        "--add-data", f"{backend_dir}{os.pathsep}backend",
        "--hidden-import", "flask",
        "--hidden-import", "flask_cors",
        "--hidden-import", "authlib",
        "--hidden-import", "backend.database",
        "--hidden-import", "dotenv",
        "--hidden-import", "requests",
        "--hidden-import", "subprocess",
        "--hidden-import", "threading",
        "--hidden-import", "http.server",
        "--hidden-import", "socketserver",
        "--hidden-import", "webbrowser",
        "--hidden-import", "urllib",
        "--hidden-import", "psycopg2",
        "--hidden-import", "psycopg2.extras",
        "--hidden-import", "psycopg2._psycopg",
        "--hidden-import", "boto3",
        "--hidden-import", "botocore",
        "--hidden-import", "yt_dlp",
        "--hidden-import", "werkzeug",
        "--hidden-import", "werkzeug.security",
        "--collect-all", "flask",
        "--collect-all", "flask_cors",
        "--collect-all", "authlib",
        "--collect-all", "psycopg2",
        "--collect-all", "boto3",
        "--collect-all", "botocore",
        "--collect-all", "yt_dlp",
        "--collect-all", "werkzeug",
        "start_local_client.py"
    ]
    
    print("\nBuilding executable...")
    print(f"Command: {' '.join(cmd)}\n")
    
    try:
        result = subprocess.run(cmd, check=True, cwd=project_root)
        print("\n" + "=" * 70)
        print("✓ Build successful!")
        print("=" * 70)
        print(f"\nExecutable location: {project_root / 'dist' / 'FireworksPlanner.exe'}")
        print("\nYou can now distribute this executable to run the local client.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"\nERROR: Build failed: {e}")
        return False
    except FileNotFoundError:
        print("\nERROR: PyInstaller not found in PATH")
        print("Make sure PyInstaller is installed: pip install pyinstaller")
        return False

if __name__ == "__main__":
    success = build_executable()
    sys.exit(0 if success else 1)

