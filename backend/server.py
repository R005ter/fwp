"""
Fireworks Planner Backend
Handles YouTube video downloads via yt-dlp and serves video files
"""

import os
import json
import subprocess
import threading
import uuid
import requests
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for, Response
from flask_cors import CORS
from authlib.integrations.flask_client import OAuth
from database import (
    init_db, create_user, verify_user, get_user_by_id, get_user_by_oauth,
    save_show, get_user_shows, delete_show,
    save_library_metadata, get_user_library, delete_library_item,
    get_video_by_youtube_url, get_video_by_filename, create_video,
    add_video_to_library, remove_video_from_library,
    get_video_reference_count, cleanup_orphaned_videos
)
from r2_storage import (
    upload_to_r2, delete_from_r2, get_r2_url, file_exists_in_r2,
    get_file_size_from_r2, R2_ENABLED
)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='../frontend', static_url_path='')
# Use environment variable for secret key in production, generate random one for dev
app.secret_key = os.environ.get('SECRET_KEY') or ('dev-secret-key-' + str(uuid.uuid4()))

# CORS configuration - allow localhost for local client
# In production (Render), allow all origins. For local client, explicitly allow localhost.
cors_origins = ['http://localhost:8080', 'http://localhost:3000', 'http://127.0.0.1:8080']
if os.environ.get('RENDER') == 'true':
    # Production: allow all origins (or specify your domain)
    CORS(app, supports_credentials=True, origins='*')
else:
    # Development/local: allow localhost origins
    CORS(app, supports_credentials=True, origins=cors_origins)

# Initialize OAuth
oauth = OAuth(app)

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')

if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET:
    # Determine base URL for redirect URI
    if os.environ.get('RENDER') == 'true' or os.environ.get('PORT'):
        # Production - will be set dynamically
        base_url = None  # Will use request.url_root
    else:
        # Development
        base_url = 'http://localhost:5000'
    
    google = oauth.register(
        name='google',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={
            'scope': 'openid email profile'
        }
    )
else:
    google = None
    print("⚠️  Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.")

# Configuration
VIDEOS_DIR = Path(__file__).parent / "videos"
VIDEOS_DIR.mkdir(exist_ok=True)

# Local downloader mode: Download videos locally but upload to remote server
# Set LOCAL_DOWNLOADER_MODE=true and REMOTE_SERVER_URL=https://your-server.onrender.com
LOCAL_DOWNLOADER_MODE = os.environ.get('LOCAL_DOWNLOADER_MODE', '').lower() == 'true'
REMOTE_SERVER_URL = os.environ.get('REMOTE_SERVER_URL', '').strip().rstrip('/')

# Determine if this is web client (Render) or local client
IS_WEB_CLIENT = not LOCAL_DOWNLOADER_MODE and (os.environ.get('RENDER') == 'true' or os.environ.get('PORT'))

# Cookies file for YouTube (to avoid bot detection)
COOKIES_FILE = Path(__file__).parent / "youtube_cookies.txt"
# Check if cookies are provided via environment variable (base64 encoded)
# Always update from env var if provided (to allow updating cookies without redeploy)
COOKIES_ENV = os.environ.get('YOUTUBE_COOKIES')
if COOKIES_ENV:
    try:
        import base64
        cookies_data = base64.b64decode(COOKIES_ENV).decode('utf-8')
        # Verify it's in Netscape format
        if not cookies_data.startswith('# Netscape HTTP Cookie File') and not cookies_data.startswith('# HTTP Cookie File'):
            print("⚠ Warning: Cookies file may not be in Netscape format")
        COOKIES_FILE.write_text(cookies_data)
        file_size = COOKIES_FILE.stat().st_size
        print(f"✓ YouTube cookies loaded from environment variable ({file_size} bytes)")
    except Exception as e:
        print(f"⚠ Warning: Could not decode YouTube cookies from env: {e}")

# Proxy configuration for YouTube downloads (to avoid IP-based blocking)
# Format: http://user:pass@host:port or http://host:port or socks5://host:port
# Examples:
#   - HTTP proxy: http://proxy.example.com:8080
#   - SOCKS5 proxy: socks5://proxy.example.com:1080
#   - Authenticated: http://user:pass@proxy.example.com:8080
#   - Bright Data residential: http://brd-customer-XXX-zone-YYY:password@brd.superproxy.io:33335
#   - Bright Data ISP: http://brd-customer-XXX-zone-isp_YYY:password@brd.superproxy.io:33335
#   - Bright Data Unlocker API (native proxy): Same format, but zone must be configured for Unlocker API
YOUTUBE_PROXY = os.environ.get('YOUTUBE_PROXY')

# Bright Data Unlocker API HTTP endpoint (alternative to proxy)
# If set, will use HTTP API endpoint instead of proxy
# Get API key from: Bright Data dashboard → Unlocker API → Overview tab
BRIGHT_DATA_UNLOCKER_API_KEY = os.environ.get('BRIGHT_DATA_UNLOCKER_API_KEY')
BRIGHT_DATA_UNLOCKER_ZONE = os.environ.get('BRIGHT_DATA_UNLOCKER_ZONE')  # e.g., 'fwp_proxy'

def is_bright_data_proxy(proxy_url):
    """Check if proxy is Bright Data (formerly Luminati)"""
    if not proxy_url:
        return False
    bright_data_hosts = ['brd.superproxy.io', 'lum-superproxy.io', 'zproxy.lum-superproxy.io']
    return any(host in proxy_url for host in bright_data_hosts)

def normalize_bright_data_proxy(proxy_url):
    """Normalize Bright Data proxy URL - ensure http:// format for residential/ISP proxies"""
    if not proxy_url or not is_bright_data_proxy(proxy_url):
        return proxy_url
    
    # Bright Data residential/ISP proxies use http:// format (not https://)
    # Even though we're connecting to HTTPS destinations, the proxy URL itself should be http://
    if proxy_url.startswith('https://'):
        # Convert https:// back to http:// for Bright Data proxies
        return proxy_url.replace('https://', 'http://', 1)
    
    return proxy_url

def convert_to_socks5(proxy_url):
    """Convert Bright Data HTTP proxy to SOCKS5 proxy (better for yt-dlp)"""
    if not proxy_url or not is_bright_data_proxy(proxy_url):
        return proxy_url
    
    # SOCKS5 uses port 22225, HTTP uses 33335
    # Format: socks5://username:password@host:22225
    if '@' in proxy_url:
        protocol_part = proxy_url.split('://')[0] + '://'
        rest = proxy_url.split('://')[1]
        username_password = rest.split('@')[0]
        host_port = rest.split('@')[1]
        
        # Extract host (remove port)
        host = host_port.split(':')[0]
        
        # Convert to SOCKS5 format
        return f"socks5://{username_password}@{host}:22225"
    
    return proxy_url

def add_bright_data_session(proxy_url):
    """Add session ID to Bright Data proxy username for IP rotation"""
    if not proxy_url or not is_bright_data_proxy(proxy_url):
        return proxy_url
    
    import random
    import string
    
    # Generate random session ID (8 characters)
    session_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    
    # Parse proxy URL: protocol://username:password@host:port
    if '@' in proxy_url and '://' in proxy_url:
        protocol_part = proxy_url.split('://')[0] + '://'
        rest = proxy_url.split('://')[1]
        username_password = rest.split('@')[0]
        host_port = rest.split('@')[1]
        
        username, password = username_password.split(':', 1)
        
        # Add session to username: brd-customer-XXX-zone-YYY-session-ABC123
        # Also add country targeting for better success: -country-us
        if 'session-' not in username:
            username = f"{username}-session-{session_id}-country-us"
        
        return f"{protocol_part}{username}:{password}@{host_port}"
    
    return proxy_url

