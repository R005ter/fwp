# Building Standalone Executable

Create a standalone executable so anyone can run the local client without Python installed.

## Quick Build (Windows)

Just double-click:
```
build.bat
```

Or run manually:
```bash
python build_executable.py
```

## Requirements

1. **Python installed** (for building only)
2. **PyInstaller**:
   ```bash
   pip install pyinstaller
   ```
3. **All dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```

## Building the Executable

### Option 1: Use Build Script (Easiest)

**Windows:**
```bash
build.bat
```

**Mac/Linux:**
```bash
python build_executable.py
```

### Option 2: Manual PyInstaller Command

```bash
pyinstaller --onefile --name "FireworksPlanner" --console --add-data "frontend;frontend" --add-data "backend;backend" start_local_client.py
```

## Output

After building, you'll find:
- **Executable**: `dist/FireworksPlanner.exe` (Windows) or `dist/FireworksPlanner` (Mac/Linux)
- **Build files**: `build/` directory (can be deleted)
- **Spec file**: `FireworksPlanner.spec` (can be kept for rebuilding)

## Distributing

1. **Copy the executable** (`dist/FireworksPlanner.exe`)
2. **Include frontend and backend folders** (they're bundled, but you may need to test)
3. **Test on a clean machine** (without Python installed)

## File Size

The executable will be large (50-100MB) because it includes:
- Python interpreter
- Flask and all dependencies
- Frontend files
- Backend code

This is normal for PyInstaller executables.

## Troubleshooting

### "Failed to execute script"

- Make sure all dependencies are installed before building
- Check that frontend/backend directories exist
- Try building with `--debug=all` flag for more info

### Executable won't start

- Check Windows Defender/antivirus isn't blocking it
- Try running from command line to see error messages
- Make sure you're not missing any data files

### Missing modules

Add to PyInstaller command:
```bash
--hidden-import <module_name>
```

## Alternative: Simple Batch File

If building an executable is too complex, you can use `run_local_client.bat`:

1. Double-click `run_local_client.bat`
2. Requires Python installed on the machine
3. Much simpler, but requires Python

## Testing

After building, test the executable:
1. Copy to a different location
2. Run it
3. Should open browser automatically
4. Try downloading a YouTube video


