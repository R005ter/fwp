# Cloudflare R2 Implementation Plan

This document outlines the steps to migrate video storage from Render's persistent disk to Cloudflare R2, enabling free tier hosting.

## Overview

**Current Setup:**
- Videos stored in `/opt/render/project/src/backend/videos/` (Render persistent disk - costs money)
- Videos served directly from disk via Flask static file serving

**New Setup:**
- Videos uploaded to Cloudflare R2 after download
- Videos streamed from R2 via signed URLs or direct R2 URLs
- Render service runs on free tier (no disk needed)

## Benefits

✅ **Free Tier:** 10 GB storage, no egress fees  
✅ **Cost Savings:** No Render disk costs  
✅ **Scalability:** Unlimited egress bandwidth  
✅ **S3-Compatible:** Easy integration with boto3  
✅ **Performance:** Global CDN distribution  

## Prerequisites

1. Cloudflare account (free)
2. R2 bucket created
3. API token with R2 permissions

## Step 1: Set Up Cloudflare R2

### 1.1 Create R2 Bucket

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **R2** → **Create bucket**
3. Name: `fireworks-videos` (or your preferred name)
4. Location: Choose closest to your users (e.g., `us-east-1`)
5. Click **Create bucket**

### 1.2 Create API Token

1. Go to **Manage R2 API Tokens**
2. Click **Create API token**
3. Permissions:
   - **Object Read & Write** (or **Admin Read & Write**)
4. TTL: **Never expire** (or set expiration as needed)
5. Click **Create API Token**
6. **Save these credentials:**
   - `Account ID` (found in R2 dashboard URL or account settings)
   - `Access Key ID`
   - `Secret Access Key`

### 1.3 Get R2 Endpoint URL

- Format: `https://<account-id>.r2.cloudflarestorage.com`
- Or use: `https://<bucket-name>.<account-id>.r2.cloudflarestorage.com` (if custom domain not set)

## Step 2: Install Dependencies

### 2.1 Update requirements.txt

Add to `backend/requirements.txt`:
```
boto3>=1.34.0
```

### 2.2 Install Locally

```powershell
cd backend
pip install boto3
```

## Step 3: Code Changes

### 3.1 Create R2 Configuration Module

Create `backend/r2_storage.py`:

```python
import os
import boto3
from botocore.config import Config
from pathlib import Path
from typing import Optional

# R2 Configuration
R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'fireworks-videos')
R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL') or f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com'

# Check if R2 is configured
R2_ENABLED = all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY])

# Initialize S3 client for R2
s3_client = None
if R2_ENABLED:
    s3_client = boto3.client(
        's3',
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name='auto',  # R2 uses 'auto' for region
        config=Config(signature_version='s3v4')
    )


def upload_to_r2(local_file_path: Path, object_key: str) -> bool:
    """Upload a file to R2 bucket"""
    if not R2_ENABLED:
        return False
    
    try:
        s3_client.upload_file(
            str(local_file_path),
            R2_BUCKET_NAME,
            object_key,
            ExtraArgs={'ContentType': 'video/mp4'}
        )
        print(f"✓ Uploaded {object_key} to R2")
        return True
    except Exception as e:
        print(f"✗ Failed to upload {object_key} to R2: {str(e)}")
        return False


def delete_from_r2(object_key: str) -> bool:
    """Delete a file from R2 bucket"""
    if not R2_ENABLED:
        return False
    
    try:
        s3_client.delete_object(Bucket=R2_BUCKET_NAME, Key=object_key)
        print(f"✓ Deleted {object_key} from R2")
        return True
    except Exception as e:
        print(f"✗ Failed to delete {object_key} from R2: {str(e)}")
        return False


def get_r2_url(object_key: str, expires_in: int = 3600) -> Optional[str]:
    """Generate a presigned URL for R2 object (valid for expires_in seconds)"""
    if not R2_ENABLED:
        return None
    
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': R2_BUCKET_NAME, 'Key': object_key},
            ExpiresIn=expires_in
        )
        return url
    except Exception as e:
        print(f"✗ Failed to generate R2 URL for {object_key}: {str(e)}")
        return None


def file_exists_in_r2(object_key: str) -> bool:
    """Check if a file exists in R2"""
    if not R2_ENABLED:
        return False
    
    try:
        s3_client.head_object(Bucket=R2_BUCKET_NAME, Key=object_key)
        return True
    except s3_client.exceptions.NoSuchKey:
        return False
    except Exception as e:
        print(f"✗ Error checking R2 for {object_key}: {str(e)}")
        return False
```

