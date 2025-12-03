#!/usr/bin/env python3
"""
Local Client Launcher - Handles Everything Automatically
Starts backend in local mode + serves frontend

Can be run as:
  - Python script: python start_local_client.py
  - Executable: FireworksPlanner.exe (after building with PyInstaller)
"""

import os
import sys
import subprocess
import time
import webbrowser
import http.server
import socketserver
import threading
from pathlib import Path

# Handle PyInstaller bundle (executable mode)
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    PROJECT_ROOT = Path(sys._MEIPASS)
    # But we need to find the actual project directory for frontend/backend
    # Try to find it relative to executable location
    EXE_DIR = Path(sys.executable).parent
    # Check if frontend/backend exist in exe directory (unpacked)
    if (EXE_DIR / "frontend").exists():
        PROJECT_ROOT = EXE_DIR
    else:
        # Try parent directory
        if (EXE_DIR.parent / "frontend").exists():
            PROJECT_ROOT = EXE_DIR.parent
        else:
            # Fallback to MEIPASS (PyInstaller temp directory)
            PROJECT_ROOT = Path(sys._MEIPASS)
else:
    # Running as script
    PROJECT_ROOT = Path(__file__).parent

# Configuration (PROJECT_ROOT set above based on execution mode)
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
REMOTE_API_URL = os.environ.get('REMOTE_API_URL', 'https://fireworks-planner.onrender.com')
LOCAL_BACKEND_PORT = int(os.environ.get('LOCAL_BACKEND_PORT', '5000'))
FRONTEND_PORT = int(os.environ.get('FRONTEND_PORT', '8080'))

# Set environment variables for local backend
os.environ['LOCAL_DOWNLOADER_MODE'] = 'true'
os.environ['REMOTE_SERVER_URL'] = REMOTE_API_URL
os.environ['PORT'] = str(LOCAL_BACKEND_PORT)
os.environ['FLASK_ENV'] = 'development'

class FrontendHandler(http.server.SimpleHTTPRequestHandler):
    """Serves frontend with API configuration"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()
    
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.serve_index_with_config()
        else:
            super().do_GET()
    
    def serve_index_with_config(self):
        """Serve index.html configured to use remote server for API, local for downloads"""
        index_file = FRONTEND_DIR / "index.html"
        if not index_file.exists():
            self.send_error(404)
            return
        
        try:
            import re
            content = index_file.read_text(encoding='utf-8')
            
            # Replace API_BASE definition FIRST - must happen before other scripts
            # Match the entire API_BASE assignment block (including conditional)
            # Pattern matches: const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : window.location.origin;
            pattern = r"const API_BASE = window\.location\.hostname === ['\"]localhost['\"][\s\S]*?window\.location\.origin;"
            replacement = f"const API_BASE = '{REMOTE_API_URL}'; // Local client: always use remote server for OAuth and API"
            
            if re.search(pattern, content):
                content = re.sub(pattern, replacement, content)
                print(f"[Local Client] Replaced API_BASE with remote server URL: {REMOTE_API_URL}")
            else:
                print("[Local Client] WARNING: Could not find API_BASE definition to replace")
            
            # Inject configuration for local YouTube downloads and OAuth
            local_download_config = f"""
    <script>
      // Configuration for local client
      const REMOTE_API_BASE = '{REMOTE_API_URL}';
      const LOCAL_BACKEND_URL = 'http://localhost:{LOCAL_BACKEND_PORT}';
      const LOCAL_FRONTEND_URL = 'http://localhost:{FRONTEND_PORT}';
      
      console.log('[Local Client] Configured:');
      console.log('  Remote API (API_BASE):', REMOTE_API_BASE);
      console.log('  Local Backend:', LOCAL_BACKEND_URL);
      console.log('  Local Frontend:', LOCAL_FRONTEND_URL);
      
      // Store auth token from URL or localStorage
      let authToken = null;
      
      // Check URL for auth token (from OAuth redirect)
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get('token');
      if (tokenFromUrl) {{
        authToken = tokenFromUrl;
        localStorage.setItem('auth_token', tokenFromUrl);
        // Remove token from URL
        window.history.replaceState({{}}, '', window.location.pathname + window.location.hash);
        console.log('[Local Client] Auth token saved from OAuth redirect');
      }} else {{
        // Try to get token from localStorage
        authToken = localStorage.getItem('auth_token');
      }}
      
      // Store original fetch
      const originalFetch = window.fetch;
      
      // Override fetch to route YouTube downloads to local backend and add auth token
      window.fetch = function(url, options) {{
        // Route YouTube download endpoints to local backend
        if (typeof url === 'string' && (url.includes('/api/download') || url.startsWith(REMOTE_API_BASE + '/api/download'))) {{
          // Replace remote API URL with local backend URL
          const localUrl = url.replace(REMOTE_API_BASE, LOCAL_BACKEND_URL);
          console.log('[Local Client] Routing YouTube download to local backend:', localUrl);
          return originalFetch(localUrl, options);
        }}
        
        // For remote API calls, add auth token header if available
        if (authToken && url.startsWith(REMOTE_API_BASE)) {{
          if (!options) options = {{}};
          if (!options.headers) options.headers = {{}};
          options.headers['X-Auth-Token'] = authToken;
        }}
        
        // All other API calls go to remote server
        return originalFetch(url, options);
      }};
      
      // Ensure OAuth redirects back to local frontend with frontend_url parameter
      window.addEventListener('DOMContentLoaded', function() {{
        // The frontend code already uses window.location.origin for OAuth
        // This will be http://localhost:8080 when running locally
        console.log('[Local Client] Frontend origin:', window.location.origin);
        console.log('[Local Client] OAuth will redirect back to:', window.location.origin);
        console.log('[Local Client] API_BASE is:', typeof API_BASE !== 'undefined' ? API_BASE : 'undefined');
      }});
    </script>
