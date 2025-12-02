# Local Downloader Mode Setup

This mode allows you to download YouTube videos locally (where downloads work reliably) and automatically upload them to your remote Render server.

## How It Works

1. **Local Instance**: Downloads videos using your local machine (bypasses Render's IP blocking)
2. **Upload to Remote**: After download completes, automatically uploads video file to remote server
3. **Remote Storage**: Video is saved on Render server and added to your library
4. **Cleanup**: Local file is deleted after successful upload

## Setup Instructions

### 1. Remote Server (Render)

No changes needed! The remote server already has the `/api/upload-video` endpoint.

### 2. Local Instance

Set these environment variables when running locally:

```bash
# Enable local downloader mode
LOCAL_DOWNLOADER_MODE=true

# Your remote server URL
REMOTE_SERVER_URL=https://fireworks-planner.onrender.com

# Your user ID (you'll need to get this from the remote server)
# You can get it by logging into the remote server and checking the session
# Or we can add an API endpoint to get it
```

### 3. Authentication

The local downloader needs to authenticate with the remote server. Options:

**Option A: Session-based (if running in browser)**
- Log into the remote server in your browser
- The session cookie will be used automatically

**Option B: User ID in form data**
- Pass `user_id` in the upload request
- You'll need to get your user_id from the remote server

**Option C: API Key (future enhancement)**
- We can add API key authentication if needed

## Running Locally

### Start the local server:

```bash
cd backend
python server.py
```

Or with environment variables:

```bash
LOCAL_DOWNLOADER_MODE=true REMOTE_SERVER_URL=https://fireworks-planner.onrender.com python backend/server.py
```

### Using the Frontend

1. Open `http://localhost:5000` in your browser
2. Log in (you'll need to authenticate with Google OAuth)
3. Download videos as normal
4. Videos will download locally, then upload to remote server

## Getting Your User ID

To get your user_id, you can:

1. Log into the remote server
2. Check browser DevTools → Application → Cookies → `session`
3. Or add a debug endpoint to show your user_id

Alternatively, we can modify the code to automatically get user_id from the remote server's `/api/auth/me` endpoint.

## Troubleshooting

### Upload Fails

- Check that `REMOTE_SERVER_URL` is correct
- Verify you're authenticated (check session cookie)
- Check remote server logs for errors
- Ensure remote server has enough disk space

### Authentication Issues

- Make sure you're logged into the remote server in your browser
- Or pass `user_id` explicitly in the upload request
- Check that CORS is configured correctly on remote server

### Local File Not Deleted

- Check upload was successful (check logs)
- File will remain if upload fails (for retry)
- You can manually delete local files from `backend/videos/`

## Benefits

✅ Downloads work reliably (no Render IP blocking)  
✅ Videos stored on remote server (accessible from anywhere)  
✅ Automatic cleanup (local files deleted after upload)  
✅ Same user experience (frontend works the same way)

## Future Enhancements

- API key authentication for local downloader
- Automatic user_id detection from remote server
- Retry logic for failed uploads
- Progress tracking for uploads
- Batch upload support

