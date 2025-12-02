# Local Client Setup - Complete Guide

## Quick Start (One Command!)

Just run:
```bash
python start_local_client.py
```

That's it! The launcher handles everything:
- ✅ Starts backend server locally (in downloader mode)
- ✅ Starts frontend server
- ✅ Configures frontend to connect to local backend
- ✅ Opens browser automatically
- ✅ Sets up YouTube downloads (works locally!)
- ✅ Configures auto-upload to remote server

## What It Does

1. **Backend Server** (port 5000):
   - Runs locally in `LOCAL_DOWNLOADER_MODE`
   - Downloads YouTube videos locally (no IP blocking!)
   - Automatically uploads to remote server after download
   - Handles all API requests

2. **Frontend Server** (port 8080):
   - Serves the web interface locally
   - Automatically configured to connect to local backend
   - Opens in your browser automatically

3. **Remote Server**:
   - Receives uploaded videos from local client
   - Stores videos permanently
   - Accessible from web client

## Configuration

### Environment Variables (Optional)

- `REMOTE_API_URL`: Remote server URL (default: `https://fireworks-planner.onrender.com`)
- `LOCAL_BACKEND_PORT`: Backend port (default: `5000`)
- `FRONTEND_PORT`: Frontend port (default: `8080`)

### Example with Custom Settings

```bash
REMOTE_API_URL=https://your-server.onrender.com python start_local_client.py
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Local Client (Your Computer)           │
│  ┌──────────────┐  ┌──────────────┐   │
│  │  Frontend    │──│  Backend     │   │
│  │  (Port 8080) │  │  (Port 5000) │   │
│  └──────────────┘  └──────┬───────┘   │
│                           │            │
│                    Downloads YouTube    │
│                    Videos Locally       │
└───────────────────────────┼────────────┘
                            │
                            │ Uploads videos
                            ▼
┌─────────────────────────────────────────┐
│  Remote Server (Render)                 │
│  ┌──────────────────────────────────┐  │
│  │  Backend API                     │  │
│  │  - Receives video uploads        │  │
│  │  - Stores videos permanently     │  │
│  │  - Serves videos to web client   │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Features

✅ **YouTube Downloads**: Work reliably (no Render IP blocking)  
✅ **Auto-Upload**: Videos automatically upload to remote server  
✅ **Web Interface**: Full-featured web UI served locally  
✅ **No Configuration**: Just run one command  
✅ **Auto-Browser**: Opens browser automatically  

## Troubleshooting

### Port Already in Use

If port 5000 or 8080 is in use:

```bash
LOCAL_BACKEND_PORT=5001 FRONTEND_PORT=8081 python start_local_client.py
```

### Backend Won't Start

- Make sure you're in the project root directory
- Check that `backend/server.py` exists
- Make sure Python dependencies are installed: `pip install -r backend/requirements.txt`

### Frontend Not Loading

- Check that `frontend/index.html` exists
- Make sure backend started successfully (check console output)
- Try accessing `http://localhost:8080` manually

### Videos Not Uploading

- Check that `REMOTE_API_URL` is correct
- Verify remote server is accessible
- Check backend logs for upload errors

## Creating a Standalone Executable

### Using PyInstaller

1. **Install PyInstaller**:
   ```bash
   pip install pyinstaller
   ```

2. **Create executable**:
   ```bash
   pyinstaller --onefile --name "FireworksPlanner" --add-data "frontend;frontend" --add-data "backend;backend" start_local_client.py
   ```

3. **Run the executable**:
   ```bash
   ./dist/FireworksPlanner
   ```

Note: You'll need to include all Python dependencies and ensure the backend can import Flask, etc.

## How It Works

1. **Launcher starts backend**: Runs `backend/server.py` with `LOCAL_DOWNLOADER_MODE=true`
2. **Launcher starts frontend**: Serves `frontend/` directory on port 8080
3. **Frontend configured**: Automatically points to `http://localhost:5000` for API calls
4. **User downloads video**: YouTube download happens locally (works!)
5. **Auto-upload**: Video automatically uploads to remote server
6. **Remote storage**: Video stored permanently on Render server

## Benefits

- **No IP Blocking**: YouTube downloads work locally
- **Reliable**: No proxy issues, no timeouts
- **Simple**: One command to run everything
- **Flexible**: Can still access remote server for stored videos
- **Fast**: Local downloads are faster than remote
