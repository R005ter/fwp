# Database Sync Fix - OAuth-Based User Matching

## Problem

When uploading videos from the local client to the Render-hosted server, videos weren't appearing in the library even though:
- ✅ Same Google account logged in on both instances
- ✅ Video files successfully uploaded to R2 storage
- ❌ Videos not showing in library on Render

## Root Cause

**Each instance has its own SQLite database:**
- Local client: `backend/fireworks.db` (local file)
- Render server: `backend/fireworks.db` (separate file on Render)

**The Issue:**
1. Local client downloads video and gets `user_id=1` from its database
2. Local client uploads to Render, sending `user_id=1`
3. Render looks up `user_id=1` in **its own database**
4. Same Google account might have `user_id=2` on Render
5. Video gets registered but linked to wrong user (or fails)

**Why R2 works but database doesn't:**
- ✅ R2 is **shared storage** - both instances see the same files
- ❌ SQLite databases are **separate** - each instance has its own database file

## Solution

**Use OAuth ID instead of user_id for cross-instance matching:**

1. **Local client** now sends OAuth provider + OAuth ID when uploading
2. **Render server** looks up user by OAuth ID (which is consistent across databases)
3. Video gets linked to the correct user regardless of user_id differences

## Changes Made

### 1. `upload_video_to_remote()` function
- Gets OAuth provider and OAuth ID from local user
- Sends OAuth credentials instead of user_id (when available)
- Falls back to user_id for backward compatibility

### 2. `/api/upload-video` endpoint
- **Priority 1:** Look up user by OAuth ID (preferred)
- **Priority 2:** Look up user by user_id (fallback)
- **Priority 3:** Use session user_id (web client)

## How It Works Now

```
Local Client (user_id=1, Google OAuth ID=12345)
    ↓ Downloads video
    ↓ Gets OAuth info: provider='google', oauth_id='12345'
    ↓ Uploads to Render with OAuth credentials
    ↓
Render Server
    ↓ Receives upload with oauth_provider='google', oauth_id='12345'
    ↓ Looks up user by OAuth ID (finds user_id=2)
    ↓ Links video to correct user (user_id=2)
    ✅ Video appears in library!
```

## Testing

1. **Local client:** Download a video from YouTube
2. **Check logs:** Should see "Using OAuth matching: google/12345..."
3. **Render server:** Video should appear in library
4. **Verify:** Same Google account sees the video on both instances

## Future Improvements

For a truly centralized system, consider:
- **PostgreSQL on Render:** Shared database accessible from both instances
- **Database replication:** Sync SQLite databases (complex)
- **API-based storage:** Store all metadata via API calls (current approach)

The OAuth-based matching is a good middle ground - it works with separate databases while ensuring correct user matching.

