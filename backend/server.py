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

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__, static_folder='../frontend', static_url_path='')
# Use environment variable for secret key in production, generate random one for dev
app.secret_key = os.environ.get('SECRET_KEY') or ('dev-secret-key-' + str(uuid.uuid4()))
CORS(app, supports_credentials=True)

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
YOUTUBE_PROXY = os.environ.get('YOUTUBE_PROXY')

def is_bright_data_proxy(proxy_url):
    """Check if proxy is Bright Data (formerly Luminati)"""
    if not proxy_url:
        return False
    bright_data_hosts = ['brd.superproxy.io', 'lum-superproxy.io', 'zproxy.lum-superproxy.io']
    return any(host in proxy_url for host in bright_data_hosts)

# Bright Data proxies do SSL interception, so we need to disable SSL verification
BRIGHT_DATA_PROXY = is_bright_data_proxy(YOUTUBE_PROXY) if YOUTUBE_PROXY else False

if YOUTUBE_PROXY:
    proxy_display = YOUTUBE_PROXY.split('@')[-1] if '@' in YOUTUBE_PROXY else YOUTUBE_PROXY
    proxy_type = "Bright Data residential" if BRIGHT_DATA_PROXY else "proxy"
    print(f"✓ YouTube {proxy_type} configured: {proxy_display}")
    if BRIGHT_DATA_PROXY:
        print("  ℹ SSL verification will be disabled for Bright Data proxy (required for SSL interception)")
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
    """Check if user is authenticated"""
    if not get_current_user_id():
        return jsonify({"error": "Authentication required"}), 401
    return None


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
        
        if has_cookies:
            # mweb client - supports cookies, PO Token Provider plugin will automatically provide PO Tokens
            player_client = "mweb"
        else:
            # android client doesn't support cookies but may work without them
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
        
        # Add proxy if configured
        if YOUTUBE_PROXY:
            info_cmd.extend(["--proxy", YOUTUBE_PROXY])
            proxy_display = YOUTUBE_PROXY.split('@')[-1] if '@' in YOUTUBE_PROXY else YOUTUBE_PROXY
            print(f"[{video_id}] Using proxy: {proxy_display}")
            # Bright Data proxies require disabling SSL verification due to SSL interception
            if BRIGHT_DATA_PROXY:
                info_cmd.extend(["--no-check-certificate"])
                print(f"[{video_id}] SSL verification disabled for Bright Data proxy")
        
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
        print(f"[{video_id}] Fetching video info...")
        info_result = subprocess.run(info_cmd, capture_output=True, text=True)
        
        if info_result.returncode == 0:
            info = json.loads(info_result.stdout)
            downloads[video_id]["title"] = info.get("title", "Unknown")
            print(f"[{video_id}] Title: {downloads[video_id]['title']}")
        else:
            print(f"[{video_id}] Warning: Could not fetch video info")
            print(f"[{video_id}] stderr: {info_result.stderr}")
        
        # Now download - ensuring merged audio+video output
        # Use same client and extractor args as info fetch
        cmd = [
            "yt-dlp",
            "--extractor-args", extractor_args,  # Same extractor args (includes PO Token if available)
            "--user-agent", user_agent,
            "--referer", "https://www.youtube.com/",
            "--add-header", "Accept-Language:en-US,en;q=0.9",
            "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "--add-header", "Accept-Encoding:gzip, deflate",
            "--add-header", "DNT:1",
            "--add-header", "Connection:keep-alive",
            "--add-header", "Upgrade-Insecure-Requests:1",
        ]
        
        # Add proxy if configured
        if YOUTUBE_PROXY:
            cmd.extend(["--proxy", YOUTUBE_PROXY])
            # Bright Data proxies require disabling SSL verification due to SSL interception
            if BRIGHT_DATA_PROXY:
                cmd.extend(["--no-check-certificate"])
        
        # Add cookies if available (use same cookies file as info fetch)
        if has_cookies:
            cmd.extend(["--cookies", str(cookies_file_to_use)])
            print(f"[{video_id}] Using cookies {cookie_source} with {player_client} client")
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
                    else:
                        raise Exception("video_db_id is None")
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
    """Start downloading a YouTube video"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
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
        # Video already downloaded - check if file still exists
        filepath = VIDEOS_DIR / existing_video['filename']
        if filepath.exists():
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
        filepath = VIDEOS_DIR / filename
        if filepath.exists():
            videos.append({
                "id": filepath.stem,
                "filename": filename,
                "title": metadata.get("title", filename),
                "size": filepath.stat().st_size
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
    """Serve a video file"""
    return send_from_directory(VIDEOS_DIR, filename)


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
    """Get current user info"""
    user_id = get_current_user_id()
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
        
        # Set session
        session['user_id'] = user['id']
        session['username'] = user['username']
        
        # Redirect to frontend URL
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
    
    # Also delete the actual files
    files_deleted = []
    for filename in deleted_files:
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
