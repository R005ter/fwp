# Easy Cookie Setup Guide

**No more manual cookie export!** Use our simple setup script to automatically extract cookies from your browser.

## Quick Setup (Recommended)

1. **Make sure you're logged into YouTube** in your browser (Chrome, Firefox, Edge, etc.)

2. **Run the setup script:**
   ```bash
   python setup_cookies.py
   ```

3. **Follow the prompts:**
   - The script will extract cookies from your browser
   - Log into the Fireworks Planner app when prompted
   - Cookies will be automatically sent to the server

That's it! You're done. 🎉

## Requirements

- Python 3.6+
- yt-dlp installed: `pip install yt-dlp`
- You must be logged into YouTube in your browser

## Browser Options

The script defaults to Chrome. To use a different browser, edit `setup_cookies.py` and change:
```python
BROWSER = "chrome"  # Options: chrome, firefox, edge, safari, brave, opera, vivaldi
```

## Troubleshooting

### "yt-dlp not found"
Install it: `pip install yt-dlp`

### "Login failed"
Make sure you're logged into the Fireworks Planner web app first, then run the script again.

### "Cookies not working"
- Make sure you're logged into YouTube in your browser
- Try re-running the script to get fresh cookies
- Cookies expire after a few weeks - just run the script again when needed

## Manual Method (Alternative)

If you prefer to export cookies manually:
1. Use a browser extension to export cookies (see `YOUTUBE_COOKIES_SETUP.md`)
2. Copy the cookies file content
3. Paste it into the Settings page in the web app

## Why This is Better

- ✅ **One command** - no manual steps
- ✅ **Automatic** - extracts cookies directly from your browser
- ✅ **Secure** - cookies stay on your machine until you send them
- ✅ **Easy updates** - just run the script again when cookies expire