# Bright Data proxies do SSL interception, so we need to disable SSL verification
BRIGHT_DATA_PROXY = is_bright_data_proxy(YOUTUBE_PROXY) if YOUTUBE_PROXY else False

# Store original proxy URL for fallback retries
YOUTUBE_PROXY_ORIGINAL = YOUTUBE_PROXY

# Bright Data Unlocker API HTTP endpoint support
def fetch_via_unlocker_api(url, video_id):
    """Fetch YouTube page via Bright Data Unlocker API HTTP endpoint"""
    if not BRIGHT_DATA_UNLOCKER_API_KEY or not BRIGHT_DATA_UNLOCKER_ZONE:
        return None
    
    try:
        api_url = "https://api.brightdata.com/request"
        headers = {
            "Authorization": f"Bearer {BRIGHT_DATA_UNLOCKER_API_KEY}",
            "Content-Type": "application/json"
        }
        payload = {
            "url": url,
            "zone": BRIGHT_DATA_UNLOCKER_ZONE,
            "format": "raw"  # Get raw HTML
        }
        
        print(f"[{video_id}] Trying Bright Data Unlocker API HTTP endpoint...")
        response = requests.post(api_url, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            print(f"[{video_id}] Unlocker API HTTP endpoint succeeded!")
            return response.text  # Return HTML content
        else:
            print(f"[{video_id}] Unlocker API HTTP endpoint failed: {response.status_code} - {response.text[:200]}")
            return None
    except Exception as e:
        print(f"[{video_id}] Unlocker API HTTP endpoint error: {str(e)}")
        return None

# Normalize Bright Data proxy URL (try https:// first for HTTPS destinations)
if BRIGHT_DATA_PROXY:
    YOUTUBE_PROXY = normalize_bright_data_proxy(YOUTUBE_PROXY)

if YOUTUBE_PROXY:
    proxy_display = YOUTUBE_PROXY.split('@')[-1] if '@' in YOUTUBE_PROXY else YOUTUBE_PROXY
    # Detect proxy type from username or port
    proxy_type = "proxy"
    if BRIGHT_DATA_PROXY:
        # Check if it's ISP proxy (usually has 'isp' in zone name or uses different indicators)
        username_part = ""
        if '@' in YOUTUBE_PROXY:
            username_part = YOUTUBE_PROXY.split('@')[0]
            if '://' in username_part:
                username = username_part.split('://')[1].split(':')[0]
                if 'isp' in username.lower() or 'datacenter' in username.lower():
                    proxy_type = "Bright Data ISP"
                else:
                    proxy_type = "Bright Data residential"
            else:
                proxy_type = "Bright Data residential"
        else:
            proxy_type = "Bright Data residential"
    
    print(f"✓ YouTube {proxy_type} configured: {proxy_display}")
    if BRIGHT_DATA_PROXY:
        print("  ℹ SSL verification will be disabled for Bright Data proxy (required for SSL interception)")
        # Log username format for debugging (without password)
        if '@' in YOUTUBE_PROXY:
            username_part = YOUTUBE_PROXY.split('@')[0]
            if '://' in username_part:
                username = username_part.split('://')[1].split(':')[0]
                print(f"  ℹ Proxy username format: {username[:50]}...")
        print("  💡 TIP: For better YouTube success, configure your Bright Data zone for 'Unlocker API'")
        print("     (Bright Data dashboard → Your Zone → Settings → Enable Unlocker API)")
        if BRIGHT_DATA_UNLOCKER_API_KEY:
            print("  ✓ Bright Data Unlocker API key detected (HTTP API endpoint available)")
else:
    print("ℹ No YouTube proxy configured. Consider using a proxy service to avoid IP-based blocking on Render.")

# PO Token Provider Plugin: yt-dlp-get-pot-rustypipe
# This plugin automatically provides PO Tokens when needed by yt-dlp
# No manual PO Token extraction required!
# See: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
# Note: The plugin is auto-discovered by yt-dlp when installed via pip
# We don't need to import it - yt-dlp will find it automatically
try:
    import pkg_resources
    try:
        pkg_resources.get_distribution('yt-dlp-get-pot-rustypipe')
        print("✓ PO Token Provider plugin (yt-dlp-get-pot-rustypipe) is installed")
    except pkg_resources.DistributionNotFound:
        # Plugin is in requirements.txt, so it should be installed
        # yt-dlp will auto-discover it even if we can't verify here
        print("ℹ PO Token Provider plugin should be available (yt-dlp will auto-discover it)")
except ImportError:
    # pkg_resources not available (setuptools not installed)
    # Plugin is in requirements.txt, so it should be installed
    # yt-dlp will auto-discover it
    print("ℹ PO Token Provider plugin should be available (yt-dlp will auto-discover it)")

# Determine if we're in production (Render.com sets PORT env var)
IS_PRODUCTION = 'RENDER' in os.environ or 'PORT' in os.environ

# Find FFmpeg location
FFMPEG_PATH = None
# Check common WinGet install location
winget_ffmpeg = Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
for ffmpeg_dir in winget_ffmpeg.glob("yt-dlp.FFmpeg*"):
    ffmpeg_exe = list(ffmpeg_dir.rglob("ffmpeg.exe"))
    if ffmpeg_exe:
        FFMPEG_PATH = str(ffmpeg_exe[0].parent)
        break

# Also check if ffmpeg is in PATH
if not FFMPEG_PATH:
    try:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True)
        if result.returncode == 0:
            FFMPEG_PATH = None  # It's in PATH, no need to specify
    except FileNotFoundError:
        pass

# Track download progress (per user)
downloads = {}

# Initialize database on startup
init_db()


def get_current_user_id():
    """Get current user ID from session"""
    return session.get('user_id')


def require_auth():
    """Check if user is authenticated - supports both session cookies and auth tokens"""
    user_id = get_current_user_id()
    
    # If no session, try auth token from header
    if not user_id:
        auth_token = request.headers.get('X-Auth-Token')
        if auth_token and hasattr(app, 'auth_tokens') and auth_token in app.auth_tokens:
            import time
            token_data = app.auth_tokens[auth_token]
            # Check if token expired
            if time.time() < token_data['expires']:
                # Set user_id in session for this request (temporary)
                session['user_id'] = token_data['user_id']
                user_id = token_data['user_id']
            else:
                # Token expired, remove it
                del app.auth_tokens[auth_token]
    
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401
    return None

def upload_video_to_remote(file_path, filename, youtube_url, title, user_id, video_id):
    """Upload video file to remote server"""
    if not REMOTE_SERVER_URL:
        print(f"[{video_id}] ERROR: REMOTE_SERVER_URL not configured")
        return False
    
    if not user_id:
        print(f"[{video_id}] ERROR: user_id required for upload")
        return False
    
    try:
        upload_url = f"{REMOTE_SERVER_URL}/api/upload-video"
        
        # Read file in chunks for large files
        with open(file_path, 'rb') as f:
            files = {'video': (filename, f, 'video/mp4')}
            data = {
                'youtube_url': youtube_url,
                'title': title,
                'user_id': str(user_id),  # user_id from local session (Google OAuth)
                'video_id': video_id
            }
            
            # Note: We're passing user_id in form data
            # The remote server will verify the user exists
            # For better security, we could add API key authentication later
            
            print(f"[{video_id}] Uploading {filename} ({file_path.stat().st_size / 1024 / 1024:.2f} MB) to {upload_url}...")
            print(f"[{video_id}]   - user_id: {user_id} (from local Google OAuth session)")
            response = requests.post(
                upload_url,
                files=files,
                data=data,
                timeout=300  # 5 minute timeout for large files
            )
            
            if response.status_code == 200:
                print(f"[{video_id}] Upload successful!")
                return True
            else:
                print(f"[{video_id}] Upload failed: {response.status_code} - {response.text[:200]}")
                return False
                
    except Exception as e:
        print(f"[{video_id}] Upload error: {str(e)}")
        return False


