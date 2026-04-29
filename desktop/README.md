# FWP Desktop — mini downloader

Single-purpose desktop app: sign in with Google, paste a YouTube URL, the video downloads on your machine and uploads to your Fireworks Planner library on Render.

The full web app (show editing, library browsing, timeline) lives at <https://fireworks-planner.onrender.com>. This binary exists only because YouTube blocks Render's datacenter IPs.

## Just want to run it?

Download the binary for your OS from the **🖥️ Desktop App** panel on the dashboard at fireworks-planner.onrender.com (admins only) or grab it directly from <https://github.com/R005ter/fwp/releases/latest>.

| OS | Filename | First-run notes |
|---|---|---|
| Windows | `fwp-desktop-windows.exe` | Double-click. SmartScreen may complain — click *More info → Run anyway*. |
| macOS | `fwp-desktop-mac.zip` | Unzip. Right-click `fwp-desktop.app` → **Open** (Gatekeeper bypass for unsigned apps). After the first open, you can launch normally. |
| Linux | `fwp-desktop-linux.AppImage` | Right-click → **Properties → Permissions → Allow executing**, then double-click. (Or `chmod +x fwp-desktop-linux.AppImage && ./fwp-desktop-linux.AppImage` from a terminal.) |

ffmpeg is bundled inside the binary — you don't need to install anything else.

### macOS Gatekeeper, the fast way

If right-click → Open is annoying, you can also do:

```bash
xattr -dr com.apple.quarantine /path/to/fwp-desktop.app
```

That clears the quarantine flag so the app opens like any other.

### Linux Mint specifics

The Linux build is shipped as an AppImage (`.AppImage` extension) so the file manager recognizes it and lets you run it directly via right-click → Properties → Permissions → "Allow executing file as program," then double-click.

PyWebView uses your system's WebKit GTK. Modern Mint editions ship with it preinstalled. If launching the AppImage errors with `cannot import name WebKit2 from gi.repository`, install:

```bash
sudo apt install libwebkit2gtk-4.1-0
# Older Mint releases (20.x and earlier):
# sudo apt install libwebkit2gtk-4.0
```

If the AppImage refuses to run with a FUSE-related error on a very minimal install, install FUSE 2:

```bash
sudo apt install libfuse2
```

## Run from source (developers)

```bash
cd desktop
python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python fwp_mini.py
```

Set `FWP_REMOTE` to point at a different server (the local Docker stack, for example):

```bash
FWP_REMOTE=http://localhost:5050 python fwp_mini.py
```

## Build a standalone binary locally

```bash
cd desktop
pip install -r requirements.txt
pip install pyinstaller pyinstaller-hooks-contrib
python build.py
```

Outputs land in `desktop/dist/`. PyInstaller can only build for the OS it runs on, so building releases for all three platforms requires either three machines or — easier — the GitHub Actions workflow at `.github/workflows/build-desktop.yml` (push a tag like `v0.1.0` to trigger it).

## What's inside the binary

| | |
|---|---|
| Python runtime | bundled by PyInstaller |
| `yt-dlp` | latest at build time |
| `ffmpeg` | static binary from `imageio-ffmpeg` |
| GUI | system WebView — Edge WebView2 (Win), WebKit (Mac), WebKitGTK (Linux) |
| HTML/CSS | embedded in the Python file (Tailwind via CDN at runtime) |

## Auth token

Token is a 32-byte random string the server mints after Google OAuth, scoped to your user, valid for 24 hours. It lives in the `auth_tokens` table on the server and `~/.fwp/auth.json` (mode 0600) on your machine. To force a fresh sign-in: delete `~/.fwp/auth.json` or click **Sign out** in the app.
