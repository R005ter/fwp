"""
Database models and setup for Fireworks Planner
Supports both SQLite (local) and PostgreSQL (shared/production)
Uses DATABASE_URL environment variable to determine which to use
"""

import os
import json
from pathlib import Path
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

# Check if DATABASE_URL is set (PostgreSQL) or use SQLite
DATABASE_URL = os.environ.get('DATABASE_URL')

if DATABASE_URL:
    # PostgreSQL mode
    import psycopg2
    from psycopg2.extras import RealDictCursor
    USE_POSTGRES = True
    print("✓ Using PostgreSQL database (shared)")
else:
    # SQLite mode (fallback for local development)
    import sqlite3
    USE_POSTGRES = False
    DB_PATH = Path(__file__).parent / "fireworks.db"
    print(f"✓ Using SQLite database (local): {DB_PATH}")


def get_db():
    """Get database connection"""
    if USE_POSTGRES:
        # Parse DATABASE_URL (format: postgresql://user:pass@host:port/dbname)
        # Use RealDictCursor to get dict-like rows (similar to SQLite Row)
        # Supabase requires SSL and may have IPv6 connectivity issues on Render
        import urllib.parse
        
        parsed = urllib.parse.urlparse(DATABASE_URL)
        is_supabase = 'supabase' in (parsed.hostname or '').lower()
        
        if is_supabase:
            # Supabase: Use connection pooling URL or add SSL parameters
            # Parse connection string to extract components
            host = parsed.hostname
            port = parsed.port or 5432
            database = parsed.path.lstrip('/')
            user = parsed.username
            password = parsed.password
            
            # Try connecting with explicit parameters (avoids IPv6 issues)
            # Supabase requires SSL
            try:
                conn = psycopg2.connect(
                    host=host,
                    port=port,
                    database=database,
                    user=user,
                    password=password,
                    sslmode='require',
                    cursor_factory=RealDictCursor
                )
            except psycopg2.OperationalError as e:
                # If direct connection fails, try with connection pooling URL
                # Supabase connection pooling uses port 6543 (transaction mode)
                # or pooler URL format
                print(f"⚠ Direct connection failed: {str(e)}")
                print("💡 Tip: For Supabase on Render, use Connection Pooling URL:")
                print("   Settings → Database → Connection pooling → Transaction mode")
                print("   Format: postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:6543/postgres")
                raise
        else:
            # Regular PostgreSQL connection
            conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        
        return conn
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def execute_sql(cursor, sql, params=None):
    """Execute SQL with proper placeholder syntax for SQLite/PostgreSQL"""
    if USE_POSTGRES:
        # PostgreSQL uses %s placeholders
        # Convert ? to %s if needed (but be careful not to replace in strings)
        if '?' in sql and params:
            # Simple replacement - assumes no ? in string literals
            sql = sql.replace('?', '%s')
        cursor.execute(sql, params)
    else:
        # SQLite uses ? placeholders
        cursor.execute(sql, params)


def fetch_one(cursor):
    """Fetch one row, returning dict-like object"""
    if USE_POSTGRES:
        return cursor.fetchone()
    else:
        row = cursor.fetchone()
        return row


def fetch_all(cursor):
    """Fetch all rows, returning list of dict-like objects"""
    if USE_POSTGRES:
        return cursor.fetchall()
    else:
        return cursor.fetchall()


