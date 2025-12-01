"""
Database models and setup for Fireworks Planner
Uses SQLite for simplicity and portability
"""

import sqlite3
import json
from pathlib import Path
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

DB_PATH = Path(__file__).parent / "fireworks.db"


def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table - supports both local and OAuth users
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT,
            password_hash TEXT,
            oauth_provider TEXT,
            oauth_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(oauth_provider, oauth_id)
        )
    ''')
    
    # Migrate existing users table if needed (add OAuth columns and youtube_cookies)
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN oauth_provider TEXT')
        cursor.execute('ALTER TABLE users ADD COLUMN oauth_id TEXT')
    except sqlite3.OperationalError:
        pass  # Columns already exist
    
    # Add youtube_cookies column if it doesn't exist
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN youtube_cookies TEXT')
        print("✓ Added youtube_cookies column to users table")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Fix password_hash NOT NULL constraint for OAuth users
    # SQLite doesn't support ALTER COLUMN, so we need to recreate the table
    cursor.execute("PRAGMA table_info(users)")
    columns = {row[1]: row for row in cursor.fetchall()}
    
    if 'password_hash' in columns and columns['password_hash'][3] == 1:  # NOT NULL = True
        print("⚠️  Migrating users table to allow NULL password_hash for OAuth users...")
        # Create new table with correct schema (password_hash nullable)
        cursor.execute('''
            CREATE TABLE users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT,
                password_hash TEXT,
                oauth_provider TEXT,
                oauth_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(oauth_provider, oauth_id)
            )
        ''')
        
        # Copy data from old table
        cursor.execute('''
            INSERT INTO users_new (id, username, email, password_hash, oauth_provider, oauth_id, created_at)
            SELECT id, username, email, password_hash, oauth_provider, oauth_id, created_at
            FROM users
        ''')
        
        # Drop old table and rename new one
        cursor.execute('DROP TABLE users')
        cursor.execute('ALTER TABLE users_new RENAME TO users')
        
        print("✅ Migration complete")
    
    # Create index for OAuth lookups
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_oauth ON users(oauth_provider, oauth_id)
    ''')
    
    # Shows table (user's saved shows)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS shows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, name)
        )
    ''')
    
    # Shared videos table (stores video files that can be shared across users)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            youtube_url TEXT,
            title TEXT,
            downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            file_size INTEGER
        )
    ''')
    
    # Library metadata table (user's video library settings - references shared videos)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            video_id INTEGER NOT NULL,
            metadata TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
            UNIQUE(user_id, video_id)
        )
    ''')
    
    # Migrate existing library table if needed (change from filename to video_id)
    try:
        cursor.execute("PRAGMA table_info(library)")
        columns = {row[1]: row for row in cursor.fetchall()}
        
        if 'filename' in columns and 'video_id' not in columns:
            print("⚠️  Migrating library table to use shared video references...")
            # Create new library table
            cursor.execute('''
                CREATE TABLE library_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    video_id INTEGER NOT NULL,
                    metadata TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users (id),
                    FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
                    UNIQUE(user_id, video_id)
                )
            ''')
            
            # Migrate existing data: create video entries and link them
            cursor.execute('SELECT DISTINCT user_id, filename, metadata FROM library')
            old_library = cursor.fetchall()
            
            for row in old_library:
                user_id, filename, metadata = row
                # Check if video exists in videos table
                cursor.execute('SELECT id FROM videos WHERE filename = ?', (filename,))
                video = cursor.fetchone()
                
                if not video:
                    # Create video entry
                    cursor.execute('''
                        INSERT INTO videos (filename, youtube_url, title)
                        VALUES (?, ?, ?)
                    ''', (filename, None, filename))
                    video_id = cursor.lastrowid
                else:
                    video_id = video['id']
                
                # Add to new library table
                cursor.execute('''
                    INSERT INTO library_new (user_id, video_id, metadata)
                    VALUES (?, ?, ?)
                ''', (user_id, video_id, metadata))
            
            # Drop old table and rename
            cursor.execute('DROP TABLE library')
            cursor.execute('ALTER TABLE library_new RENAME TO library')
            print("✅ Library migration complete")
    except sqlite3.OperationalError as e:
        pass  # Migration already done or error
    
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
            cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
            if not cursor.fetchone():
                break
            username = f"{base_username}{counter}"
            counter += 1
        
        # Check if OAuth ID already exists
        if oauth_provider and oauth_id:
            cursor.execute(
                'SELECT id FROM users WHERE oauth_provider = ? AND oauth_id = ?',
                (oauth_provider, oauth_id)
            )
            if cursor.fetchone():
                conn.close()
                return None  # OAuth ID already exists
        
        cursor.execute(
            'INSERT INTO users (username, email, password_hash, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?)',
            (username, email, password_hash, oauth_provider, oauth_id)
        )
        user_id = cursor.lastrowid
        conn.commit()
        return {"id": user_id, "username": username, "email": email, "oauth_provider": oauth_provider}
    except sqlite3.IntegrityError as e:
        print(f"Database integrity error creating user: {str(e)}")
        print(f"  Username: {username}, Email: {email}, OAuth: {oauth_provider}/{oauth_id}")
        return None  # Username or OAuth ID already exists
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
    
    cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
    user = cursor.fetchone()
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
    
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
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
    
    cursor.execute(
        'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?',
        (provider, oauth_id)
    )
    user = cursor.fetchone()
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
    cursor.execute('''
        INSERT OR REPLACE INTO shows (user_id, name, data, timestamp)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ''', (user_id, show_name, data_json))
    
    conn.commit()
    conn.close()


def get_user_shows(user_id):
    """Get all shows for a user"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        'SELECT name, data, timestamp FROM shows WHERE user_id = ? ORDER BY timestamp DESC',
        (user_id,)
    )
    rows = cursor.fetchall()
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
    
    cursor.execute(
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
    
    cursor.execute('SELECT * FROM videos WHERE youtube_url = ?', (youtube_url,))
    video = cursor.fetchone()
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
    
    cursor.execute('SELECT * FROM videos WHERE filename = ?', (filename,))
    video = cursor.fetchone()
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
        cursor.execute('''
            INSERT INTO videos (filename, youtube_url, title, file_size)
            VALUES (?, ?, ?, ?)
        ''', (filename, youtube_url, title, file_size))
        video_id = cursor.lastrowid
        conn.commit()
        return video_id
    except sqlite3.IntegrityError:
        # Video already exists
        cursor.execute('SELECT id FROM videos WHERE filename = ?', (filename,))
        video = cursor.fetchone()
        conn.close()
        return video['id'] if video else None
    finally:
        conn.close()


def add_video_to_library(user_id, video_id, metadata):
    """Add a video to a user's library (creates reference)"""
    conn = get_db()
    cursor = conn.cursor()
    
    metadata_json = json.dumps(metadata)
    cursor.execute('''
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
    
    cursor.execute('''
        SELECT v.filename, l.metadata
        FROM library l
        JOIN videos v ON l.video_id = v.id
        WHERE l.user_id = ?
    ''', (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    library = {}
    for row in rows:
        library[row['filename']] = json.loads(row['metadata'])
    return library


def get_video_reference_count(video_id):
    """Get number of users who have this video in their library"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) as count FROM library WHERE video_id = ?', (video_id,))
    result = cursor.fetchone()
    conn.close()
    
    return result['count'] if result else 0


def remove_video_from_library(user_id, filename):
    """Remove a video from a user's library"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Find video by filename
    cursor.execute('SELECT id FROM videos WHERE filename = ?', (filename,))
    video = cursor.fetchone()
    
    if not video:
        conn.close()
        return False
    
    video_id = video['id']
    
    # Remove from user's library
    cursor.execute(
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
    cursor.execute('''
        SELECT v.id, v.filename
        FROM videos v
        LEFT JOIN library l ON v.id = l.video_id
        WHERE l.id IS NULL
    ''')
    orphaned = cursor.fetchall()
    
    deleted_files = []
    for video in orphaned:
        cursor.execute('DELETE FROM videos WHERE id = ?', (video['id'],))
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
    
    cursor.execute('SELECT youtube_cookies FROM users WHERE id = ?', (user_id,))
    row = cursor.fetchone()
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
    
    cursor.execute(
        'UPDATE users SET youtube_cookies = ? WHERE id = ?',
        (cookies_data, user_id)
    )
    conn.commit()
    conn.close()
    
    return cursor.rowcount > 0

