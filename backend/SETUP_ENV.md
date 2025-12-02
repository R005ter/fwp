# Quick Setup: Environment Variables

## Option 1: Create .env file (Recommended)

1. Create a file named `.env` in the `backend` folder
2. Add these lines (replace with your actual credentials):

```
# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
SECRET_KEY=your-random-secret-key-here

# Cloudflare R2 Storage (required for video storage)
R2_ACCOUNT_ID=ee931125693573fbbcdd6a3ed03a084e
R2_ACCESS_KEY_ID=2ea07b8a99215abd5e6909fda7a9dce6
R2_SECRET_ACCESS_KEY=220b18f80db5728df3b5360d72092cbd2eea57be26004dff8c989c1fa9744637
R2_BUCKET_NAME=fwp-videos
R2_ENDPOINT_URL=https://ee931125693573fbbcdd6a3ed03a084e.r2.cloudflarestorage.com

# PostgreSQL Database (optional - for shared database between local and Render)
# If not set, uses SQLite (local file) instead
# Get from Render Dashboard → PostgreSQL → External Database URL
# DATABASE_URL=postgresql://user:password@hostname:5432/dbname
```

3. The `start-servers.ps1` script will automatically load these when you run `START.bat`

## Option 2: Set in PowerShell (Temporary)

Run these commands in PowerShell before starting the server:

```powershell
# Google OAuth (optional)
$env:GOOGLE_CLIENT_ID="your-client-id-here"
$env:GOOGLE_CLIENT_SECRET="your-client-secret-here"
$env:SECRET_KEY="your-secret-key-here"

# Cloudflare R2 Storage (required)
$env:R2_ACCOUNT_ID="ee931125693573fbbcdd6a3ed03a084e"
$env:R2_ACCESS_KEY_ID="2ea07b8a99215abd5e6909fda7a9dce6"
$env:R2_SECRET_ACCESS_KEY="220b18f80db5728df3b5360d72092cbd2eea57be26004dff8c989c1fa9744637"
$env:R2_BUCKET_NAME="fwp-videos"
$env:R2_ENDPOINT_URL="https://ee931125693573fbbcdd6a3ed03a084e.r2.cloudflarestorage.com"

# PostgreSQL Database (optional - for shared database)
# $env:DATABASE_URL="postgresql://user:password@hostname:5432/dbname"
```

Then start the server.

## Get Your Credentials

1. Go to https://console.cloud.google.com/
2. Create a project (or select existing)
3. Enable Google+ API or People API
4. Go to "APIs & Services" → "Credentials"
5. Create OAuth 2.0 Client ID (Web application)
6. Add authorized redirect URI: `http://localhost:5000/api/auth/google/callback`
7. Copy the Client ID and Client Secret

See `GOOGLE_OAUTH_SETUP.md` for detailed instructions.

## Database Configuration

**By default:** Uses SQLite (local file `backend/fireworks.db`)

**For shared database:** Set `DATABASE_URL` to use PostgreSQL:
- Local and Render will share the same database
- Shows and library data will sync automatically
- See `POSTGRESQL_SETUP.md` for detailed setup instructions