def get_table_info(cursor, table_name):
    """Get table column information"""
    if USE_POSTGRES:
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = %s
        """, (table_name,))
        return cursor.fetchall()
    else:
        cursor.execute("PRAGMA table_info({})".format(table_name))
        return cursor.fetchall()


def init_db():
    """Initialize database tables"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Determine primary key syntax
    if USE_POSTGRES:
        pk_syntax = "SERIAL PRIMARY KEY"
        text_type = "TEXT"
        int_type = "INTEGER"
        timestamp_default = "DEFAULT CURRENT_TIMESTAMP"
    else:
        pk_syntax = "INTEGER PRIMARY KEY AUTOINCREMENT"
        text_type = "TEXT"
        int_type = "INTEGER"
        timestamp_default = "DEFAULT CURRENT_TIMESTAMP"
    
    # Users table - supports both local and OAuth users
    execute_sql(cursor, f'''
        CREATE TABLE IF NOT EXISTS users (
            id {pk_syntax},
            username {text_type} UNIQUE NOT NULL,
            email {text_type},
            password_hash {text_type},
            oauth_provider {text_type},
            oauth_id {text_type},
            youtube_cookies {text_type},
            created_at TIMESTAMP {timestamp_default},
            UNIQUE(oauth_provider, oauth_id)
        )
    ''')
    
    # Migrate existing users table if needed (add OAuth columns and youtube_cookies)
    # Check if columns exist and add them if missing (works for both SQLite and PostgreSQL)
    try:
        if USE_POSTGRES:
            # PostgreSQL: Check if column exists using information_schema
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'oauth_provider'
            """)
            if not cursor.fetchone():
                execute_sql(cursor, 'ALTER TABLE users ADD COLUMN oauth_provider TEXT')
                print("✓ Added oauth_provider column to users table")
            
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'oauth_id'
            """)
            if not cursor.fetchone():
                execute_sql(cursor, 'ALTER TABLE users ADD COLUMN oauth_id TEXT')
                print("✓ Added oauth_id column to users table")
            
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'youtube_cookies'
            """)
            if not cursor.fetchone():
                execute_sql(cursor, 'ALTER TABLE users ADD COLUMN youtube_cookies TEXT')
                print("✓ Added youtube_cookies column to users table")
        else:
            # SQLite: Try to add columns (will fail if they exist)
            try:
                execute_sql(cursor, 'ALTER TABLE users ADD COLUMN oauth_provider TEXT')
                print("✓ Added oauth_provider column to users table")
            except sqlite3.OperationalError:
                pass  # Column already exists
            
            try:
                execute_sql(cursor, 'ALTER TABLE users ADD COLUMN oauth_id TEXT')
                print("✓ Added oauth_id column to users table")
            except sqlite3.OperationalError:
                pass  # Column already exists
            
            try:
                execute_sql(cursor, 'ALTER TABLE users ADD COLUMN youtube_cookies TEXT')
                print("✓ Added youtube_cookies column to users table")
            except sqlite3.OperationalError:
                pass  # Column already exists
    except Exception as e:
        # If migration fails, log but don't crash (columns might already exist)
        print(f"⚠ Migration note: {str(e)}")
        pass
    
    # Create index for OAuth lookups
    execute_sql(cursor, '''
        CREATE INDEX IF NOT EXISTS idx_oauth ON users(oauth_provider, oauth_id)
    ''')
    
    # Shows table (user's saved shows)
    execute_sql(cursor, f'''
        CREATE TABLE IF NOT EXISTS shows (
            id {pk_syntax},
            user_id {int_type} NOT NULL,
            name {text_type} NOT NULL,
            data {text_type} NOT NULL,
            timestamp TIMESTAMP {timestamp_default},
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, name)
        )
    ''')
    
    # Shared videos table (stores video files that can be shared across users)
    execute_sql(cursor, f'''
        CREATE TABLE IF NOT EXISTS videos (
            id {pk_syntax},
            filename {text_type} UNIQUE NOT NULL,
            youtube_url {text_type},
            title {text_type},
            downloaded_at TIMESTAMP {timestamp_default},
            file_size {int_type}
        )
    ''')
    
    # Library metadata table (user's video library settings - references shared videos)
    execute_sql(cursor, f'''
        CREATE TABLE IF NOT EXISTS library (
            id {pk_syntax},
            user_id {int_type} NOT NULL,
            video_id {int_type} NOT NULL,
            metadata {text_type} NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
            UNIQUE(user_id, video_id)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized")


def create_user(username, email, password=None, oauth_provider=None, oauth_id=None):
    """Create a new user (local or OAuth)"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        password_hash = generate_password_hash(password) if password else None
        
        # For OAuth users, username might be generated from email
        if oauth_provider and not username:
            username = email.split('@')[0] if email else f"user_{oauth_id[:8]}"
        
        # Ensure username uniqueness
        base_username = username
        counter = 1
        while True:
            execute_sql(cursor, 'SELECT id FROM users WHERE username = ?', (username,))
            if not fetch_one(cursor):
                break
            username = f"{base_username}{counter}"
            counter += 1
        
        # Check if OAuth ID already exists
        if oauth_provider and oauth_id:
            execute_sql(cursor,
                'SELECT id FROM users WHERE oauth_provider = ? AND oauth_id = ?',
                (oauth_provider, oauth_id)
            )
            if fetch_one(cursor):
                conn.close()
                return None  # OAuth ID already exists
        
        if USE_POSTGRES:
            execute_sql(cursor,
                'INSERT INTO users (username, email, password_hash, oauth_provider, oauth_id) VALUES (%s, %s, %s, %s, %s) RETURNING id',
                (username, email, password_hash, oauth_provider, oauth_id)
            )
            user_id = cursor.fetchone()[0]
        else:
            execute_sql(cursor,
                'INSERT INTO users (username, email, password_hash, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?)',
                (username, email, password_hash, oauth_provider, oauth_id)
            )
            user_id = cursor.lastrowid
        conn.commit()
        return {"id": user_id, "username": username, "email": email, "oauth_provider": oauth_provider}
    except Exception as e:
        print(f"Error creating user: {str(e)}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        conn.close()


def verify_user(username, password):
    """Verify user credentials"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor, 'SELECT * FROM users WHERE username = ?', (username,))
    user = fetch_one(cursor)
    conn.close()
    
    if user and check_password_hash(user['password_hash'], password):
        return {
            "id": user['id'],
            "username": user['username'],
            "email": user['email']
        }
    return None


def get_user_by_id(user_id):
    """Get user by ID"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor, 'SELECT * FROM users WHERE id = ?', (user_id,))
    user = fetch_one(cursor)
    conn.close()
    
    if user:
        try:
            oauth_provider = user['oauth_provider']
        except (KeyError, IndexError):
            oauth_provider = None
        
        return {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "oauth_provider": oauth_provider
        }
    return None


def get_user_by_oauth(provider, oauth_id):
    """Get user by OAuth provider and ID"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor,
        'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
        (provider, oauth_id)
    )
    user = fetch_one(cursor)
    conn.close()
    
    if user:
        try:
            oauth_provider = user['oauth_provider']
        except (KeyError, IndexError):
            oauth_provider = None
        
        return {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "oauth_provider": oauth_provider
        }
    return None


def save_show(user_id, show_name, show_data):
    """Save or update a show for a user"""
    conn = get_db()
    cursor = conn.cursor()
    
    data_json = json.dumps(show_data)
    if USE_POSTGRES:
        execute_sql(cursor, '''
            INSERT INTO shows (user_id, name, data, timestamp)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, name) DO UPDATE SET data = %s, timestamp = CURRENT_TIMESTAMP
        ''', (user_id, show_name, data_json, data_json))
    else:
        execute_sql(cursor, '''
            INSERT OR REPLACE INTO shows (user_id, name, data, timestamp)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ''', (user_id, show_name, data_json))
    
    conn.commit()
    conn.close()


def get_user_shows(user_id):
    """Get all shows for a user"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor,
        'SELECT name, data, timestamp FROM shows WHERE user_id = ? ORDER BY timestamp DESC',
        (user_id,)
    )
    rows = fetch_all(cursor)
    conn.close()
    
    shows = []
    for row in rows:
        shows.append({
            "name": row['name'],
            "data": json.loads(row['data']),
            "timestamp": row['timestamp']
        })
    return shows


