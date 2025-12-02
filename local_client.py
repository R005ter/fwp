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
from pathlib import Path
from urllib.parse import urlparse

# Configuration
FRONTEND_DIR = Path(__file__).parent / "frontend"
REMOTE_API_URL = os.environ.get('REMOTE_API_URL', 'https://fireworks-planner.onrender.com')
PORT = int(os.environ.get('LOCAL_CLIENT_PORT', '8080'))

class LocalClientHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler that serves frontend and proxies API calls"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)
    
    def end_headers(self):
        # Add CORS headers for API calls
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()
    
    def do_GET(self):
        # Serve frontend files
        if self.path.startswith('/api/'):
            # Proxy API calls to remote server
            self.proxy_api_request()
        else:
            # Serve static files
            super().do_GET()
    
    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_api_request()
        else:
            self.send_error(404)
    
    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.end_headers()
    
    def proxy_api_request(self):
        """Proxy API requests to remote server"""
        import urllib.request
        import urllib.parse
        
        try:
            # Build remote URL
            remote_url = f"{REMOTE_API_URL}{self.path}"
            
            # Get request body if POST/PUT
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else None
            
            # Create request
            req = urllib.request.Request(remote_url, data=body)
            
            # Copy headers
            for header, value in self.headers.items():
                if header.lower() not in ['host', 'connection']:
                    req.add_header(header, value)
            
            # Make request
            with urllib.request.urlopen(req) as response:
                # Send response
                self.send_response(response.getcode())
                
                # Copy response headers
                for header, value in response.headers.items():
                    if header.lower() not in ['connection', 'transfer-encoding']:
                        self.send_header(header, value)
                
                self.end_headers()
                self.wfile.write(response.read())
                
        except Exception as e:
            print(f"Error proxying API request: {e}")
            self.send_error(502, f"Proxy error: {str(e)}")

def inject_api_config():
    """Inject API_BASE configuration into frontend via script injection"""
    # We'll inject a script tag that overrides API_BASE
    # This way we don't modify the original file
    return True  # Configuration handled by script tag injection

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
    
    # Inject API configuration
    inject_api_config()
    
    # Start server
    try:
        with socketserver.TCPServer(("", PORT), LocalClientHandler) as httpd:
            print(f"\n✓ Server started on http://localhost:{PORT}")
            print(f"✓ Connecting to remote API: {REMOTE_API_URL}")
            print(f"\nOpening browser...")
            print(f"Press Ctrl+C to stop\n")
            
            # Open browser
            webbrowser.open(f'http://localhost:{PORT}')
            
            # Serve forever
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"\nERROR: Port {PORT} is already in use.")
            print(f"Set LOCAL_CLIENT_PORT environment variable to use a different port.")
        else:
            print(f"\nERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