def run_ytdlp(video_id, url):
    """Run yt-dlp in a subprocess and track progress"""
    output_path = VIDEOS_DIR / f"{video_id}.mp4"
    
    # Preserve existing download info (youtube_url, user_id) if present
    existing_info = downloads.get(video_id, {})
    user_id = existing_info.get("user_id")
    downloads[video_id] = {
        "status": "downloading",
        "progress": 0,
        "title": "Fetching...",
        "filename": None,
        "error": None,
        "youtube_url": existing_info.get("youtube_url", url),
        "user_id": user_id
    }
    
    try:
        # Get user-specific cookies from database, fallback to global cookies file
        user_cookies_data = None
        cookies_file_to_use = None
        cookie_source = "none"
        
        if user_id:
            from database import get_user_youtube_cookies
            user_cookies_data = get_user_youtube_cookies(user_id)
            if user_cookies_data:
                # Create temporary cookies file for this user
                user_cookies_file = VIDEOS_DIR / f"cookies_{user_id}_{video_id}.txt"
                user_cookies_file.write_text(user_cookies_data)
                cookies_file_to_use = user_cookies_file
                cookie_source = "user database"
                print(f"[{video_id}] Using user-specific cookies from database (user_id: {user_id})")
        
        # Fallback to global cookies file if user doesn't have cookies
        if not cookies_file_to_use and COOKIES_FILE.exists():
            cookies_file_to_use = COOKIES_FILE
            cookie_source = "from environment variable" if COOKIES_ENV else "from file"
            print(f"[{video_id}] Using global cookies {cookie_source}")
        
        has_cookies = cookies_file_to_use is not None
        
        # Rotate user agents to appear more like real browsers
        # Using desktop Chrome user agents (more reliable than mobile)
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
        ]
        import random
        user_agent = random.choice(user_agents)
        
        # Client selection strategy:
        # - With cookies + direct connection: try mweb first (better quality, supports cookies)
        # - With proxy: use android first (more reliable with proxies, doesn't require PO tokens)
        # - Without cookies: use android (doesn't support cookies anyway)
        will_use_proxy = YOUTUBE_PROXY is not None  # We'll try proxy if direct fails
        if has_cookies and not will_use_proxy:
            # mweb client - supports cookies, PO Token Provider plugin will automatically provide PO Tokens
            player_client = "mweb"
        else:
            # android client - more reliable with proxies, doesn't require PO tokens or cookies
            player_client = "android"
        
        # Build extractor args - PO Token Provider plugin will automatically add PO Tokens when needed
        extractor_args = f"youtube:player_client={player_client}"
        
        info_cmd = [
            "yt-dlp",
            "--extractor-args", extractor_args,
            "--user-agent", user_agent,
            "--referer", "https://www.youtube.com/",
            "--add-header", "Accept-Language:en-US,en;q=0.9",
            "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "--add-header", "Accept-Encoding:gzip, deflate",
            "--add-header", "DNT:1",
            "--add-header", "Connection:keep-alive",
            "--add-header", "Upgrade-Insecure-Requests:1",
        ]
        
        # Strategy: Try direct connection first, then proxy as fallback
        # This works locally (direct works) and on Render (direct fails, proxy is fallback)
        proxy_to_use = None
        use_proxy = False
        
        # Add cookies if available
        if has_cookies:
            info_cmd.extend(["--cookies", str(cookies_file_to_use)])
            print(f"[{video_id}] Using cookies {cookie_source} with {player_client} client")
        else:
            print(f"[{video_id}] WARNING: No cookies found. Downloads may fail due to bot detection. Please add your YouTube cookies in Settings.")
        
        info_cmd.extend([
            "--dump-json",
            "--no-download",
            url
        ])
        
        # Try direct connection first (works locally, may fail on Render)
        print(f"[{video_id}] Fetching video info (direct connection)...")
        info_result = subprocess.run(info_cmd, capture_output=True, text=True)
        
        # If direct connection fails and proxy is configured, try with proxy
        if info_result.returncode != 0 and YOUTUBE_PROXY:
            error_output = info_result.stderr.lower()
            # Check if it's a bot detection or connection error (not other errors)
            if any(keyword in error_output for keyword in ['bot', 'sign in', 'unable to download', '403', '429', 'blocked']):
                print(f"[{video_id}] Direct connection failed, trying with proxy...")
                
                # For Bright Data proxies, try SOCKS5 first (better for yt-dlp), then HTTP as fallback
                if BRIGHT_DATA_PROXY:
                    # Try SOCKS5 first (port 22225) - works better with yt-dlp
                    socks5_proxy = convert_to_socks5(YOUTUBE_PROXY)
                    proxy_to_use = add_bright_data_session(socks5_proxy)
                    print(f"[{video_id}] Trying SOCKS5 proxy first (better for yt-dlp)")
                    print(f"[{video_id}] Using session-based Bright Data proxy (new IP per request)")
                else:
                    proxy_to_use = YOUTUBE_PROXY
                
                use_proxy = True
                
                # When using proxy, switch to android client (more reliable with proxies)
                if player_client == "mweb":
                    print(f"[{video_id}] Switching to android client for proxy (more reliable)")
                    player_client = "android"
                    extractor_args = f"youtube:player_client={player_client}"
                    # Update info_cmd with new client
                    extractor_idx = info_cmd.index("--extractor-args")
                    info_cmd[extractor_idx + 1] = extractor_args
                
                # Build new command with proxy (use updated player_client if we switched to android)
                proxy_info_cmd = info_cmd.copy()
                # Update extractor args if we switched to android client
                if player_client == "android" and "--extractor-args" in proxy_info_cmd:
                    extractor_idx = proxy_info_cmd.index("--extractor-args")
                    proxy_info_cmd[extractor_idx + 1] = extractor_args
                    # Remove cookies if present (android client doesn't support cookies)
                    if "--cookies" in proxy_info_cmd:
                        cookies_idx = proxy_info_cmd.index("--cookies")
                        proxy_info_cmd.pop(cookies_idx)  # Remove --cookies
                        proxy_info_cmd.pop(cookies_idx)  # Remove cookies file path
                        print(f"[{video_id}] Removed cookies (android client doesn't support cookies)")
                
                # Insert proxy before --dump-json (which is at index -3: --dump-json, --no-download, url)
                proxy_idx = len(proxy_info_cmd) - 3
                proxy_info_cmd.insert(proxy_idx, "--proxy")
                proxy_info_cmd.insert(proxy_idx + 1, proxy_to_use)
                
                proxy_display = proxy_to_use.split('@')[-1] if '@' in proxy_to_use else proxy_to_use
                print(f"[{video_id}] Using proxy: {proxy_display}")
                
                # Bright Data HTTP proxies require disabling SSL verification due to SSL interception
                # SOCKS5 proxies don't need this (they don't intercept SSL)
                if BRIGHT_DATA_PROXY and proxy_to_use.startswith('http://'):
                    # Insert --no-check-certificate right after --proxy
                    proxy_info_cmd.insert(proxy_idx + 2, "--no-check-certificate")
                    print(f"[{video_id}] SSL verification disabled for Bright Data HTTP proxy")
                elif BRIGHT_DATA_PROXY and proxy_to_use.startswith('socks5://'):
                    print(f"[{video_id}] Using SOCKS5 proxy (no SSL interception, no --no-check-certificate needed)")
                
                # Log username format for debugging
                if '@' in proxy_to_use:
                    username_part = proxy_to_use.split('@')[0]
                    if '://' in username_part:
                        username = username_part.split('://')[1].split(':')[0]
                        print(f"[{video_id}] Proxy username: {username}")
                
                info_result = subprocess.run(proxy_info_cmd, capture_output=True, text=True)
                
                # Log yt-dlp output for debugging
                if info_result.returncode != 0:
                    print(f"[{video_id}] yt-dlp stderr (first 500 chars): {info_result.stderr[:500]}")
                else:
                    print(f"[{video_id}] yt-dlp info fetch succeeded through proxy")
        
        # If Bright Data SOCKS5 proxy fails, try HTTP as fallback
        if info_result.returncode != 0 and BRIGHT_DATA_PROXY and YOUTUBE_PROXY_ORIGINAL and use_proxy:
            error_output = info_result.stderr.lower()
            # If we tried SOCKS5 and it failed, try HTTP instead
            if proxy_to_use and proxy_to_use.startswith('socks5://'):
                print(f"[{video_id}] SOCKS5 proxy failed, trying HTTP proxy as fallback...")
                # Convert to HTTP proxy (port 33335)
                http_proxy = add_bright_data_session(YOUTUBE_PROXY_ORIGINAL)
                
                # Retry with HTTP format - use proxy_info_cmd as base (it already has --proxy)
                alt_info_cmd = proxy_info_cmd.copy()
                # Replace proxy argument
                try:
                    proxy_idx = alt_info_cmd.index("--proxy")
                    alt_info_cmd[proxy_idx + 1] = http_proxy
                    # Add --no-check-certificate for HTTP proxy (SOCKS5 doesn't need it, but HTTP does)
                    if "--no-check-certificate" not in alt_info_cmd:
                        alt_info_cmd.insert(proxy_idx + 2, "--no-check-certificate")
                    http_display = http_proxy.split('@')[-1] if '@' in http_proxy else http_proxy
                    print(f"[{video_id}] Retrying with HTTP proxy: {http_display}")
                    print(f"[{video_id}] Adding --no-check-certificate for HTTP proxy")
                    info_result = subprocess.run(alt_info_cmd, capture_output=True, text=True)
                    if info_result.returncode == 0:
                        proxy_to_use = http_proxy  # Use the working format for download
                        print(f"[{video_id}] HTTP proxy succeeded!")
                    else:
                        print(f"[{video_id}] HTTP proxy also failed: {info_result.stderr[:500]}")
                except ValueError:
                    print(f"[{video_id}] ERROR: Could not find --proxy in command for retry")
            elif '403' in error_output or 'forbidden' in error_output or 'tunnel connection failed' in error_output:
                print(f"[{video_id}] Proxy connection failed with 403/forbidden error")
                print(f"[{video_id}] This may indicate YouTube is blocking Bright Data proxy IPs")
        
        # Final fallback: Try Bright Data Unlocker API HTTP endpoint if all proxy attempts failed
        if info_result.returncode != 0 and BRIGHT_DATA_UNLOCKER_API_KEY and BRIGHT_DATA_UNLOCKER_ZONE:
            print(f"[{video_id}] All proxy methods failed, trying Bright Data Unlocker API HTTP endpoint...")
            html_content = fetch_via_unlocker_api(url, video_id)
            if html_content:
                # Unlocker API can fetch the page, so YouTube is accessible
                # Extract basic video info from HTML (title, etc.)
                import re
                title_match = re.search(r'<title>([^<]+)</title>', html_content)
                if title_match:
                    title = title_match.group(1).replace(' - YouTube', '').strip()
                    print(f"[{video_id}] Unlocker API extracted title: {title}")
                    downloads[video_id]["title"] = title
                
                # Note: yt-dlp still needs to make its own requests for video download
                # The Unlocker API HTTP endpoint confirms YouTube is accessible
                # but yt-dlp may still fail due to bot detection on subsequent requests
                print(f"[{video_id}] NOTE: Unlocker API HTTP endpoint can access YouTube, but yt-dlp may still fail")
                print(f"[{video_id}] Consider configuring your Bright Data zone for Unlocker API (native proxy mode)")
        
        # If mweb client fails with PO Token or format issues, try android client as fallback
        if info_result.returncode != 0 and player_client == "mweb" and has_cookies:
            error_output = info_result.stderr.lower()
            # Check for PO Token issues, format availability issues, or challenge solving failures
            if any(keyword in error_output for keyword in ['po token', 'format is not available', 'only images', 'challenge solving failed', 'gvs po token']):
                print(f"[{video_id}] mweb client failed, trying android client as fallback...")
                player_client = "android"
                extractor_args = f"youtube:player_client={player_client}"
                
                # Build new command with android client (no cookies for android)
                android_info_cmd = [
                    "yt-dlp",
                    "--extractor-args", extractor_args,
                    "--user-agent", user_agent,
                    "--referer", "https://www.youtube.com/",
                    "--add-header", "Accept-Language:en-US,en;q=0.9",
                    "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "--add-header", "Accept-Encoding:gzip, deflate",
                    "--add-header", "DNT:1",
                    "--add-header", "Connection:keep-alive",
                    "--add-header", "Upgrade-Insecure-Requests:1",
                ]
                
                # Add proxy if we were using it
                if proxy_to_use and use_proxy:
                    android_info_cmd.extend(["--proxy", proxy_to_use])
                    # Bright Data HTTP proxies require disabling SSL verification
                    # SOCKS5 proxies don't need this
                    if BRIGHT_DATA_PROXY and proxy_to_use.startswith('http://'):
                        android_info_cmd.extend(["--no-check-certificate"])
                
                android_info_cmd.extend([
                    "--dump-json",
                    "--no-download",
                    url
                ])
                
                print(f"[{video_id}] Fetching video info with android client...")
                info_result = subprocess.run(android_info_cmd, capture_output=True, text=True)
                if info_result.returncode == 0:
                    print(f"[{video_id}] android client succeeded!")
                else:
                    print(f"[{video_id}] android client also failed")
                    print(f"[{video_id}] stderr: {info_result.stderr}")
        
        if info_result.returncode == 0:
            info = json.loads(info_result.stdout)
            downloads[video_id]["title"] = info.get("title", "Unknown")
            print(f"[{video_id}] Title: {downloads[video_id]['title']}")
        else:
            print(f"[{video_id}] Warning: Could not fetch video info")
            print(f"[{video_id}] stderr: {info_result.stderr}")
            # Log more details for Bright Data 403 errors
            if BRIGHT_DATA_PROXY and ('403' in info_result.stderr or 'forbidden' in info_result.stderr.lower()):
                print(f"[{video_id}] ERROR: Bright Data proxy authentication failed (403 Forbidden)")
                print(f"[{video_id}] Please verify:")
                print(f"[{video_id}]   1. Username format: brd-customer-<customer_id>-zone-<zone_name>")
                print(f"[{video_id}]   2. Password is correct")
                # Extract zone name from username for better error message
                zone_name = "unknown"
                if '@' in proxy_to_use:
                    username_part = proxy_to_use.split('@')[0]
                    if '://' in username_part:
                        username = username_part.split('://')[1].split(':')[0]
                        if 'zone-' in username:
                            zone_name = username.split('zone-')[-1]
                print(f"[{video_id}]   3. Zone '{zone_name}' exists in Bright Data dashboard")
                print(f"[{video_id}]   4. Zone is active and configured for residential proxies")
                print(f"[{video_id}]   5. IP whitelist: Add Render's IPs to Bright Data zone allowlist")
                print(f"[{video_id}]      (Bright Data dashboard → Zone → Security Settings → IP Allowlist)")
        
        # Now download - ensuring merged audio+video output
        # Use same client and extractor args as info fetch (may have been changed to android if mweb failed)
        cmd = [
            "yt-dlp",
            "--extractor-args", extractor_args,  # Use the working client (may be android if mweb failed)
            "--user-agent", user_agent,
            "--referer", "https://www.youtube.com/",
            "--add-header", "Accept-Language:en-US,en;q=0.9",
            "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "--add-header", "Accept-Encoding:gzip, deflate",
            "--add-header", "DNT:1",
            "--add-header", "Connection:keep-alive",
            "--add-header", "Upgrade-Insecure-Requests:1",
        ]
        
        # Add proxy if we used it successfully for info fetch
        if proxy_to_use and use_proxy:
            cmd.extend(["--proxy", proxy_to_use])
            # Bright Data HTTP proxies require disabling SSL verification due to SSL interception
            # SOCKS5 proxies don't need this (they don't intercept SSL)
            if BRIGHT_DATA_PROXY and proxy_to_use.startswith('http://'):
                cmd.extend(["--no-check-certificate"])
        
        # Add cookies if available and using mweb client (android doesn't support cookies)
        if has_cookies and player_client == "mweb":
            cmd.extend(["--cookies", str(cookies_file_to_use)])
            print(f"[{video_id}] Using cookies {cookie_source} with {player_client} client")
        elif player_client == "android":
            print(f"[{video_id}] Using {player_client} client (no cookies - android client doesn't support cookies)")
        else:
            print(f"[{video_id}] WARNING: No cookies found. Downloads may fail due to bot detection. Please add your YouTube cookies in Settings.")
        
        cmd.extend([
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",  # Get best mp4 video + m4a audio
            "--merge-output-format", "mp4",  # Merge into mp4
            "-o", str(output_path),  # Direct output path
            "--no-playlist",
            "--progress",  # Show progress
            url
        ])
        
        # Add FFmpeg location if we found it
        if FFMPEG_PATH:
            cmd.insert(1, "--ffmpeg-location")
            cmd.insert(2, FFMPEG_PATH)
            print(f"[{video_id}] Using FFmpeg at: {FFMPEG_PATH}")
        
        print(f"[{video_id}] Starting download with command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1  # Line buffered
        )
        
        for line in process.stdout:
            line = line.strip()
            if line:  # Only print non-empty lines
                print(f"[{video_id}] {line}")
            
            # Parse progress
            if "[download]" in line and "%" in line:
                try:
                    # Extract percentage like "45.2%"
                    percent_str = line.split("%")[0].split()[-1]
                    downloads[video_id]["progress"] = float(percent_str)
                except (ValueError, IndexError):
                    pass
            
            # Also update progress during merge
            if "[Merger]" in line or "Merging" in line:
                downloads[video_id]["progress"] = 95
        
        process.wait()
        
        print(f"[{video_id}] Process finished with return code: {process.returncode}")
        
        if process.returncode == 0:
            # Check if the merged mp4 file exists
            if output_path.exists():
                filename = output_path.name
                file_size = output_path.stat().st_size
                downloads[video_id]["filename"] = filename
                downloads[video_id]["status"] = "complete"
                downloads[video_id]["progress"] = 100
                print(f"[{video_id}] Download complete: {filename}")
                print(f"[{video_id}] File size: {file_size / 1024 / 1024:.2f} MB")
                
                # Upload to R2 if enabled
                if R2_ENABLED:
                    print(f"[{video_id}] Uploading to R2...")
                    if upload_to_r2(output_path, filename):
                        print(f"[{video_id}] ✓ Video uploaded to R2")
                        # Optionally delete local file to save disk space (uncomment if desired)
                        # output_path.unlink()
                        # print(f"[{video_id}] Local file deleted (stored in R2 only)")
                    else:
                        print(f"[{video_id}] ⚠ Failed to upload to R2, keeping local file")
                
                # Register video in shared storage and add to user's library
                youtube_url = downloads[video_id].get("youtube_url")
                title = downloads[video_id].get("title", filename)
                user_id = downloads[video_id].get("user_id")
                
                print(f"[{video_id}] Attempting to register video:")
                print(f"[{video_id}]   - user_id: {user_id}")
                print(f"[{video_id}]   - youtube_url: {youtube_url}")
                print(f"[{video_id}]   - title: {title}")
                print(f"[{video_id}]   - filename: {filename}")
                print(f"[{video_id}]   - file_size: {file_size}")
                
                if not user_id:
                    error_msg = "No user_id found in download info"
                    print(f"[{video_id}] ERROR: {error_msg}")
                    downloads[video_id]["status"] = "error"
                    downloads[video_id]["error"] = error_msg
                    return
                
                if not youtube_url:
                    error_msg = "No youtube_url found in download info"
                    print(f"[{video_id}] ERROR: {error_msg}")
                    downloads[video_id]["status"] = "error"
                    downloads[video_id]["error"] = error_msg
                    return
                
                try:
                    # If in local downloader mode, upload to remote server instead of saving locally
                    if LOCAL_DOWNLOADER_MODE and REMOTE_SERVER_URL:
                        print(f"[{video_id}] Local downloader mode: Uploading to remote server...")
                        upload_success = upload_video_to_remote(output_path, filename, youtube_url, title, user_id, video_id)
                        if upload_success:
                            print(f"[{video_id}] ✓ Video uploaded to remote server successfully")
                            # Clean up local file after successful upload
                            try:
                                output_path.unlink()
                                print(f"[{video_id}] Local file cleaned up")
                            except Exception as e:
                                print(f"[{video_id}] Warning: Could not delete local file: {e}")
                        else:
                            raise Exception("Failed to upload video to remote server")
                    else:
                        # Normal mode: Save locally and register in database
                        # Check if video already exists (shouldn't happen, but just in case)
                        existing = get_video_by_youtube_url(youtube_url)
                        if existing:
                            video_db_id = existing['id']
                            print(f"[{video_id}] Video already in shared storage (ID: {video_db_id}), using existing entry")
                        else:
                            # Create new video entry
                            print(f"[{video_id}] Creating new video entry in database...")
                            video_db_id = create_video(filename, youtube_url, title, file_size)
                            if video_db_id:
                                print(f"[{video_id}] ✓ Video registered in shared storage (ID: {video_db_id})")
                            else:
                                raise Exception("create_video returned None")
                        
                        # Add to user's library
                        if video_db_id:
                            print(f"[{video_id}] Adding video to user's library (user_id: {user_id}, video_id: {video_db_id})...")
                            add_video_to_library(user_id, video_db_id, {
                                "title": title,
                                "sourceUrl": youtube_url
                            })
                            print(f"[{video_id}] ✓ Video added to user's library successfully")
                        
                        # Verify it was added
                        from database import get_user_library
                        user_lib = get_user_library(user_id)
                        if filename in user_lib:
                            print(f"[{video_id}] ✓ Verified: Video appears in user's library")
                        else:
                            print(f"[{video_id}] ⚠ WARNING: Video not found in user's library after adding!")
                except Exception as e:
                    error_msg = f"Error registering video: {str(e)}"
                    print(f"[{video_id}] ERROR: {error_msg}")
                    import traceback
                    traceback.print_exc()
                    downloads[video_id]["status"] = "error"
                    downloads[video_id]["error"] = error_msg
            else:
                downloads[video_id]["status"] = "error"
                downloads[video_id]["error"] = "Merged file not found after download"
                print(f"[{video_id}] ERROR: Merged file not found at {output_path}")
        else:
            downloads[video_id]["status"] = "error"
            downloads[video_id]["error"] = f"Download failed with code {process.returncode}"
            print(f"[{video_id}] ERROR: Download failed")
        
        # Clean up temporary cookies file if we created one
        if cookies_file_to_use and cookies_file_to_use != COOKIES_FILE and cookies_file_to_use.exists():
            try:
                cookies_file_to_use.unlink()
                print(f"[{video_id}] Cleaned up temporary cookies file")
            except Exception as e:
                print(f"[{video_id}] Warning: Could not delete temporary cookies file: {e}")
            
    except Exception as e:
        downloads[video_id]["status"] = "error"
        downloads[video_id]["error"] = str(e)
        print(f"[{video_id}] EXCEPTION: {str(e)}")


