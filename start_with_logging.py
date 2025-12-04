#!/usr/bin/env python3
"""
Start local client with logging to file
Output is logged to server.log for monitoring
"""

import sys
import os
from pathlib import Path
from datetime import datetime

class TeeOutput:
    """Write to both stdout and a log file"""
    def __init__(self, log_file):
        self.terminal = sys.stdout
        self.log = open(log_file, 'w', encoding='utf-8')
        self.log.write(f"=== Server started at {datetime.now()} ===\n")
        self.log.flush()
    
    def write(self, message):
        self.terminal.write(message)
        self.log.write(message)
        self.log.flush()
    
    def flush(self):
        self.terminal.flush()
        self.log.flush()
    
    def close(self):
        if self.log:
            self.log.close()

if __name__ == "__main__":
    log_file = Path(__file__).parent / "server.log"
    
    # Load environment variables from .env file
    backend_env = Path(__file__).parent / "backend" / ".env"
    if backend_env.exists():
        from dotenv import load_dotenv
        load_dotenv(backend_env)
        print(f"Loaded environment variables from {backend_env}")
    
    # Redirect stdout to both terminal and log file
    tee = TeeOutput(log_file)
    sys.stdout = tee
    
    try:
        print("=" * 70)
        print("Fireworks Planner - Starting with Logging")
        print("=" * 70)
        print(f"Output is being logged to: {log_file}")
        print("You can monitor errors by watching this file")
        print("=" * 70)
        print()
        
        # Import and run
        from start_local_client import main
        main()
    except KeyboardInterrupt:
        print("\n\nShutting down servers...")
        tee.close()
        sys.exit(0)
    except Exception as e:
        print(f"\n\nERROR: {e}")
        import traceback
        traceback.print_exc()
        tee.close()
        sys.exit(1)
    finally:
        tee.close()

