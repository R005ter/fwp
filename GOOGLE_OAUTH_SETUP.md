# 🔐 Google OAuth Setup Guide

This guide will help you set up Google OAuth for the Fireworks Show Planner so users can sign in with their Google accounts.

## Step 1: Create Google OAuth Credentials

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create a New Project** (or select existing)
   - Click the project dropdown at the top
   - Click "New Project"
   - Name it "Fireworks Planner" (or any name)
   - Click "Create"

3. **Enable Google+ API**
   - Go to "APIs & Services" → "Library"
   - Search for "Google+ API" or "People API"
   - Click "Enable"

4. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "+ CREATE CREDENTIALS" → "OAuth client ID"
   - If prompted, configure the OAuth consent screen first:
     - User Type: **External** (for public use)
     - App name: "Fireworks Show Planner"
     - User support email: Your email
     - Developer contact: Your email
     - Click "Save and Continue"
     - Scopes: Click "Add or Remove Scopes", select:
       - `.../auth/userinfo.email`
       - `.../auth/userinfo.profile`
     - Click "Save and Continue"
     - Test users: Add your email (for testing)
     - Click "Save and Continue" → "Back to Dashboard"

5. **Create OAuth Client ID**
   - Application type: **Web application**
   - Name: "Fireworks Planner Web"
   - **Authorized JavaScript origins:**
     - For local development: `http://localhost:5000`
     - For production: `https://your-app.onrender.com` (your Render URL)
   - **Authorized redirect URIs:**
     - For local development: `http://localhost:5000/api/auth/google/callback`
     - For production: `https://your-app.onrender.com/api/auth/google/callback`
   - Click "Create"
   - **Copy your Client ID and Client Secret!**

## Step 2: Configure Environment Variables

### Local Development

Create a `.env` file in the `backend` folder (or set environment variables):

```bash
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
SECRET_KEY=your-random-secret-key-here
```

Or set them in PowerShell:
```powershell
$env:GOOGLE_CLIENT_ID="your-client-id-here"
$env:GOOGLE_CLIENT_SECRET="your-client-secret-here"
$env:SECRET_KEY="your-random-secret-key-here"
```

### Production (Render.com)

1. Go to your Render dashboard
2. Select your service
3. Go to "Environment" tab
4. Add these environment variables:
   - `GOOGLE_CLIENT_ID` = Your Google Client ID
   - `GOOGLE_CLIENT_SECRET` = Your Google Client Secret
   - `SECRET_KEY` = A random secret key (generate with: `python -c "import secrets; print(secrets.token_hex(32))"`)
5. Click "Save Changes"
6. Redeploy your service

## Step 3: Update Authorized Redirect URIs

**Important:** After deploying to Render.com, you must:

1. Go back to Google Cloud Console
2. Edit your OAuth 2.0 Client ID
3. Add your production redirect URI:
   - `https://your-app.onrender.com/api/auth/google/callback`
4. Save changes

## Step 4: Test It!

1. Start your local server: `START.bat`
2. Go to `http://localhost:5000`
3. Click "Sign in with Google"
4. You should be redirected to Google's sign-in page
5. After signing in, you'll be redirected back and logged in!

## Troubleshooting

### "OAuth not configured" error
- Make sure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Restart your server after setting environment variables

### "Redirect URI mismatch" error
- Check that your redirect URI in Google Console matches exactly:
  - Local: `http://localhost:5000/api/auth/google/callback`
  - Production: `https://your-app.onrender.com/api/auth/google/callback`
- No trailing slashes!

### "Access blocked" error
- Your app might be in testing mode
- Add your email as a test user in Google Console
- Or publish your app (requires verification for production)

### Users can't sign in
- Check that Google+ API or People API is enabled
- Verify OAuth consent screen is configured
- Check Render logs for errors

## Security Notes

- **Never commit** your `GOOGLE_CLIENT_SECRET` or `SECRET_KEY` to Git
- Use environment variables for all secrets
- The `.gitignore` file already excludes `.env` files
- Rotate secrets if they're ever exposed

## Next Steps

Once OAuth is working:
- Users can sign in with Google (no password needed!)
- Their account is automatically created on first sign-in
- They can still use username/password if preferred
- All data syncs across devices when logged in

---

Need help? Check the main README.md or Render deployment guide.