### 3.2 Modify server.py

#### 3.2.1 Add R2 Import

At the top of `backend/server.py`, add:
```python
from r2_storage import upload_to_r2, delete_from_r2, get_r2_url, file_exists_in_r2, R2_ENABLED
```

#### 3.2.2 Modify Download Completion Handler

In `run_ytdlp` function, after successful download, upload to R2:

```python
# After file is downloaded and registered in database (around line 200-270)
if process.returncode == 0:
    if output_path.exists():
        filename = output_path.name
        file_size = output_path.stat().st_size
        downloads[video_id]["filename"] = filename
        downloads[video_id]["status"] = "complete"
        downloads[video_id]["progress"] = 100
        print(f"[{video_id}] Download complete: {filename}")
        print(f"[{video_id}] File size: {file_size / 1024 / 1024:.2f} MB")
        
        # Upload to R2 if enabled
        if R2_ENABLED:
            print(f"[{video_id}] Uploading to R2...")
            if upload_to_r2(output_path, filename):
                print(f"[{video_id}] ✓ Video uploaded to R2")
                # Optionally delete local file to save disk space
                # output_path.unlink()
                # print(f"[{video_id}] Local file deleted (stored in R2 only)")
            else:
                print(f"[{video_id}] ⚠ Failed to upload to R2, keeping local file")
        
        # Register video in shared storage and add to user's library
        # ... (existing code continues)
```

#### 3.2.3 Modify Video Serving Endpoint

Replace the existing `/videos/<filename>` endpoint:

```python
@app.route("/videos/<filename>")
def serve_video(filename):
    """Serve video file from R2 or local storage"""
    # Check if file exists in R2
    if R2_ENABLED and file_exists_in_r2(filename):
        # Generate presigned URL (valid for 1 hour)
        r2_url = get_r2_url(filename, expires_in=3600)
        if r2_url:
            return redirect(r2_url)
    
    # Fallback to local file if R2 not enabled or file not in R2
    filepath = VIDEOS_DIR / filename
    if filepath.exists():
        return send_from_directory(str(VIDEOS_DIR), filename)
    
    return jsonify({"error": "Video not found"}), 404
```

#### 3.2.4 Modify Video Deletion

In the `/api/videos/<filename>` DELETE endpoint, add R2 deletion:

```python
@app.route("/api/videos/<filename>", methods=["DELETE"])
def delete_video(filename):
    """Remove video from user's library (only deletes file if no other users have it)"""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    user_id = get_current_user_id()
    
    # Remove from user's library
    removed = remove_video_from_library(user_id, filename)
    
    if not removed:
        return jsonify({"error": "Video not found in library"}), 404
    
    # Check if any other users have this video
    reference_count = get_video_reference_count(filename)
    
    if reference_count == 0:
        # No other users reference it, safe to delete
        # Delete from R2
        if R2_ENABLED:
            delete_from_r2(filename)
        
        # Delete local file if it exists
        filepath = VIDEOS_DIR / filename
        if filepath.exists():
            filepath.unlink()
            print(f"Deleted local file: {filename}")
    
    return jsonify({"success": True})
```

### 3.3 Update render.yaml

Remove the disk configuration:

```yaml
services:
  - type: web
    name: fireworks-planner
    runtime: python
    buildCommand: "cd backend && pip install -r requirements.txt && pip install gunicorn && yt-dlp --update"
    startCommand: "cd backend && gunicorn server:app --bind 0.0.0.0:$PORT"
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
      - key: RENDER
        value: true
      # R2 Configuration (add these in Render dashboard)
      # - key: R2_ACCOUNT_ID
      #   value: your-account-id
      # - key: R2_ACCESS_KEY_ID
      #   value: your-access-key
      # - key: R2_SECRET_ACCESS_KEY
      #   value: your-secret-key
      # - key: R2_BUCKET_NAME
      #   value: fireworks-videos
    # Remove disk section - no longer needed!
```

## Step 4: Environment Variables

### 4.1 Local Development (.env)

Add to `backend/.env`:
```
R2_ACCOUNT_ID=your-account-id-here
R2_ACCESS_KEY_ID=your-access-key-id-here
R2_SECRET_ACCESS_KEY=your-secret-access-key-here
R2_BUCKET_NAME=fireworks-videos
R2_ENDPOINT_URL=https://your-account-id.r2.cloudflarestorage.com
```

