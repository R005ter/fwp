# Debugging Library Video Issues

If videos aren't appearing in your library after download, use these steps to debug:

## Step 1: Check Download Status

After downloading a video, check the browser console (F12) for any errors. The download status should show:
- `status: "complete"` when finished
- `status: "error"` if something failed
- `error: "..."` message if there was an error

## Step 2: Use the Debug Endpoint

Visit this URL while logged in (replace with your Render URL):
```
https://fireworks-planner.onrender.com/api/debug/downloads
```

This will show you:
- Your `user_id`
- All your recent downloads and their status
- How many videos are in your library
- List of filenames in your library

**What to look for:**
- If `downloads` shows `status: "error"`, check the `error` message
- If `library_count` is 0 but downloads show `status: "complete"`, the video wasn't added to the library
- Compare `library_files` with the `filename` in your downloads

## Step 3: Check Render Logs

1. Go to your Render dashboard: https://dashboard.render.com/
2. Click on your web service
3. Go to the "Logs" tab
4. Look for messages starting with `[video_id]` that show:
   - `✓ Video registered in shared storage`
   - `✓ Video added to user's library successfully`
   - `✓ Verified: Video appears in user's library`

**Common error messages:**
- `ERROR: No user_id found in download info` - User session issue
- `ERROR: No youtube_url found in download info` - Download tracking issue
- `ERROR: Error registering video: ...` - Database error (check the full traceback)

## Step 4: Check Database

If you have database access, you can check:
- `videos` table - should have the video entry
- `library` table - should have a row linking `user_id` to `video_id`

## Common Issues

### Issue: `user_id` is None
**Cause:** User session not preserved in background thread
**Fix:** The code now stores `user_id` in the downloads dict before starting the thread

### Issue: Database error during `create_video` or `add_video_to_library`
**Cause:** Database connection issue or constraint violation
**Fix:** Check Render logs for the full error traceback

### Issue: Video file exists but not in library
**Cause:** The `add_video_to_library` call failed silently
**Fix:** Check Render logs - the new logging will show if this step failed

## Testing Locally

To test the same flow locally:
1. Start your server: `START.bat`
2. Download a video
3. Check `backend/videos/` directory - file should be there
4. Check `backend/fireworks.db` - use a SQLite browser to check the `videos` and `library` tables
5. Visit `http://localhost:5000/api/debug/downloads` to see debug info

