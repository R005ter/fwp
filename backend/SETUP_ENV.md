# Quick Setup: Google OAuth Environment Variables

## Option 1: Create .env file (Recommended)

1. Create a file named `.env` in the `backend` folder
2. Add these lines (replace with your actual credentials):

```
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
SECRET_KEY=your-random-secret-key-here
```

3. The `start-servers.ps1` script will automatically load these when you run `START.bat`

## Option 2: Set in PowerShell (Temporary)

Run these commands in PowerShell before starting the server:

```powershell
$env:GOOGLE_CLIENT_ID="your-client-id-here"
$env:GOOGLE_CLIENT_SECRET="your-client-secret-here"
$env:SECRET_KEY="your-secret-key-here"
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

