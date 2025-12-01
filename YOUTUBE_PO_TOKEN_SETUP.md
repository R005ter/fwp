# YouTube PO Token Setup Guide

**Note:** The app now uses `tv_embedded` client by default when cookies are available, which **does NOT require a PO Token**. This guide is only needed if you want to use the `mweb` client instead.

According to the [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide), the `mweb` client requires a **PO Token (Proof of Origin Token)** for GVS (Google Video Server) requests. However, manual extraction of PO Tokens may be difficult as YouTube's API structure changes frequently.

## What is a PO Token?

A PO Token is a parameter YouTube requires to verify requests are coming from a genuine client. It's tied to your YouTube session and is required for certain clients like `mweb`.

## Step 1: Extract PO Token (May Not Be Available)

**⚠️ Important:** YouTube frequently changes their API structure. The `serviceIntegrityDimensions.poToken` field may not be present in the player request payload. If you cannot find it, consider:

1. **Check the Response instead of Request:**
   - Look in the **Response** tab of the `player` request
   - Search for `poToken` or `serviceIntegrityDimensions` in the response JSON

2. **Check `encryptedTokenJarContents`:**
   - This field may contain encrypted tokens
   - However, this requires decryption which is complex

3. **Use a PO Token Provider Plugin (Recommended):**
   - Manual extraction is unreliable due to API changes
   - See "Alternative: Use a PO Token Provider Plugin" section below

**If you still want to try manual extraction:**

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
   - Check both **"Request"** (Payload) and **"Response"** tabs
   - Search for `poToken`, `serviceIntegrityDimensions`, or `encryptedTokenJarContents`
   - If found, copy the **entire value**

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

## Alternative: Use a PO Token Provider Plugin (Recommended)

**This is the recommended approach** since manual PO Token extraction is unreliable due to YouTube's frequent API changes.

For automated PO Token management, you can install a plugin like:
- [bgutil-ytdlp-pot-provider](https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs) - Automatically generates PO Tokens

This would require modifying the deployment to install the plugin, but would eliminate the need for manual PO Token extraction.

## Recommended: Use tv_embedded Client (No PO Token Required)

**The easiest solution:** The app now uses `tv_embedded` client by default when cookies are available. This client:
- ✅ Supports cookies
- ✅ **Does NOT require a PO Token**
- ✅ Works reliably without manual token extraction

If downloads are working with `tv_embedded`, you don't need to set up a PO Token at all!

