# YouTube Cookies Setup Guide

YouTube has aggressive bot detection that blocks server-side downloads. The most reliable way to avoid this is to use cookies from a real browser session.

## Step 1: Export Cookies from Your Browser

### Using Chrome/Edge:

1. **Install a cookie export extension:**
   - Install "Get cookies.txt LOCALLY" extension: https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc
   - Or "cookies.txt" extension: https://chrome.google.com/webstore/detail/cookiestxt/njabckikapfpffapmjgojcnbfjonfjfg

2. **Export cookies:**
   - Go to https://www.youtube.com
   - Make sure you're logged in (this is important!)
   - Click the extension icon
   - Click "Export" or "Download"
   - Save the file as `youtube_cookies.txt`

### Using Firefox:

1. **Install "cookies.txt" extension:**
   - https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/

2. **Export cookies:**
   - Go to https://www.youtube.com
   - Make sure you're logged in
   - Click the extension icon → Export
   - Save as `youtube_cookies.txt`

### Using yt-dlp directly (Alternative):

```bash
# This will open your browser and save cookies automatically
yt-dlp --cookies-from-browser chrome --cookies youtube_cookies.txt https://www.youtube.com/watch?v=test
```

## Step 2: Add Cookies to Your Server

### Option A: Upload cookies.txt file (Local Development)

1. Place `youtube_cookies.txt` in the `backend/` directory
2. The server will automatically use it

### Option B: Use Environment Variable (Render.com)

1. **Encode the cookies file:**
   ```bash
   # On Windows (PowerShell):
   [Convert]::ToBase64String([System.IO.File]::ReadAllBytes("youtube_cookies.txt"))
   
   # On Mac/Linux:
   base64 -i youtube_cookies.txt
   ```

2. **Add to Render.com:**
   - Go to your Render dashboard
   - Select your web service
   - Go to "Environment" tab
   - Add environment variable:
     - **Key:** `YOUTUBE_COOKIES`
     - **Value:** (paste the base64 encoded string)
   - Click "Save Changes"
   - Redeploy

## Step 3: Verify It Works

1. After adding cookies, try downloading a video
2. Check the logs - you should see:
   ```
   ✓ YouTube cookies loaded from environment variable
   [video_id] Using cookies file: /path/to/youtube_cookies.txt
   ```
3. Downloads should now work without bot detection errors!

## Important Notes

- **Cookies expire:** YouTube cookies typically expire after a few weeks/months. You'll need to re-export and update them periodically.
- **Keep cookies secure:** Don't commit `youtube_cookies.txt` to Git (it's already in `.gitignore`)
- **One user's cookies:** The cookies are tied to one YouTube account. If multiple users need to download, you might need a different approach.

## Troubleshooting

### "Cookies file not found"
- Make sure the file is named exactly `youtube_cookies.txt`
- Make sure it's in the `backend/` directory
- Check file permissions

### "Still getting bot detection errors"
- Make sure you exported cookies while **logged in** to YouTube
- Try re-exporting fresh cookies
- Cookies might have expired - export new ones

### "How do I update cookies?"
- Just export new cookies and replace the file (or update the environment variable)
- No need to restart the server - it will pick up the new cookies on the next download