"""
            
            # Insert configuration script EARLY in <head> (before main script)
            if '</head>' in content:
                content = content.replace('</head>', local_download_config + '</head>')
            elif '<body>' in content:
                # Fallback: insert right before body if no </head> tag
                content = content.replace('<body>', local_download_config + '<body>')
            
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(content.encode('utf-8'))
        except Exception as e:
            print(f"Error serving index.html: {e}")
            import traceback
            traceback.print_exc()
            self.send_error(500)

def start_backend():
    """Start the backend server in local downloader mode"""
    print(f"Starting backend server on port {LOCAL_BACKEND_PORT}...")
    
    # Save current directory
    original_dir = os.getcwd()
    
    try:
        # Add backend to Python path
        backend_path = str(BACKEND_DIR)
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)
        
        # Change to backend directory for relative imports (like database.py)
        if BACKEND_DIR.exists():
            os.chdir(BACKEND_DIR)
        else:
            print(f"WARNING: Backend directory not found: {BACKEND_DIR}")
            print(f"Current directory: {os.getcwd()}")
            print(f"PROJECT_ROOT: {PROJECT_ROOT}")
        
        # Start Flask server
        from server import app
        app.run(host='0.0.0.0', port=LOCAL_BACKEND_PORT, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Backend error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        # Restore original directory
        os.chdir(original_dir)

def start_frontend():
    """Start the frontend server"""
    print(f"Starting frontend server on port {FRONTEND_PORT}...")
    
    try:
        with socketserver.TCPServer(("", FRONTEND_PORT), FrontendHandler) as httpd:
            print(f"✓ Frontend server ready")
            httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError as e:
        if "Address already in use" in str(e) or e.errno == 98:
            print(f"ERROR: Port {FRONTEND_PORT} is already in use.")
            print(f"Set FRONTEND_PORT environment variable to use a different port.")
        else:
            print(f"Frontend server error: {e}")

def wait_for_backend(max_wait=30):
    """Wait for backend to be ready"""
    import urllib.request
    import urllib.error
    
    backend_url = f"http://localhost:{LOCAL_BACKEND_PORT}/api/health"
    
    print("Waiting for backend to start...", end="", flush=True)
    for i in range(max_wait):
        try:
            urllib.request.urlopen(backend_url, timeout=1)
            print(" ✓")
            return True
        except:
            print(".", end="", flush=True)
            time.sleep(1)
    
    print(" ✗")
    print(f"WARNING: Backend did not start within {max_wait} seconds")
    return False

def main():
    """Main launcher"""
    print("=" * 70)
    print("🎆 Fireworks Planner - Local Client")
    print("=" * 70)
    print(f"Frontend: http://localhost:{FRONTEND_PORT}")
    print(f"Remote API: {REMOTE_API_URL} (auth, library, shows, etc.)")
    print(f"Local Backend: http://localhost:{LOCAL_BACKEND_PORT} (YouTube downloads only)")
    print("=" * 70)
    print("Architecture:")
    print(f"  • Frontend → Remote Server (for auth, library, shows)")
    print(f"  • Frontend → Local Backend (for YouTube downloads)")
    print(f"  • Local Backend → Remote Server (uploads videos)")
    print("=" * 70)
    
    # Check prerequisites
    if not BACKEND_DIR.exists():
        print(f"ERROR: Backend directory not found: {BACKEND_DIR}")
        sys.exit(1)
    
    if not FRONTEND_DIR.exists():
        print(f"ERROR: Frontend directory not found: {FRONTEND_DIR}")
        sys.exit(1)
    
    if not (FRONTEND_DIR / "index.html").exists():
        print(f"ERROR: Frontend index.html not found")
        sys.exit(1)
    
    # Start backend in background thread
    backend_thread = threading.Thread(target=start_backend, daemon=True)
    backend_thread.start()
    
    # Wait for backend to be ready
    if wait_for_backend():
        print("✓ Backend is ready")
    else:
        print("⚠ Continuing anyway...")
    
    # Start frontend in background thread
    frontend_thread = threading.Thread(target=start_frontend, daemon=True)
    frontend_thread.start()
    
    # Give frontend a moment to start
    time.sleep(1)
    
    # Open browser
    frontend_url = f"http://localhost:{FRONTEND_PORT}"
    print(f"\n✓ Opening browser at {frontend_url}")
    print(f"\nPress Ctrl+C to stop both servers\n")
    
    webbrowser.open(frontend_url)
    
    # Keep main thread alive
    try:
        while True:
            time.sleep(1)
            # Check if threads are still alive
            if not backend_thread.is_alive() and not frontend_thread.is_alive():
                print("\nBoth servers stopped")
                break
    except KeyboardInterrupt:
        print("\n\nShutting down...")
        print("✓ Local client stopped")

if __name__ == "__main__":
    main()

