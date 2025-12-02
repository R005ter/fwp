# Fireworks Planner Architecture

## Overview

The application supports three client types, all connecting to the same remote backend:

1. **Local Client** (Windows executable) - Full functionality including YouTube downloads
2. **Web Client** (Render) - Full functionality except YouTube downloads
3. **Mobile Client** - Uses videos from library, can edit shows and library

## Client Capabilities

### Local Client (Son's PC)
✅ **Full Access**
- Add YouTube videos to library (via local yt-dlp)
- Upload MP4 files directly
- Edit shows (create, save, delete)
- Edit library (trim, crop, metadata)
- View all videos in library
- All features available

**How it works:**
- Frontend runs on `localhost:8080`
- Connects to remote server for auth, library, shows
- YouTube downloads use local backend (`localhost:5000`)
- Downloaded videos automatically upload to remote server
- Uses token-based auth (stored in localStorage)

### Web Client (Render)
✅ **Most Features**
- Upload MP4 files directly
- Edit shows (create, save, delete)
- Edit library (trim, crop, metadata)
- View all videos in library
- ❌ **Cannot** add YouTube videos (blocked)

**How it works:**
- Frontend and backend on same Render instance
- Uses session cookies for auth
- YouTube downloads disabled (`IS_WEB_CLIENT` check)
- All other endpoints work normally

### Mobile Client
✅ **Library & Editing**
- View videos from library
- Edit shows (create, save, delete)
- Edit library items (trim, crop, metadata)
- ❌ **Cannot** add YouTube videos
- ❌ **Cannot** upload MP4 files (if not implemented)

**How it works:**
- Same frontend code (responsive design)
- Connects to remote server
- Uses same API endpoints as web client
- Session-based auth

## API Endpoints

### Authentication
- `POST /api/auth/google` - OAuth login (all clients)
- `GET /api/auth/me` - Get current user (supports tokens & sessions)
- `POST /api/auth/logout` - Logout

### Videos
- `GET /api/videos` - List videos in library (all clients)
- `POST /api/upload-video` - Upload MP4 file (web & local)
- `POST /api/download` - Download YouTube video (**local client only**)
- `GET /api/download/<id>` - Check download status (local client)

### Shows
- `GET /api/shows` - Get all shows (all clients)
- `POST /api/shows` - Save show (all clients)
- `DELETE /api/shows/<name>` - Delete show (all clients)

### Library
- `GET /api/library` - Get library metadata (all clients)
- `POST /api/library` - Save library metadata (all clients)
- `DELETE /api/library/<id>` - Delete library item (all clients)

## Authentication Methods

### Web Client (Render)
- Uses Flask session cookies
- Domain: `fireworks-planner.onrender.com`
- CORS configured for same-origin

### Local Client
- Uses token-based auth
- Token generated after OAuth login
- Token stored in localStorage
- Sent via `X-Auth-Token` header
- Token expires after 24 hours

### Mobile Client
- Uses session cookies (same as web)
- Or token-based if implemented

## Data Flow

### YouTube Download (Local Client Only)
```
1. User enters YouTube URL in local client
2. Frontend routes to local backend (localhost:5000)
3. Local backend downloads via yt-dlp
4. Local backend uploads to remote server
5. Remote server saves to database
6. Video appears in library (all clients)
```

### MP4 Upload (Web & Local)
```
1. User selects MP4 file
2. Frontend uploads to remote server
3. Remote server saves file and metadata
4. Video appears in library (all clients)
```

### Show Editing (All Clients)
```
1. User edits show in frontend
2. Frontend saves to remote server
3. Remote server updates database
4. Changes visible to all clients
```

### Library Editing (All Clients)
```
1. User edits library item (trim, crop, etc.)
2. Frontend saves metadata to remote server
3. Remote server updates database
4. Changes visible to all clients
```

## Key Implementation Details

### YouTube Download Blocking
```python
# backend/server.py
if IS_WEB_CLIENT and not LOCAL_DOWNLOADER_MODE:
    return jsonify({
        "error": "YouTube downloads are disabled on the web client..."
    }), 403
```

### Local Client Routing
```javascript
// start_local_client.py injects this
window.fetch = function(url, options) {
  // Route YouTube downloads to local backend
  if (url.includes('/api/download')) {
    url = url.replace(REMOTE_API_BASE, LOCAL_BACKEND_URL);
  }
  // Add auth token for remote API calls
  if (authToken) {
    options.headers['X-Auth-Token'] = authToken;
  }
  return originalFetch(url, options);
};
```

### Token Generation
```python
# backend/server.py - google_callback()
if is_local_client:
    auth_token = hashlib.sha256(...).hexdigest()[:32]
    app.auth_tokens[auth_token] = {
        'user_id': user['id'],
        'expires': time.time() + 86400  # 24 hours
    }
    return redirect(f"{frontend_url}#/dashboard?token={auth_token}")
```

## Summary

✅ **Local Client**: Full functionality (YouTube + everything else)
✅ **Web Client**: Everything except YouTube downloads
✅ **Mobile Client**: Library access + editing (no uploads/downloads)

All clients share the same:
- Database (remote server)
- Library
- Shows
- User accounts

The only difference is **where** YouTube downloads happen (local only).

