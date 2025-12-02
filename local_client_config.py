#!/usr/bin/env python3
"""
Local Client Configuration Injector
Modifies frontend to point to remote API
"""

import os
import re
from pathlib import Path

FRONTEND_DIR = Path(__file__).parent / "frontend"
REMOTE_API_URL = os.environ.get('REMOTE_API_URL', 'https://fireworks-planner.onrender.com')

def configure_frontend():
    """Inject remote API URL into frontend"""
    index_file = FRONTEND_DIR / "index.html"
    
    if not index_file.exists():
        print(f"ERROR: Frontend not found at {index_file}")
        return False
    
    # Read the file
    content = index_file.read_text(encoding='utf-8')
    
    # Find and replace API_BASE
    # Pattern: const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
    pattern = r"const API_BASE = .*?;"
    replacement = f"const API_BASE = '{REMOTE_API_URL}';"
    
    if re.search(pattern, content):
        content = re.sub(pattern, replacement, content, flags=re.DOTALL)
        index_file.write_text(content, encoding='utf-8')
        print(f"✓ Configured frontend to use: {REMOTE_API_URL}")
        return True
    else:
        print("Warning: Could not find API_BASE pattern in frontend")
        return False

if __name__ == "__main__":
    configure_frontend()

