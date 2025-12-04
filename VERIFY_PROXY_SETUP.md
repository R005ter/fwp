# Verifying Proxy Setup

## Quick Checklist

### 1. Code Changes Deployed? ✅
Make sure you've committed and pushed the code changes to trigger a new deployment on Render.

### 2. Environment Variable Set? ✅
In Render dashboard:
- Go to your service → Environment
- Verify `YOUTUBE_PROXY` is set
- Format should be: `http://username:password@gate.smartproxy.com:10000`
- For Smartproxy, check your dashboard for the exact endpoint format

### 3. Check Startup Logs
After deployment, look for this message in Render logs:
- ✅ **Success**: `✓ YouTube proxy configured: gate.smartproxy.com:10000` (or similar)
- ❌ **Missing**: `ℹ No YouTube proxy configured...`

## Smartproxy Configuration

### Getting Your Proxy Endpoint

1. Log into Smartproxy dashboard
2. Go to **Residential Proxies** or **Datacenter Proxies**
3. Find your **Endpoint** - it should look like:
   - `gate.smartproxy.com:10000` (or different port)
   - Or `us.smartproxy.com:10000` (country-specific)

### Format for YOUTUBE_PROXY

```
http://username:password@gate.smartproxy.com:10000
```

Replace:
- `username` - Your Smartproxy username
- `password` - Your Smartproxy password  
- `gate.smartproxy.com:10000` - Your actual endpoint from dashboard

### Example
If your credentials are:
- Username: `user123`
- Password: `pass456`
- Endpoint: `gate.smartproxy.com:10000`

Then set:
```
YOUTUBE_PROXY=http://user123:pass456@gate.smartproxy.com:10000
```

## Testing After Setup

1. **Trigger a new deployment** (or wait for auto-deploy)
2. **Check logs** for proxy confirmation message
3. **Try downloading a YouTube video**
4. **Watch logs** for:
   - `[video_id] Using proxy: ...` message
   - Successful download or error messages

## Troubleshooting

### Proxy Not Showing in Logs

**Problem**: Logs show "No YouTube proxy configured"

**Solutions**:
- Double-check environment variable name: `YOUTUBE_PROXY` (exact case)
- Verify no extra spaces in the value
- Make sure you've saved the environment variable
- Trigger a manual redeploy after setting the variable

### Proxy Connection Errors

**Problem**: Downloads fail with proxy connection errors

**Solutions**:
- Verify proxy credentials are correct
- Check if proxy endpoint is correct (from Smartproxy dashboard)
- Ensure proxy supports HTTPS (YouTube uses HTTPS)
- Try a different proxy endpoint if available

### Still Getting Bot Detection

**Problem**: Downloads still fail with "Sign in to confirm you're not a bot"

**Solutions**:
- Ensure cookies are fresh (extract new ones with `setup_cookies.py`)
- Verify proxy is actually being used (check logs for proxy messages)
- Try a different proxy endpoint
- Contact Smartproxy support if proxy isn't working

## What to Look For in Logs

### Successful Proxy Usage
```
✓ YouTube proxy configured: gate.smartproxy.com:10000
[video_id] Using proxy: gate.smartproxy.com:10000
[video_id] Using cookies from environment variable with mweb client
[video_id] Fetching video info...
```

### Proxy Not Working
```
ℹ No YouTube proxy configured...
[video_id] WARNING: No cookies found...
ERROR: [youtube] Sign in to confirm you're not a bot
```

## Next Steps

1. ✅ Verify environment variable is set correctly
2. ✅ Check logs after deployment
3. ✅ Test with a simple YouTube video
4. ✅ Monitor proxy usage in Smartproxy dashboard
5. ✅ Check for any charges/usage limits

## Need Help?

- Check Smartproxy documentation for endpoint formats
- Verify your Smartproxy account is active
- Check Render logs for specific error messages
- Ensure code changes are deployed