@app.route("/api/download", methods=["POST"])
def start_download():
    """Start downloading a YouTube video (only available in local client mode)"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    # Disable YouTube downloads on web client (Render)
    if IS_WEB_CLIENT:
        return jsonify({
            "error": "YouTube downloads are disabled on the web client. Please use the local client to download YouTube videos.",
            "help": "Set LOCAL_DOWNLOADER_MODE=true to enable YouTube downloads locally."
        }), 403
    
    data = request.json
    url = data.get("url")
    
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    
    # Clean and validate URL
    url = url.strip()
    
    # Check if it's actually an error message (starts with brackets or contains error text)
    if url.startswith('[') or 'ERROR:' in url or 'WARNING:' in url:
        return jsonify({"error": "Invalid URL provided. Please enter a valid YouTube URL."}), 400
    
    # Validate it looks like a YouTube URL
    if "youtube.com" not in url and "youtu.be" not in url:
        return jsonify({"error": "Please provide a YouTube URL"}), 400
    
    # Extract video ID to ensure it's a valid YouTube URL format
    import re
    youtube_pattern = r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(youtube_pattern, url)
    if not match:
        return jsonify({"error": "Invalid YouTube URL format"}), 400
    
    # Check if video already exists in shared storage
    existing_video = get_video_by_youtube_url(url)
    if existing_video:
        # Video already downloaded - check if file exists in R2 or locally
        filename = existing_video['filename']
        file_exists = False
        
        if R2_ENABLED and file_exists_in_r2(filename):
            file_exists = True
        else:
            filepath = VIDEOS_DIR / filename
            if filepath.exists():
                file_exists = True
        
        if file_exists:
            # Video exists, return immediately
            user_id = get_current_user_id()
            # Add to user's library if not already there
            video_db_id = existing_video['id']
            # Check if user already has it
            user_lib = get_user_library(user_id)
            if existing_video['filename'] not in user_lib:
                # Add to library with default metadata
                add_video_to_library(user_id, video_db_id, {
                    "title": existing_video['title'] or existing_video['filename'],
                    "sourceUrl": url
                })
            
            return jsonify({
                "id": "existing",
                "status": "complete",
                "filename": existing_video['filename'],
                "title": existing_video['title'],
                "message": "Video already downloaded"
            })
    
    video_id = str(uuid.uuid4())[:8]
    user_id = get_current_user_id()
    
    # Store user_id and URL with download for tracking
    downloads[video_id] = {
        "user_id": user_id,
        "youtube_url": url,
        "status": "starting",
        "progress": 0,
        "title": "Fetching...",
        "filename": None,
        "error": None
    }
    
    # Start download in background thread
    thread = threading.Thread(target=run_ytdlp, args=(video_id, url))
    thread.start()
    
    return jsonify({"id": video_id})


@app.route("/api/upload-video", methods=["POST"])
def upload_video():
    """Receive video upload from local downloader"""
    # Get user_id from session (if logged into remote server) or form data (from local downloader)
    user_id = None
    
    # Try to get user_id from session first (if user is logged into remote server)
    if 'user_id' in session:
        user_id = session.get('user_id')
        print(f"[upload] User authenticated via session: {user_id}")
    # Otherwise get from form data (from local downloader mode)
    elif request.form.get('user_id'):
        user_id = int(request.form.get('user_id'))
        print(f"[upload] User ID from form data (local downloader): {user_id}")
        # Verify user exists in database
        from database import get_user_by_id
        user = get_user_by_id(user_id)
        if not user:
            return jsonify({"error": f"User {user_id} not found"}), 404
        print(f"[upload] Verified user exists: {user.get('email', 'unknown')}")
    
    if not user_id:
        return jsonify({"error": "Authentication required. Please provide user_id or log in."}), 401
    
    # Get video file
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    
    video_file = request.files['video']
    if video_file.filename == '':
        return jsonify({"error": "No video file selected"}), 400
    
    # youtube_url is optional - required for YouTube downloads, optional for direct MP4 uploads
    youtube_url = request.form.get('youtube_url', '')
    title = request.form.get('title', video_file.filename)
    video_id = request.form.get('video_id', '')
    
    try:
        # Save uploaded file
        filename = video_file.filename
        filepath = VIDEOS_DIR / filename
        video_file.save(str(filepath))
        file_size = filepath.stat().st_size
        
        print(f"[upload] Received video upload: {filename} ({file_size / 1024 / 1024:.2f} MB)")
        print(f"[upload]   - youtube_url: {youtube_url or '(direct upload)'}")
        print(f"[upload]   - title: {title}")
        print(f"[upload]   - user_id: {user_id}")
        
        # Upload to R2 if enabled
        if R2_ENABLED:
            print(f"[upload] Uploading to R2...")
            if upload_to_r2(filepath, filename):
                print(f"[upload] ✓ Video uploaded to R2")
                # Optionally delete local file to save disk space (uncomment if desired)
                # filepath.unlink()
                # print(f"[upload] Local file deleted (stored in R2 only)")
            else:
                print(f"[upload] ⚠ Failed to upload to R2, keeping local file")
        
        # Check if video already exists (by youtube_url if provided, or by filename)
        existing = None
        if youtube_url:
            existing = get_video_by_youtube_url(youtube_url)
        else:
            # For direct MP4 uploads without youtube_url, check by filename
            from database import get_video_by_filename
            existing = get_video_by_filename(filename)
        
        if existing:
            video_db_id = existing['id']
            print(f"[upload] Video already exists (ID: {video_db_id}), using existing entry")
        else:
            # Create new video entry
            video_db_id = create_video(filename, youtube_url if youtube_url else None, title, file_size)
            if video_db_id:
                print(f"[upload] ✓ Video registered (ID: {video_db_id})")
            else:
                raise Exception("create_video returned None")
        
        # Add to user's library
        if video_db_id:
            add_video_to_library(user_id, video_db_id, {
                "title": title,
                "sourceUrl": youtube_url if youtube_url else f"uploaded:{filename}"
            })
            print(f"[upload] ✓ Video added to user's library")
        
        return jsonify({
            "success": True,
            "video_id": video_db_id,
            "filename": filename,
            "message": "Video uploaded successfully"
        })
        
    except Exception as e:
        print(f"[upload] ERROR: {str(e)}")
        # Clean up file if it was saved
        if filepath.exists():
            try:
                filepath.unlink()
            except:
                pass
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500


@app.route("/api/download/<video_id>", methods=["GET"])
def get_download_status(video_id):
    """Get the status of a download"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    if video_id not in downloads:
        return jsonify({"error": "Download not found"}), 404
    
    # Only return download if it belongs to current user
    if downloads[video_id].get("user_id") != user_id:
        return jsonify({"error": "Download not found"}), 404
    
    return jsonify(downloads[video_id])


