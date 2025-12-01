# YouTube PO Token Setup Guide

**✅ Automated PO Token Support Enabled!**

The app now uses **yt-dlp-get-pot-rustypipe**, an automated PO Token Provider plugin that eliminates the need for manual PO Token extraction. PO Tokens are automatically generated when needed by yt-dlp.

## How It Works

1. **Plugin Installation:** The `yt-dlp-get-pot-rustypipe` plugin is automatically installed via `requirements.txt`
2. **Automatic PO Token Generation:** When yt-dlp needs a PO Token (e.g., for `mweb` client GVS requests), the plugin automatically generates it using RustyPipe BotGuard implementation
3. **No Manual Configuration:** No environment variables or manual token extraction needed!

## Current Configuration

- **Client Used:** `mweb` (when cookies are available)
- **PO Token Provider:** `yt-dlp-get-pot-rustypipe` (automatic)
- **Cookies Required:** Yes (for `mweb` client to work properly)

## What You Need to Do

**Nothing!** The plugin handles everything automatically. Just make sure:

1. ✅ **Cookies are configured** (see `YOUTUBE_COOKIES_SETUP.md`)
2. ✅ **The plugin is installed** (it's in `requirements.txt`, so it installs automatically on deployment)

## Verification

After deployment, check the logs. You should see:
```
✓ PO Token Provider plugin (yt-dlp-get-pot-rustypipe) is available
[video_id] Using cookies from environment variable (...) with mweb client
```

The plugin will automatically provide PO Tokens when yt-dlp requests them - no additional log messages needed.

## How the Plugin Works

The `yt-dlp-get-pot-rustypipe` plugin:
- Uses the RustyPipe BotGuard implementation to generate PO Tokens
- Automatically hooks into yt-dlp's YouTube extractor
- Provides PO Tokens for GVS (Google Video Server) requests when using the `mweb` client
- Caches tokens for efficiency
- Works with both guest and logged-in sessions (when cookies are provided)

## Troubleshooting

### "PO Token Provider plugin not installed" warning

If you see this warning in the logs:
```
⚠ Warning: PO Token Provider plugin not installed. Install with: pip install yt-dlp-get-pot-rustypipe
```

**Solution:** Make sure `yt-dlp-get-pot-rustypipe>=1.0.0` is in `requirements.txt` and redeploy.

### Downloads still failing

1. **Check cookies:** Make sure cookies are valid and not expired (see `YOUTUBE_COOKIES_SETUP.md`)
2. **Check logs:** Look for specific error messages from yt-dlp
3. **Verify plugin:** Check that the plugin loaded successfully in the startup logs

### Plugin not working

The plugin requires:
- yt-dlp version 2023.0.0 or above (we use `>=2023.0.0`)
- Python 3.7 or above
- Valid cookies (for `mweb` client)

## Manual PO Token Extraction (Not Recommended)

If you need to manually extract PO Tokens (not recommended), see the [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide). However, with the automated plugin, this should never be necessary.

## Alternative PO Token Providers

If `yt-dlp-get-pot-rustypipe` doesn't work for your use case, other options include:

- **yt-dlp-get-pot:** Plugin framework that supports multiple providers
- **yt-dlp-getpot-wpc:** Uses a headless browser (requires Chrome/Chromium)
- **bgutil-ytdlp-pot-provider:** Uses BgUtils (Rust-based, requires additional setup)

For most use cases, `yt-dlp-get-pot-rustypipe` is the recommended choice as it:
- ✅ Works without a browser
- ✅ Easy to install (Python package)
- ✅ Automatic token generation
- ✅ No manual configuration needed
