"""
Fireworks Planner Backend
Handles YouTube video downloads via yt-dlp and serves video files
"""

import os
import json
import subprocess
import threading
import uuid
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

# Configuration
VIDEOS_DIR = Path(__file__).parent / "videos"
VIDEOS_DIR.mkdir(exist_ok=True)

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

# Track download progress
downloads = {}


def run_ytdlp(video_id, url):
    """Run yt-dlp in a subprocess and track progress"""
    output_path = VIDEOS_DIR / f"{video_id}.mp4"
    
    downloads[video_id] = {
        "status": "downloading",
        "progress": 0,
        "title": "Fetching...",
        "filename": None,
        "error": None
    }
    
    try:
        # First, get video info
        info_cmd = [
            "yt-dlp",
            "--dump-json",
            "--no-download",
            url
        ]
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
        cmd = [
            "yt-dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",  # Get best mp4 video + m4a audio
            "--merge-output-format", "mp4",  # Merge into mp4
            "-o", str(output_path),  # Direct output path
            "--no-playlist",
            "--progress",  # Show progress
            url
        ]
        
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
                downloads[video_id]["filename"] = output_path.name
                downloads[video_id]["status"] = "complete"
                downloads[video_id]["progress"] = 100
                print(f"[{video_id}] Download complete: {output_path.name}")
                print(f"[{video_id}] File size: {output_path.stat().st_size / 1024 / 1024:.2f} MB")
            else:
                downloads[video_id]["status"] = "error"
                downloads[video_id]["error"] = "Merged file not found after download"
                print(f"[{video_id}] ERROR: Merged file not found at {output_path}")
        else:
            downloads[video_id]["status"] = "error"
            downloads[video_id]["error"] = f"Download failed with code {process.returncode}"
            print(f"[{video_id}] ERROR: Download failed")
            
    except Exception as e:
        downloads[video_id]["status"] = "error"
        downloads[video_id]["error"] = str(e)
        print(f"[{video_id}] EXCEPTION: {str(e)}")


@app.route("/api/download", methods=["POST"])
def start_download():
    """Start downloading a YouTube video"""
    data = request.json
    url = data.get("url")
    
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    
    # Validate it looks like a YouTube URL
    if "youtube.com" not in url and "youtu.be" not in url:
        return jsonify({"error": "Please provide a YouTube URL"}), 400
    
    video_id = str(uuid.uuid4())[:8]
    
    # Start download in background thread
    thread = threading.Thread(target=run_ytdlp, args=(video_id, url))
    thread.start()
    
    return jsonify({"id": video_id})


@app.route("/api/download/<video_id>", methods=["GET"])
def get_download_status(video_id):
    """Get the status of a download"""
    if video_id not in downloads:
        return jsonify({"error": "Download not found"}), 404
    
    return jsonify(downloads[video_id])


@app.route("/api/videos", methods=["GET"])
def list_videos():
    """List all downloaded videos"""
    videos = []
    for f in VIDEOS_DIR.glob("*"):
        if f.suffix.lower() in [".mp4", ".webm", ".mkv", ".mov", ".avi"]:
            # Try to find title from downloads dict
            video_id = f.stem
            title = downloads.get(video_id, {}).get("title", f.stem)
            videos.append({
                "id": video_id,
                "filename": f.name,
                "title": title,
                "size": f.stat().st_size
            })
    return jsonify(videos)


@app.route("/api/videos/<filename>", methods=["DELETE"])
def delete_video(filename):
    """Delete a video file (and any related audio files)"""
    files_deleted = []
    
    # Delete the specified file
    filepath = VIDEOS_DIR / filename
    if filepath.exists():
        filepath.unlink()
        files_deleted.append(filename)
    
    # Also try to delete related files (e.g., .f137.mp4 and .f140.m4a pairs)
    # Extract base ID without format code
    base_id = filename.split('.')[0]
    for related_file in VIDEOS_DIR.glob(f"{base_id}.*"):
        if related_file.name != filename and related_file.exists():
            related_file.unlink()
            files_deleted.append(related_file.name)
    
    if files_deleted:
        return jsonify({"success": True, "deleted": files_deleted})
    return jsonify({"error": "File not found"}), 404


@app.route("/videos/<filename>")
def serve_video(filename):
    """Serve a video file"""
    return send_from_directory(VIDEOS_DIR, filename)


@app.route("/")
def serve_frontend():
    """Serve the main frontend page"""
    return send_from_directory(app.static_folder, 'index.html')


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