def extract_video_id_from_url(url):
    """Extract YouTube video ID from URL"""
    import re
    patterns = [
        r'[?&]v=([^&]+)',
        r'youtu\.be/([^?&]+)',
        r'^([a-zA-Z0-9_-]{11})$'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


# Removed Piped/Invidious API fallback methods - using yt-dlp directly instead
# These methods were causing timeouts and worker crashes
# yt-dlp works reliably with proper proxy and cookie configuration


@app.route("/api/videos", methods=["GET"])
def list_videos():
    """List videos in user's library (only shows videos the user has added)"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    user_library = get_user_library(user_id)
    
    videos = []
    # Only show videos that are in the user's library
    for filename, metadata in user_library.items():
        # Check if file exists in R2 or locally
        file_exists = False
        file_size = None
        
        if R2_ENABLED and file_exists_in_r2(filename):
            file_exists = True
            file_size = get_file_size_from_r2(filename) or 0
        else:
            filepath = VIDEOS_DIR / filename
            if filepath.exists():
                file_exists = True
                file_size = filepath.stat().st_size
        
        if file_exists:
            videos.append({
                "id": filename.split('.')[0],  # Use filename without extension as ID
                "filename": filename,
                "title": metadata.get("title", filename),
                "size": file_size
            })
    
    return jsonify(videos)


@app.route("/api/videos/<filename>", methods=["DELETE"])
def delete_video(filename):
    """Remove video from user's library (only deletes file if no other users have it)"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    
    # Remove from user's library
    removed = remove_video_from_library(user_id, filename)
    
    if not removed:
        return jsonify({"error": "Video not found in your library"}), 404
    
    # Check if any other users still have this video
    video = get_video_by_filename(filename)
    if video:
        ref_count = get_video_reference_count(video['id'])
        
        if ref_count == 0:
            # No other users have it - delete the file
            filepath = VIDEOS_DIR / filename
            files_deleted = []
            
            # Delete from R2 if enabled
            if R2_ENABLED:
                if delete_from_r2(filename):
                    files_deleted.append(f"{filename} (R2)")
            
            # Delete local file if it exists
            if filepath.exists():
                filepath.unlink()
                files_deleted.append(filename)
            
            # Also try to delete related files
            base_id = filename.split('.')[0]
            for related_file in VIDEOS_DIR.glob(f"{base_id}.*"):
                if related_file.name != filename and related_file.exists():
                    related_file.unlink()
                    files_deleted.append(related_file.name)
            
            # Delete from videos table (CASCADE will clean up library references)
            from database import get_db
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('DELETE FROM videos WHERE id = ?', (video['id'],))
            conn.commit()
            conn.close()
            
            return jsonify({
                "success": True,
                "deleted_from_library": True,
                "file_deleted": True,
                "deleted_files": files_deleted,
                "message": "Video removed from your library and deleted (no other users had it)"
            })
        else:
            return jsonify({
                "success": True,
                "deleted_from_library": True,
                "file_deleted": False,
                "message": f"Video removed from your library (still used by {ref_count} other user(s))"
            })
    
    return jsonify({"success": True, "deleted_from_library": True})


@app.route("/videos/<filename>")
def serve_video(filename):
    """Serve a video file from R2 or local storage"""
    # Check if file exists in R2 first
    if R2_ENABLED and file_exists_in_r2(filename):
        # Generate presigned URL (valid for 1 hour)
        r2_url = get_r2_url(filename, expires_in=3600)
        if r2_url:
            return redirect(r2_url)
    
    # Fallback to local file if R2 not enabled or file not in R2
    filepath = VIDEOS_DIR / filename
    if filepath.exists():
        return send_from_directory(str(VIDEOS_DIR), filename)
    
    return jsonify({"error": "Video not found"}), 404


@app.route("/")
def serve_frontend():
    """Serve the main frontend page"""
    return send_from_directory(app.static_folder, 'index.html')


# ======================
# Authentication Routes
# ======================

@app.route("/api/auth/register", methods=["POST"])
def register():
    """Register a new user"""
    data = request.json
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    
    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400
    
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    
    user = create_user(username, email, password)
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({"success": True, "user": user}), 201
    else:
        return jsonify({"error": "Username or email already exists"}), 409


@app.route("/api/auth/login", methods=["POST"])
def login():
    """Login user"""
    data = request.json
    username = data.get("username", "").strip()
    password = data.get("password", "")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    
    user = verify_user(username, password)
    if user:
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({"success": True, "user": user})
    else:
        return jsonify({"error": "Invalid username or password"}), 401


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    """Logout user"""
    session.clear()
    return jsonify({"success": True})


@app.route("/api/auth/me", methods=["GET"])
def get_current_user():
    """Get current user info - supports both session cookies and auth tokens"""
    # Try to get user_id from session first (web client)
    user_id = get_current_user_id()
    
    # If no session, try auth token (local client)
    if not user_id:
        auth_token = request.args.get('token') or request.headers.get('X-Auth-Token')
        if auth_token and hasattr(app, 'auth_tokens') and auth_token in app.auth_tokens:
            import time
            token_data = app.auth_tokens[auth_token]
            # Check if token expired
            if time.time() < token_data['expires']:
                user_id = token_data['user_id']
            else:
                # Token expired, remove it
                del app.auth_tokens[auth_token]
    
    if not user_id:
        return jsonify({"authenticated": False}), 200
    
    user = get_user_by_id(user_id)
    if user:
        # Check if user has cookies configured
        from database import get_user_youtube_cookies
        has_cookies = get_user_youtube_cookies(user_id) is not None
        user["has_youtube_cookies"] = has_cookies
        return jsonify({"authenticated": True, "user": user})
    else:
        session.clear()
        return jsonify({"authenticated": False}), 200


@app.route("/api/auth/cookies", methods=["POST"])
def save_user_cookies():
    """Save YouTube cookies for the current user"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    data = request.json
    cookies_data = data.get("cookies")
    
    if not cookies_data:
        return jsonify({"error": "No cookies data provided"}), 400
    
    # Validate it looks like Netscape cookie format
    if not (cookies_data.startswith('# Netscape HTTP Cookie File') or 
            cookies_data.startswith('# HTTP Cookie File')):
        return jsonify({"error": "Invalid cookie format. Please export cookies in Netscape format."}), 400
    
    from database import set_user_youtube_cookies
    success = set_user_youtube_cookies(user_id, cookies_data)
    
    if success:
        return jsonify({"message": "Cookies saved successfully"})
    else:
        return jsonify({"error": "Failed to save cookies"}), 500


@app.route("/api/auth/cookies", methods=["GET"])
def get_user_cookies_status():
    """Get whether user has cookies configured (without returning the actual cookies)"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    from database import get_user_youtube_cookies
    has_cookies = get_user_youtube_cookies(user_id) is not None
    
    return jsonify({"has_cookies": has_cookies})


@app.route("/api/auth/google", methods=["GET"])
def google_login():
    """Initiate Google OAuth login"""
    # Get frontend URL for error redirects
    frontend_url = request.args.get('frontend_url') or request.headers.get('Referer')
    if frontend_url:
        try:
            parsed = urlparse(frontend_url)
            frontend_origin = f"{parsed.scheme}://{parsed.netloc}"
        except:
            frontend_origin = request.url_root.rstrip('/')
    else:
        frontend_origin = request.url_root.rstrip('/')
    
    if not google:
        # Redirect to frontend with error instead of returning JSON
        return redirect(f"{frontend_origin}#/login?error=oauth_not_configured")
    
    # Store the frontend URL in session for redirect after OAuth
    session['oauth_frontend_url'] = frontend_origin
    
    try:
        # Build redirect URI dynamically based on current request
        redirect_uri = url_for('google_callback', _external=True)
        return google.authorize_redirect(redirect_uri)
    except Exception as e:
        print(f"OAuth redirect error: {str(e)}")
        import traceback
        traceback.print_exc()
        return redirect(f"{frontend_origin}#/login?error=oauth_error")


@app.route("/api/auth/google/callback", methods=["GET"])
def google_callback():
    """Handle Google OAuth callback"""
    # Get frontend URL from session (set during login initiation)
    frontend_url = session.pop('oauth_frontend_url', None) or request.url_root.rstrip('/')
    
    if not google:
        return redirect(f"{frontend_url}#/login?error=oauth_not_configured")
    
    try:
        token = google.authorize_access_token()
        
        # Fetch user info from Google
        import requests
        user_info_response = requests.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f"Bearer {token['access_token']}"}
        )
        
        if user_info_response.status_code != 200:
            return redirect(f"{frontend_url}#/login?error=oauth_failed")
        
        user_info = user_info_response.json()
        
        # Extract user information
        google_id = user_info.get('id') or user_info.get('sub')
        email = user_info.get('email')
        name = user_info.get('name') or (email.split('@')[0] if email else 'user')
        picture = user_info.get('picture')
        
        if not google_id:
            return redirect(f"{frontend_url}#/login?error=oauth_failed")
        
        # Check if user already exists
        user = get_user_by_oauth('google', google_id)
        
        if not user:
            # Create new user
            print(f"Creating new Google OAuth user: {name} ({email}), Google ID: {google_id}")
            user = create_user(
                username=name,
                email=email,
                password=None,
                oauth_provider='google',
                oauth_id=google_id
            )
            
            if not user:
                print(f"Failed to create user. This might be because:")
                print(f"  - Username '{name}' already exists")
                print(f"  - Google ID '{google_id}' already exists")
                print(f"  - Email '{email}' might conflict")
                
                # Check if OAuth ID already exists (user already created)
                existing_oauth = get_user_by_oauth('google', google_id)
                if existing_oauth:
                    print(f"User already exists with this Google ID, using existing account")
                    user = existing_oauth
                else:
                    return redirect(f"{frontend_url}#/login?error=user_creation_failed")
        
        # Set session (for web client)
        session['user_id'] = user['id']
        session['username'] = user['username']
        
        # For local client: generate auth token and include in redirect URL
        # Check if this is a local client request (localhost origin)
        is_local_client = 'localhost' in frontend_url or '127.0.0.1' in frontend_url
        
        if is_local_client:
            # Generate a simple auth token (user_id + timestamp hash)
            import hashlib
            import time
            token_data = f"{user['id']}:{time.time()}"
            auth_token = hashlib.sha256(f"{token_data}:{app.secret_key}".encode()).hexdigest()[:32]
            
            # Store token temporarily (could use Redis in production, but for now use a simple dict)
            if not hasattr(app, 'auth_tokens'):
                app.auth_tokens = {}
            app.auth_tokens[auth_token] = {
                'user_id': user['id'],
                'username': user['username'],
                'expires': time.time() + 86400  # 24 hours
            }
            
            # Redirect with token in URL
            return redirect(f"{frontend_url}#/dashboard?token={auth_token}")
        else:
            # Web client: normal session-based redirect
            return redirect(f"{frontend_url}#/dashboard")
        
    except Exception as e:
        print(f"Google OAuth error: {str(e)}")
        import traceback
        traceback.print_exc()
        return redirect(f"{frontend_url}#/login?error=oauth_error")


