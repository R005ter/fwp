#!/usr/bin/env python3
"""
Simple script to extract YouTube cookies from your browser and send them to the Fireworks Planner API.
This only needs to be run once (or when cookies expire).

Usage:
    python setup_cookies.py

Requirements:
    - yt-dlp installed: pip install yt-dlp
    - You must be logged into YouTube in your browser
"""

import subprocess
import json
import sys
import tempfile
from pathlib import Path

# Configuration
API_BASE = "https://fireworks-planner.onrender.com"  # Change to http://localhost:5000 for local dev
BROWSER = "chrome"  # Options: chrome, firefox, edge, safari, brave, etc.

def extract_cookies():
    """Extract cookies from browser using yt-dlp"""
    print(f"🔍 Extracting YouTube cookies from {BROWSER} browser...")
    print("   (Make sure you're logged into YouTube in your browser)")
    
    # Create temporary file for cookies
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        cookies_file = f.name
    
    try:
        # Use yt-dlp to extract cookies
        cmd = [
            "yt-dlp",
            "--cookies-from-browser", BROWSER,
            "--cookies", cookies_file,
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"  # Dummy URL just to extract cookies
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Error extracting cookies: {result.stderr}")
            return None
        
        # Read the cookies file
        with open(cookies_file, 'r') as f:
            cookies_data = f.read()
        
        # Verify it's in Netscape format
        if not (cookies_data.startswith('# Netscape HTTP Cookie File') or 
                cookies_data.startswith('# HTTP Cookie File')):
            print("⚠️  Warning: Cookies file may not be in correct format")
        
        print("✅ Cookies extracted successfully!")
        return cookies_data
        
    except FileNotFoundError:
        print("❌ Error: yt-dlp not found. Install it with: pip install yt-dlp")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None
    finally:
        # Clean up temp file
        try:
            Path(cookies_file).unlink()
        except:
            pass


def send_cookies_to_api(cookies_data, api_base, username=None, password=None):
    """Send cookies to the API"""
    import requests
    
    # First, try to authenticate if credentials provided
    session = requests.Session()
    
    if username and password:
        print(f"🔐 Logging in as {username}...")
        login_url = f"{api_base}/api/auth/login"
        login_response = session.post(login_url, json={
            "username": username,
            "password": password
        })
        
        if login_response.status_code != 200:
            print(f"❌ Login failed: {login_response.json().get('error', 'Unknown error')}")
            return False
        print("✅ Logged in successfully!")
    
    # Send cookies to API
    print("📤 Sending cookies to server...")
    cookies_url = f"{api_base}/api/auth/cookies"
    
    response = session.post(cookies_url, json={
        "cookies": cookies_data
    })
    
    if response.status_code == 200:
        print("✅ Cookies saved successfully!")
        print("   You can now download YouTube videos without bot detection errors.")
        return True
    else:
        error = response.json().get('error', 'Unknown error')
        print(f"❌ Failed to save cookies: {error}")
        if response.status_code == 401:
            print("   💡 Tip: Make sure you're logged into the Fireworks Planner app first.")
        return False


def main():
    print("=" * 60)
    print("🎆 Fireworks Planner - Cookie Setup")
    print("=" * 60)
    print()
    
    # Extract cookies
    cookies_data = extract_cookies()
    if not cookies_data:
        sys.exit(1)
    
    print()
    print("=" * 60)
    
    # Ask if user wants to send to API
    print("\n📋 Next steps:")
    print("   1. Make sure you're logged into the Fireworks Planner app")
    print("   2. We'll send your cookies to the server")
    print()
    
    send_to_api = input("Send cookies to server? (y/n): ").strip().lower()
    
    if send_to_api != 'y':
        print("\n💾 Cookies extracted but not sent. You can:")
        print("   - Copy the cookies manually from the temp file")
        print("   - Run this script again and choose 'y'")
        sys.exit(0)
    
    # Get API base URL
    api_base = input(f"\nAPI URL [{API_BASE}]: ").strip() or API_BASE
    
    # Optionally get credentials
    use_auth = input("Do you want to log in first? (y/n): ").strip().lower() == 'y'
    username = None
    password = None
    
    if use_auth:
        username = input("Username: ").strip()
        password = input("Password: ").strip()
    
    print()
    
    # Send to API
    success = send_cookies_to_api(cookies_data, api_base, username, password)
    
    if not success and not use_auth:
        print("\n💡 Tip: Try logging in first, or log into the web app and run this script again.")
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Cancelled by user")
        sys.exit(1)

