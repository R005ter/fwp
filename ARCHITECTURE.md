# Fireworks Planner Architecture

## Client Types & Capabilities

### 1. **Local Client** (Executable)
**Purpose**: Full-featured desktop client for downloading YouTube videos locally

**Capabilities**:
- ✅ **YouTube Downloads**: Download videos from YouTube using local `yt-dlp`
- ✅ **MP4 Uploads**: Upload MP4 files directly (if UI added)
- ✅ **Show Editing**: Full show creation and editing
- ✅ **Library Management**: View, edit, trim, crop videos in library
- ✅ **Remote Sync**: Downloads are automatically uploaded to remote server

**How it works**:
- Frontend connects to **remote server** for API calls (auth, library, shows)
- YouTube downloads routed to **local backend** (localhost:5000)
- Local backend uploads completed downloads to remote server
- Uses token-based authentication (token stored in localStorage)

**Setup**:
```bash
python start_local_client.py
# or
FireworksPlanner.exe  # (after building executable)
```

---

### 2. **Web Client** (Render)
**Purpose**: Web-based interface accessible from any browser

**Capabilities**:
- ❌ **YouTube Downloads**: Disabled (Render IPs blocked by YouTube)
- ✅ **MP4 Uploads**: Can upload MP4 files directly via web interface
- ✅ **Show Editing**: Full show creation and editing
- ✅ **Library Management**: View, edit, trim, crop videos in library

**How it works**:
- All API calls go to remote server (Render)
- YouTube download endpoint returns 403 error with helpful message
- Uses session-based authentication (cookies)

**Access**: `https://fireworks-planner.onrender.com`

---

### 3. **Mobile Interface**
**Purpose**: Mobile-optimized interface for show editing and library browsing

**Capabilities**:
- ❌ **YouTube Downloads**: Hidden on mobile devices
- ❌ **MP4 Uploads**: Hidden on mobile devices
- ✅ **Show Editing**: Full show creation and editing
- ✅ **Library Management**: View, edit, trim, crop videos in library
- ✅ **Library Browsing**: Use existing videos from library

**How it works**:
- Same as web client (connects to remote server)
- Mobile detection hides YouTube download and upload UI
- Optimized touch interface for editing

**Access**: `https://fireworks-planner.onrender.com` (from mobile browser)

---

## Feature Matrix

| Feature | Local Client | Web Client | Mobile |
|---------|-------------|------------|--------|
| YouTube Downloads | ✅ | ❌ | ❌ |
| MP4 Uploads | ✅ | ✅ | ❌ |
| Show Editing | ✅ | ✅ | ✅ |
| Library Viewing | ✅ | ✅ | ✅ |
| Library Editing (Trim/Crop) | ✅ | ✅ | ✅ |
| Authentication | Token-based | Session-based | Session-based |

---

## Authentication Flow

### Local Client
1. User clicks "Login with Google" → Redirects to remote server
2. OAuth completes on remote server
3. Remote server generates auth token
4. Redirects back to local client with token in URL: `http://localhost:8080#/dashboard?token=...`
5. Local client stores token in localStorage
6. All API requests include `X-Auth-Token` header

### Web/Mobile Client
1. User clicks "Login with Google" → Redirects to remote server
2. OAuth completes on remote server
3. Remote server sets session cookie
4. Redirects back to web client: `https://fireworks-planner.onrender.com#/dashboard`
5. Browser automatically sends session cookie with requests

---

## API Endpoints

### Authentication
- `GET /api/auth/me` - Get current user (supports both tokens and sessions)
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `POST /api/auth/logout` - Logout

### YouTube Downloads
- `POST /api/download` - Start YouTube download (local client only)
- `GET /api/download/<id>` - Get download status

### Video Uploads
- `POST /api/upload-video` - Upload MP4 file (web client)

### Library
- `GET /api/library` - Get user's library
- `POST /api/library` - Add video to library
- `PUT /api/library/<id>` - Update library video metadata
- `DELETE /api/library/<id>` - Remove video from library

### Shows
- `GET /api/shows` - Get all shows
- `POST /api/shows/<name>` - Save show
- `GET /api/shows/<name>` - Get show data
- `DELETE /api/shows/<name>` - Delete show

---

## Data Flow

### YouTube Download (Local Client)
```
User enters YouTube URL
  ↓
Frontend → Local Backend (localhost:5000) → /api/download
  ↓
Local Backend runs yt-dlp → Downloads video locally
  ↓
Local Backend → Remote Server → /api/upload-video
  ↓
Video saved on remote server
  ↓
Video added to user's library
```

### Show Editing (All Clients)
```
User edits show
  ↓
Frontend → Remote Server → /api/shows/<name>
  ↓
Show data saved to database
```

### Library Editing (All Clients)
```
User edits video (trim/crop)
  ↓
Frontend → Remote Server → /api/library/<id>
  ↓
Metadata updated in database
```

---

## Environment Variables

### Remote Server (Render)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret
- `SECRET_KEY` - Flask secret key
- `YOUTUBE_COOKIES` - Base64 encoded YouTube cookies (optional)

### Local Client
- `REMOTE_API_URL` - Remote server URL (default: https://fireworks-planner.onrender.com)
- `LOCAL_BACKEND_PORT` - Local backend port (default: 5000)
- `FRONTEND_PORT` - Frontend port (default: 8080)
- `YOUTUBE_PROXY` - Proxy for YouTube downloads (optional)
- `YOUTUBE_COOKIES` - YouTube cookies file path (optional)

---

## Mobile Detection

Mobile devices are detected by:
- Screen width < 768px AND height > width (portrait mode)
- Touch device detection

When mobile is detected:
- YouTube download UI is hidden
- MP4 upload UI is hidden (if implemented)
- All other features remain available

---

## Notes

- **Local Client** requires Python and `yt-dlp` installed
- **Web Client** requires no local installation
- **Mobile** works on any mobile browser
- All clients share the same database (on remote server)
- Videos are stored on remote server for all clients
- Local client downloads are temporary (uploaded then deleted locally)
