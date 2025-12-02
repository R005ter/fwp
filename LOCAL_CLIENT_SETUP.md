# Local Client Setup

The local client is a standalone application that serves the frontend locally and connects to your remote backend API.

## Quick Start

1. **Set the remote API URL** (optional, defaults to Render URL):
   ```bash
   export REMOTE_API_URL=https://fireworks-planner.onrender.com
   ```

2. **Run the local client**:
   ```bash
   python local_client.py
   ```

3. **The browser will open automatically** at `http://localhost:8080`

## How It Works

- **Frontend**: Served locally from `frontend/` directory
- **Backend API**: Connects to remote server (Render)
- **YouTube Downloads**: Work locally (no IP blocking)
- **Video Storage**: Uploads to remote server automatically

## Configuration

### Environment Variables

- `REMOTE_API_URL`: Remote backend API URL (default: `https://fireworks-planner.onrender.com`)
- `LOCAL_CLIENT_PORT`: Local server port (default: `8080`)

### Example

```bash
REMOTE_API_URL=https://fireworks-planner.onrender.com python local_client.py
```

## Creating an Executable

### Using PyInstaller

1. **Install PyInstaller**:
   ```bash
   pip install pyinstaller
   ```

2. **Create executable**:
   ```bash
   pyinstaller --onefile --name "FireworksPlanner" --add-data "frontend;frontend" local_client.py
   ```

3. **Run the executable**:
   ```bash
   ./dist/FireworksPlanner
   ```

### Using cx_Freeze

1. **Install cx_Freeze**:
   ```bash
   pip install cx_Freeze
   ```

2. **Create setup script** (see `setup_local_client.py`)

3. **Build**:
   ```bash
   python setup_local_client.py build
   ```

## Features

✅ **Standalone**: No need to run backend locally  
✅ **Simple**: Just run one script  
✅ **Auto-configured**: Automatically connects to remote API  
✅ **YouTube Downloads**: Work reliably (no Render IP blocking)  
✅ **Auto-upload**: Videos upload to remote server automatically  

## Troubleshooting

### Port Already in Use

Change the port:
```bash
LOCAL_CLIENT_PORT=8081 python local_client.py
```

### Frontend Not Found

Make sure you're running from the project root directory where `frontend/` exists.

### API Connection Issues

Check that `REMOTE_API_URL` is correct and the remote server is accessible.