# ======================
# User Data Routes
# ======================

@app.route("/api/shows", methods=["GET"])
def get_shows():
    """Get all shows for current user"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    shows = get_user_shows(user_id)
    return jsonify(shows)


@app.route("/api/shows", methods=["POST"])
def save_show_endpoint():
    """Save a show"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    data = request.json
    show_name = data.get("name", "").strip()
    show_data = data.get("data", {})
    
    if not show_name:
        return jsonify({"error": "Show name required"}), 400
    
    user_id = get_current_user_id()
    save_show(user_id, show_name, show_data)
    return jsonify({"success": True})


@app.route("/api/shows/<show_name>", methods=["DELETE"])
def delete_show_endpoint(show_name):
    """Delete a show"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    deleted = delete_show(user_id, show_name)
    if deleted:
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Show not found"}), 404


@app.route("/api/library", methods=["GET"])
def get_library():
    """Get library metadata for current user"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    library = get_user_library(user_id)
    return jsonify(library)


@app.route("/api/library", methods=["POST"])
def save_library_endpoint():
    """Save library metadata"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        filename = data.get("filename")
        metadata = data.get("metadata", {})
        
        if not filename:
            return jsonify({"error": "Filename required"}), 400
        
        user_id = get_current_user_id()
        print(f"Saving library metadata for user {user_id}, filename: {filename}")
        print(f"Metadata keys: {list(metadata.keys())}")
        
        result = save_library_metadata(user_id, filename, metadata)
        
        if result is None:
            # Video doesn't exist in shared storage - try to create it
            print(f"Video {filename} not found in shared storage, attempting to create entry...")
            from pathlib import Path
            videos_dir = Path(__file__).parent / "videos"
            filepath = videos_dir / filename
            
            if filepath.exists():
                print(f"File exists, creating video entry...")
                file_size = filepath.stat().st_size
                from database import create_video, add_video_to_library
                video_id = create_video(filename, None, metadata.get("title", filename), file_size)
                if video_id:
                    add_video_to_library(user_id, video_id, metadata)
                    print(f"Created video entry and added to library")
                    return jsonify({"success": True})
            else:
                print(f"File {filename} does not exist in videos directory")
                return jsonify({"error": f"Video file not found: {filename}"}), 404
        
        print(f"Successfully saved library metadata")
        return jsonify({"success": True})
    except Exception as e:
        print(f"Error saving library metadata: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Server error: {str(e)}"}), 500


@app.route("/api/library/<filename>", methods=["DELETE"])
def delete_library_endpoint(filename):
    """Delete library metadata"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    deleted = delete_library_item(user_id, filename)
    if deleted:
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Library item not found"}), 404


