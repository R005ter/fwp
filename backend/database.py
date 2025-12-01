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
    
    # Migrate existing users table if needed (add OAuth columns)
    try:
        cursor.execute('ALTER TABLE users ADD COLUMN oauth_provider TEXT')
        cursor.execute('ALTER TABLE users ADD COLUMN oauth_id TEXT')
    except sqlite3.OperationalError:
        pass  # Columns already exist
    
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
    
    # Library metadata table (user's video library settings)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            metadata TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, filename)
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
            # Ensure uniqueness
            base_username = username
            counter = 1
            while True:
                cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
                if not cursor.fetchone():
                    break
                username = f"{base_username}{counter}"
                counter += 1
        
        cursor.execute(
            'INSERT INTO users (username, email, password_hash, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?)',
            (username, email, password_hash, oauth_provider, oauth_id)
        )
        user_id = cursor.lastrowid
        conn.commit()
        return {"id": user_id, "username": username, "email": email, "oauth_provider": oauth_provider}
    except sqlite3.IntegrityError:
        return None  # Username or OAuth ID already exists
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
        return {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "oauth_provider": user.get('oauth_provider')
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
        return {
            "id": user['id'],
            "username": user['username'],
            "email": user['email'],
            "oauth_provider": user.get('oauth_provider')
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


def save_library_metadata(user_id, filename, metadata):
    """Save or update library metadata for a video"""
    conn = get_db()
    cursor = conn.cursor()
    
    metadata_json = json.dumps(metadata)
    cursor.execute('''
        INSERT OR REPLACE INTO library (user_id, filename, metadata)
        VALUES (?, ?, ?)
    ''', (user_id, filename, metadata_json))
    
    conn.commit()
    conn.close()


def get_user_library(user_id):
    """Get all library metadata for a user"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        'SELECT filename, metadata FROM library WHERE user_id = ?',
        (user_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    
    library = {}
    for row in rows:
        library[row['filename']] = json.loads(row['metadata'])
    return library


def delete_library_item(user_id, filename):
    """Delete library metadata for a video"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        'DELETE FROM library WHERE user_id = ? AND filename = ?',
        (user_id, filename)
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted

