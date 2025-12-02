import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from pathlib import Path
from typing import Optional

# R2 Configuration
R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'fwp-videos')
R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL') or f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com'

# Check if R2 is configured
R2_ENABLED = all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY])

# Initialize S3 client for R2
s3_client = None
if R2_ENABLED:
    try:
        s3_client = boto3.client(
            's3',
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name='auto',  # R2 uses 'auto' for region
            config=Config(signature_version='s3v4')
        )
        print(f"✓ R2 storage initialized: bucket={R2_BUCKET_NAME}, endpoint={R2_ENDPOINT_URL}")
    except Exception as e:
        print(f"✗ Failed to initialize R2 client: {str(e)}")
        s3_client = None
        R2_ENABLED = False
else:
    print("⚠ R2 storage not configured (missing environment variables)")


def upload_to_r2(local_file_path: Path, object_key: str) -> bool:
    """Upload a file to R2 bucket"""
    if not R2_ENABLED or not s3_client:
        return False
    
    try:
        # Determine content type based on file extension
        content_type = 'video/mp4'
        if object_key.endswith('.m4a'):
            content_type = 'audio/mp4'
        elif object_key.endswith('.webm'):
            content_type = 'video/webm'
        
        s3_client.upload_file(
            str(local_file_path),
            R2_BUCKET_NAME,
            object_key,
            ExtraArgs={'ContentType': content_type}
        )
        print(f"✓ Uploaded {object_key} to R2")
        return True
    except Exception as e:
        print(f"✗ Failed to upload {object_key} to R2: {str(e)}")
        return False


def delete_from_r2(object_key: str) -> bool:
    """Delete a file from R2 bucket"""
    if not R2_ENABLED or not s3_client:
        return False
    
    try:
        s3_client.delete_object(Bucket=R2_BUCKET_NAME, Key=object_key)
        print(f"✓ Deleted {object_key} from R2")
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            print(f"⚠ File {object_key} not found in R2 (already deleted?)")
            return True  # Consider it successful if it doesn't exist
        print(f"✗ Failed to delete {object_key} from R2: {str(e)}")
        return False
    except Exception as e:
        print(f"✗ Failed to delete {object_key} from R2: {str(e)}")
        return False


def get_r2_url(object_key: str, expires_in: int = 3600) -> Optional[str]:
    """Generate a presigned URL for R2 object (valid for expires_in seconds)"""
    if not R2_ENABLED or not s3_client:
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
    if not R2_ENABLED or not s3_client:
        return False
    
    try:
        s3_client.head_object(Bucket=R2_BUCKET_NAME, Key=object_key)
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            return False
        print(f"✗ Error checking R2 for {object_key}: {str(e)}")
        return False
    except Exception as e:
        print(f"✗ Error checking R2 for {object_key}: {str(e)}")
        return False


def get_file_size_from_r2(object_key: str) -> Optional[int]:
    """Get file size from R2"""
    if not R2_ENABLED or not s3_client:
        return None
    
    try:
        response = s3_client.head_object(Bucket=R2_BUCKET_NAME, Key=object_key)
        return response.get('ContentLength')
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            return None
        print(f"✗ Error getting file size from R2 for {object_key}: {str(e)}")
        return None
    except Exception as e:
        print(f"✗ Error getting file size from R2 for {object_key}: {str(e)}")
        return None