### 4.2 Render.com Production

1. Go to Render Dashboard → Your Service → **Environment** tab
2. Add these environment variables:
   - `R2_ACCOUNT_ID` = (your Cloudflare account ID)
   - `R2_ACCESS_KEY_ID` = (your R2 access key)
   - `R2_SECRET_ACCESS_KEY` = (your R2 secret key)
   - `R2_BUCKET_NAME` = `fireworks-videos` (or your bucket name)
   - `R2_ENDPOINT_URL` = (optional, auto-generated if not set)

## Step 5: Migration Strategy

### Option A: Fresh Start (Recommended for Testing)
- New videos automatically go to R2
- Old videos remain on disk (or manually migrate)

### Option B: Migrate Existing Videos
Create a migration script `backend/migrate_to_r2.py`:

```python
from pathlib import Path
from r2_storage import upload_to_r2, R2_ENABLED
from database import get_all_videos

VIDEOS_DIR = Path(__file__).parent / "videos"

if not R2_ENABLED:
    print("R2 not configured!")
    exit(1)

# Get all videos from database
# (You'll need to add a function to get all video filenames)
videos = get_all_videos()  # Implement this function

for video in videos:
    filename = video['filename']
    local_path = VIDEOS_DIR / filename
    
    if local_path.exists():
        print(f"Migrating {filename}...")
        if upload_to_r2(local_path, filename):
            print(f"✓ {filename} migrated")
            # Optionally delete local file after successful upload
            # local_path.unlink()
        else:
            print(f"✗ Failed to migrate {filename}")
    else:
        print(f"⚠ {filename} not found locally")
```

## Step 6: Testing

### 6.1 Local Testing

1. Set up `.env` with R2 credentials
2. Start server: `START.bat`
3. Download a test video
4. Check R2 bucket - file should appear
5. Play video in app - should stream from R2

### 6.2 Production Testing

1. Deploy to Render with R2 env vars
2. Download a video
3. Check R2 bucket
4. Verify video plays correctly

## Step 7: Cleanup

After confirming R2 works:

1. **Remove disk from Render:**
   - Go to Render Dashboard → Your Service → **Settings** → **Disk**
   - Delete the disk (this will free up costs)

2. **Update render.yaml:**
   - Remove the `disk:` section (already done above)

3. **Optional: Delete local files:**
   - After migration, delete files from `backend/videos/` directory
   - Or keep as backup for a while

## Cost Comparison

**Before (Render Disk):**
- Starter plan: ~$7/month
- 1GB disk: ~$0.25/month
- **Total: ~$7.25/month**

**After (R2 Free Tier):**
- Free tier service: $0/month
- R2 storage (10GB): $0/month
- R2 egress: $0/month
- **Total: $0/month** (up to 10GB)

**After Free Tier (if you exceed 10GB):**
- R2 storage: $0.015/GB/month
- R2 egress: $0/month
- **Example: 50GB = $0.75/month** (vs $7.25/month on Render)

## Troubleshooting

### Videos not uploading to R2
- Check environment variables are set correctly
- Verify R2 credentials have write permissions
- Check Cloudflare R2 logs

### Videos not playing
- Verify presigned URLs are generating correctly
- Check CORS settings on R2 bucket (if needed)
- Ensure Content-Type is set correctly

### Migration issues
- Test with one video first
- Keep local files as backup until confirmed working
- Check R2 bucket permissions

## Next Steps

1. ✅ Create Cloudflare R2 bucket
2. ✅ Get API credentials
3. ✅ Install boto3
4. ✅ Create r2_storage.py module
5. ✅ Modify server.py for R2 integration
6. ✅ Update requirements.txt
7. ✅ Set environment variables
8. ✅ Test locally
9. ✅ Deploy to Render
10. ✅ Remove Render disk
11. ✅ Monitor R2 usage

## Notes

- **Presigned URLs:** Currently set to expire in 1 hour. Adjust `expires_in` parameter as needed.
- **Local Storage:** Code keeps local files as fallback. You can delete them after confirming R2 works.
- **CORS:** If serving videos directly from R2, you may need to configure CORS on the bucket.
- **Custom Domain:** Optional - you can set up a custom domain for R2 bucket for cleaner URLs.

