#!/usr/bin/env python3
"""
Local Client Launcher
Serves the frontend locally and connects to remote backend API
"""

import os
import sys
import webbrowser
import http.server
import socketserver
import re
from pathlib import Path

# Configuration
FRONTEND_DIR = Path(__file__).parent / "frontend"
REMOTE_API_URL = os.environ.get('REMOTE_API_URL', 'https://fireworks-planner.onrender.com')
PORT = int(os.environ.get('LOCAL_CLIENT_PORT', '8080'))

class LocalClientHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler that serves frontend with API configuration injection"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()
    
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            # Inject API configuration into index.html
            self.serve_index_with_config()
        else:
            # Serve other static files normally
            super().do_GET()
    
    def serve_index_with_config(self):
        """Serve index.html with API_BASE configured to remote server"""
        index_file = FRONTEND_DIR / "index.html"
        if not index_file.exists():
            self.send_error(404)
            return
        
        try:
            content = index_file.read_text(encoding='utf-8')
            
            # Replace API_BASE definition to point to remote server
            pattern = r"const API_BASE = .*?;"
            replacement = f"const API_BASE = '{REMOTE_API_URL}';"
            
            if re.search(pattern, content, re.DOTALL):
                content = re.sub(pattern, replacement, content, flags=re.DOTALL)
            else:
                # If pattern not found, inject before closing </head>
                injection = f"    const API_BASE = '{REMOTE_API_URL}';\n"
                if '</head>' in content:
                    content = content.replace('</head>', f'  <script type="module">\n{injection}</script>\n</head>')
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
            
        except Exception as e:
            print(f"Error serving index.html: {e}")
            self.send_error(500)

def main():
    """Start the local client server"""
    print("=" * 60)
    print("🎆 Fireworks Planner - Local Client")
    print("=" * 60)
    print(f"Frontend directory: {FRONTEND_DIR}")
    print(f"Remote API URL: {REMOTE_API_URL}")
    print(f"Local server: http://localhost:{PORT}")
    print("=" * 60)
    
    # Check frontend exists
    if not FRONTEND_DIR.exists():
        print(f"ERROR: Frontend directory not found: {FRONTEND_DIR}")
        sys.exit(1)
    
    if not (FRONTEND_DIR / "index.html").exists():
        print(f"ERROR: Frontend index.html not found")
        sys.exit(1)
    
    # Start server
    try:
        with socketserver.TCPServer(("", PORT), LocalClientHandler) as httpd:
            print(f"\n✓ Server started on http://localhost:{PORT}")
            print(f"✓ Frontend will connect to: {REMOTE_API_URL}")
            print(f"\nOpening browser...")
            print(f"Press Ctrl+C to stop\n")
            
            # Open browser
            webbrowser.open(f'http://localhost:{PORT}')
            
            # Serve forever
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
    except OSError as e:
        if e.errno == 98 or "Address already in use" in str(e):  # Address already in use
            print(f"\nERROR: Port {PORT} is already in use.")
            print(f"Set LOCAL_CLIENT_PORT environment variable to use a different port.")
            print(f"Example: LOCAL_CLIENT_PORT=8081 python local_client.py")
        else:
            print(f"\nERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
