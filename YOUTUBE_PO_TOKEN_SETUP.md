# YouTube PO Token Setup Guide

According to the [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide), the `mweb` client requires a **PO Token (Proof of Origin Token)** for GVS (Google Video Server) requests. Without it, downloads will fail with format errors.

## What is a PO Token?

A PO Token is a parameter YouTube requires to verify requests are coming from a genuine client. It's tied to your YouTube session and is required for certain clients like `mweb`.

## Step 1: Extract PO Token from YouTube Music

**Important:** You must extract the PO Token from **YouTube Music** (not regular YouTube) for the `mweb` client.

1. **Open YouTube Music** in your browser: https://music.youtube.com
2. **Make sure you're logged in** (same account as your cookies)
3. **Open Developer Console:**
   - Press `F12` (or right-click → Inspect)
   - Go to the **"Network"** tab (click `>>` if you don't see it)
4. **Filter requests:**
   - In the filter box, type: `v1/player`
5. **Play a video:**
   - Search for any video on YouTube Music
   - Click play on a video
   - A `player` request should appear in the network tab
6. **Extract the PO Token:**
   - Click on the `player` request
   - Go to the **"Payload"** or **"Request"** tab
   - Look for the JSON request body
   - Find the field: `serviceIntegrityDimensions.poToken`
   - Copy the **entire value** of `poToken` (it's a long string)

## Step 2: Add PO Token to Render.com

1. **Go to your Render dashboard**
2. **Select your web service**
3. **Go to "Environment" tab**
4. **Add environment variable:**
   - **Key:** `YOUTUBE_PO_TOKEN`
   - **Value:** (paste the PO Token value you copied)
5. **Click "Save Changes"**
6. **Redeploy** (or the server will pick it up on restart)

## Step 3: Verify It Works

After adding the PO Token, try downloading a video. Check the logs - you should see:
```
✓ YouTube PO Token loaded from environment variable
[video_id] Using PO Token with mweb client
```

## Important Notes

- **PO Tokens expire:** PO Tokens are valid for at least 12 hours, but may last for days. You'll need to re-extract periodically.
- **Tied to session:** The PO Token is tied to your YouTube session (cookies). If you update cookies, you may need to update the PO Token.
- **Keep it secure:** Don't commit PO Tokens to Git (they're sensitive)
- **One token per session:** One PO Token works for all videos in your session

## Troubleshooting

### "Still getting format errors"
- Make sure you extracted the PO Token from **YouTube Music** (not regular YouTube)
- Make sure you're logged in when extracting
- Try extracting a fresh PO Token
- Verify the PO Token is correctly set in the environment variable (no extra spaces/quotes)

### "How do I update the PO Token?"
- Just extract a new PO Token and update the `YOUTUBE_PO_TOKEN` environment variable
- The server will pick it up on the next deployment/restart

### "Can I automate this?"
- Yes! Consider using a [PO Token Provider plugin](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide#po-token-provider-plugins) like `bgutil-ytdlp-pot-provider` to automate PO Token generation
- This would require additional setup but eliminates manual extraction

## Alternative: Use a PO Token Provider Plugin

For automated PO Token management, you can install a plugin like:
- [bgutil-ytdlp-pot-provider](https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs) - Automatically generates PO Tokens

This would require modifying the deployment to install the plugin, but would eliminate the need for manual PO Token extraction.