@app.route("/api/cleanup", methods=["POST"])
def cleanup_videos():
    """Clean up orphaned videos (videos with no library references)"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    deleted_files = cleanup_orphaned_videos()
    
    # Also delete the actual files from R2 and local storage
    files_deleted = []
    for filename in deleted_files:
        # Delete from R2 if enabled
        if R2_ENABLED:
            if delete_from_r2(filename):
                files_deleted.append(f"{filename} (R2)")
        
        # Delete local file if it exists
        filepath = VIDEOS_DIR / filename
        if filepath.exists():
            filepath.unlink()
            files_deleted.append(filename)
    
    return jsonify({
        "success": True,
        "orphaned_videos_removed": len(deleted_files),
        "files_deleted": files_deleted
    })


@app.route("/api/debug/downloads", methods=["GET"])
def debug_downloads():
    """Debug endpoint to check recent downloads and their status"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    
    # Get all downloads for this user
    user_downloads = {
        vid: info for vid, info in downloads.items()
        if info.get("user_id") == user_id
    }
    
    # Get user's library
    from database import get_user_library
    user_library = get_user_library(user_id)
    
    return jsonify({
        "user_id": user_id,
        "downloads": user_downloads,
        "library_count": len(user_library),
        "library_files": list(user_library.keys())
    })


@app.route("/api/health")
def health():
    """Health check endpoint"""
    # Check if yt-dlp is available
    try:
        result = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True)
        ytdlp_version = result.stdout.strip() if result.returncode == 0 else None
    except FileNotFoundError:
        ytdlp_version = None
    
    return jsonify({
        "status": "ok",
        "ytdlp_available": ytdlp_version is not None,
        "ytdlp_version": ytdlp_version
    })


if __name__ == "__main__":
    print("🎆 Fireworks Planner Backend")
    print(f"📁 Videos will be saved to: {VIDEOS_DIR.absolute()}")
    if FFMPEG_PATH:
        print(f"🎬 FFmpeg found at: {FFMPEG_PATH}")
    else:
        print("⚠️  FFmpeg not found - videos will not have audio!")
    
    port = int(os.environ.get("PORT", 5000))
    host = "0.0.0.0"
    debug = not IS_PRODUCTION
    
    if IS_PRODUCTION:
        print(f"🌐 Starting production server on port {port}")
    else:
        print(f"🌐 Starting development server on http://localhost:{port}")
    
    app.run(host=host, port=port, debug=debug)