def delete_show(user_id, show_name):
    """Delete a show"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor,
        'DELETE FROM shows WHERE user_id = ? AND name = ?',
        (user_id, show_name)
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted


def get_video_by_youtube_url(youtube_url):
    """Get video by YouTube URL (for checking if already downloaded)"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor, 'SELECT * FROM videos WHERE youtube_url = ?', (youtube_url,))
    video = fetch_one(cursor)
    conn.close()
    
    if video:
        try:
            file_size = video['file_size']
        except (KeyError, IndexError):
            file_size = None
        
        return {
            "id": video['id'],
            "filename": video['filename'],
            "youtube_url": video['youtube_url'],
            "title": video['title'],
            "file_size": file_size
        }
    return None


def get_video_by_filename(filename):
    """Get video by filename"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor, 'SELECT * FROM videos WHERE filename = ?', (filename,))
    video = fetch_one(cursor)
    conn.close()
    
    if video:
        try:
            file_size = video['file_size']
        except (KeyError, IndexError):
            file_size = None
        
        return {
            "id": video['id'],
            "filename": video['filename'],
            "youtube_url": video['youtube_url'],
            "title": video['title'],
            "file_size": file_size
        }
    return None


def create_video(filename, youtube_url=None, title=None, file_size=None):
    """Create a new shared video entry"""
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        if USE_POSTGRES:
            execute_sql(cursor, '''
                INSERT INTO videos (filename, youtube_url, title, file_size)
                VALUES (%s, %s, %s, %s) RETURNING id
            ''', (filename, youtube_url, title, file_size))
            video_id = cursor.fetchone()[0]
        else:
            execute_sql(cursor, '''
                INSERT INTO videos (filename, youtube_url, title, file_size)
                VALUES (?, ?, ?, ?)
            ''', (filename, youtube_url, title, file_size))
            video_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return video_id
    except Exception as e:
        # Video already exists
        execute_sql(cursor, 'SELECT id FROM videos WHERE filename = ?', (filename,))
        video = fetch_one(cursor)
        conn.close()
        return video['id'] if video else None


def add_video_to_library(user_id, video_id, metadata):
    """Add a video to a user's library (creates reference)"""
    conn = get_db()
    cursor = conn.cursor()
    
    metadata_json = json.dumps(metadata)
    if USE_POSTGRES:
        execute_sql(cursor, '''
            INSERT INTO library (user_id, video_id, metadata)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, video_id) DO UPDATE SET metadata = %s
        ''', (user_id, video_id, metadata_json, metadata_json))
    else:
        execute_sql(cursor, '''
            INSERT OR REPLACE INTO library (user_id, video_id, metadata)
            VALUES (?, ?, ?)
        ''', (user_id, video_id, metadata_json))
    
    conn.commit()
    conn.close()


