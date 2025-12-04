#!/usr/bin/env python3
"""
Start local client with full output monitoring
This script runs the servers and shows all output in real-time
"""

import sys
import os
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Import and run the main launcher
if __name__ == "__main__":
    print("=" * 70)
    print("Starting Fireworks Planner with Full Monitoring")
    print("=" * 70)
    print("All output will be displayed here. Press Ctrl+C to stop.")
    print("=" * 70)
    print()
    
    # Import and run
    from start_local_client import main
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nShutting down servers...")
        sys.exit(0)
    except Exception as e:
        print(f"\n\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


