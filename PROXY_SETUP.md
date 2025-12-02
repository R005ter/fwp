# YouTube Proxy Setup Guide

## Why Use a Proxy?

Render's servers are often flagged by YouTube as bot traffic, causing downloads to fail with "Sign in to confirm you're not a bot" errors. Using a proxy service routes your requests through residential IP addresses that appear more legitimate to YouTube.

## Proxy Service Options

### Free Options (Limited)

1. **Free Proxy Lists** (Not Recommended)
   - Many free proxies are unreliable and may be flagged themselves
   - Security concerns with untrusted proxies

### Paid Options (Recommended)

1. **Bright Data (formerly Luminati)**
   - Residential proxies with high success rates
   - Pricing: Pay-as-you-go or subscription
   - Website: https://brightdata.com/

2. **Oxylabs**
   - Residential and datacenter proxies
   - Good for YouTube scraping
   - Website: https://oxylabs.io/

3. **Smartproxy**
   - Affordable residential proxies
   - Good balance of price and performance
   - Website: https://smartproxy.com/

4. **ScraperAPI**
   - Handles proxy rotation automatically
   - Simple API-based solution
   - Website: https://www.scraperapi.com/

## Configuration

### Setting Up Proxy in Render

1. **Get your proxy credentials** from your proxy service provider
2. **Add environment variable** in Render dashboard:
   - Key: `YOUTUBE_PROXY`
   - Value: Your proxy URL in one of these formats:
     - HTTP: `http://username:password@proxy.example.com:8080`
     - SOCKS5: `socks5://username:password@proxy.example.com:1080`
     - Simple HTTP: `http://proxy.example.com:8080`

### Example Configurations

#### Bright Data
```
YOUTUBE_PROXY=http://customer-USERNAME:PASSWORD@zproxy.lum-superproxy.io:22225
```

#### Oxylabs
```
YOUTUBE_PROXY=http://customer-USERNAME:PASSWORD@pr.oxylabs.io:7777
```

#### Smartproxy
```
YOUTUBE_PROXY=http://username:password@gate.smartproxy.com:10000
```

#### ScraperAPI (if they support proxy format)
```
YOUTUBE_PROXY=http://scraperapi:API_KEY@proxy.scraperapi.com:8001
```

## Testing Your Proxy

After setting up the proxy:

1. Try downloading a YouTube video through the app
2. Check the Render logs for proxy-related messages:
   - Look for: `✓ YouTube proxy configured: ...`
   - Look for: `[video_id] Using proxy: ...`
3. If downloads still fail, try:
   - Verifying proxy credentials
   - Testing proxy with a simple curl command
   - Contacting your proxy provider for support

## Alternative: Using Cookies Only

If you can't use a proxy, ensure your YouTube cookies are fresh:

1. Extract cookies using `setup_cookies.py`
2. Update the `YOUTUBE_COOKIES` environment variable in Render
3. Cookies should be base64-encoded Netscape format

**Note:** Cookies alone may not be enough if Render's IPs are heavily flagged.

## Troubleshooting

### Proxy Connection Errors

- Verify proxy URL format is correct
- Check if proxy requires authentication
- Ensure proxy supports HTTPS (YouTube uses HTTPS)
- Test proxy connectivity from Render's servers

### Still Getting Bot Detection

- Try a different proxy provider
- Use residential proxies instead of datacenter proxies
- Rotate between multiple proxy endpoints
- Ensure cookies are fresh and valid

### Cost Considerations

- Monitor proxy usage to avoid unexpected charges
- Some providers offer free trials
- Consider pay-as-you-go plans for low-volume usage
- Set up usage alerts if available

## Best Practices

1. **Use Residential Proxies**: They're less likely to be flagged
2. **Rotate IPs**: Don't use the same IP for every request
3. **Keep Cookies Fresh**: Update cookies regularly
4. **Monitor Success Rates**: Track which proxies work best
5. **Have Fallbacks**: Use multiple proxy providers if possible

## Support

If you continue to experience issues:
1. Check Render logs for detailed error messages
2. Verify proxy configuration
3. Test with a simple YouTube video first
4. Contact your proxy provider's support