def save_library_metadata(user_id, filename, metadata):
    """Save or update library metadata for a video (backward compatibility)"""
    # Find video by filename
    video = get_video_by_filename(filename)
    
    if not video:
        # Video doesn't exist in shared storage - try to create it
        # This can happen if a video file exists but wasn't registered
        from pathlib import Path
        videos_dir = Path(__file__).parent / "videos"
        filepath = videos_dir / filename
        
        if filepath.exists():
            # File exists, create video entry
            file_size = filepath.stat().st_size
            video_id = create_video(filename, None, metadata.get("title", filename), file_size)
            if video_id:
                add_video_to_library(user_id, video_id, metadata)
                return True
        return None
    
    add_video_to_library(user_id, video['id'], metadata)
    return True


def get_user_library(user_id):
    """Get all library metadata for a user (returns dict keyed by filename)"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor, '''
        SELECT v.filename, l.metadata
        FROM library l
        JOIN videos v ON l.video_id = v.id
        WHERE l.user_id = ?
    ''', (user_id,))
    rows = fetch_all(cursor)
    conn.close()
    
    library = {}
    for row in rows:
        library[row['filename']] = json.loads(row['metadata'])
    return library


def get_video_reference_count(video_id):
    """Get number of users who have this video in their library"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor, 'SELECT COUNT(*) as count FROM library WHERE video_id = ?', (video_id,))
    result = fetch_one(cursor)
    conn.close()
    
    return result['count'] if result else 0


def remove_video_from_library(user_id, filename):
    """Remove a video from a user's library"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Find video by filename
    execute_sql(cursor, 'SELECT id FROM videos WHERE filename = ?', (filename,))
    video = fetch_one(cursor)
    
    if not video:
        conn.close()
        return False
    
    video_id = video['id']
    
    # Remove from user's library
    execute_sql(cursor,
        'DELETE FROM library WHERE user_id = ? AND video_id = ?',
        (user_id, video_id)
    )
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    
    return deleted


def cleanup_orphaned_videos():
    """Delete videos that have no references in any user's library"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Find videos with zero references
    execute_sql(cursor, '''
        SELECT v.id, v.filename
        FROM videos v
        LEFT JOIN library l ON v.id = l.video_id
        WHERE l.id IS NULL
    ''')
    orphaned = fetch_all(cursor)
    
    deleted_files = []
    for video in orphaned:
        execute_sql(cursor, 'DELETE FROM videos WHERE id = ?', (video['id'],))
        deleted_files.append(video['filename'])
    
    conn.commit()
    conn.close()
    
    return deleted_files


def delete_library_item(user_id, filename):
    """Delete library metadata for a video (backward compatibility)"""
    return remove_video_from_library(user_id, filename)


def get_user_youtube_cookies(user_id):
    """Get YouTube cookies for a user"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor, 'SELECT youtube_cookies FROM users WHERE id = ?', (user_id,))
    row = fetch_one(cursor)
    conn.close()
    
    if row:
        try:
            return row['youtube_cookies']
        except (KeyError, IndexError):
            return None
    return None


def set_user_youtube_cookies(user_id, cookies_data):
    """Set YouTube cookies for a user"""
    conn = get_db()
    cursor = conn.cursor()
    
    execute_sql(cursor,
        'UPDATE users SET youtube_cookies = ? WHERE id = ?',
        (cookies_data, user_id)
    )
    conn.commit()
    conn.close()
    
    return cursor.rowcount > 0
