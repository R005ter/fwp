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

# PostgreSQL Database (REQUIRED)
# Get from Supabase Dashboard → Settings → Database → Connection String
# Format: postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
DATABASE_URL=postgresql://postgres.ttdrydqzszdkkzqbhccf:your-password@aws-1-us-east-1.pooler.supabase.com:5432/postgres
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

# PostgreSQL Database (REQUIRED)
$env:DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
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

**REQUIRED:** PostgreSQL database connection string must be set via `DATABASE_URL` environment variable.

- Local and Render share the same database
- Shows and library data sync automatically
- See `POSTGRESQL_SETUP.md` for detailed setup instructions

**Note:** SQLite is no longer supported. You must use PostgreSQL (Supabase recommended).

