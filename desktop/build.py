"""Build the FWP desktop binary for the host OS using PyInstaller.

Produces:
  Linux:    desktop/dist/fwp-desktop          (single binary)
  Windows:  desktop/dist/fwp-desktop.exe      (single binary)
  Mac:      desktop/dist/fwp-desktop.app/     (.app bundle)
            + dist/fwp-desktop-mac.zip        (zipped for distribution)

Usage:
  cd desktop
  pip install -r requirements.txt
  pip install pyinstaller pyinstaller-hooks-contrib
  python build.py
"""

from __future__ import annotations

import platform
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
ENTRY = HERE / "fwp_mini.py"
DIST = HERE / "dist"
APP_NAME = "fwp-desktop"


def main() -> int:
    if not ENTRY.exists():
        print(f"Entry script not found: {ENTRY}", file=sys.stderr)
        return 1

    system = platform.system()  # 'Linux', 'Darwin', 'Windows'

    cmd: list[str] = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "--clean",
        "--name", APP_NAME,
        # imageio-ffmpeg ships a binary inside its package; collect everything
        # so PyInstaller picks it up. The pyinstaller-hooks-contrib package
        # provides the hook automatically when installed, but --collect-all
        # belt-and-suspenders ensures it lands.
        "--collect-all", "imageio_ffmpeg",
        # PyWebView's backend imports are dynamic; help PyInstaller find them.
        "--collect-all", "webview",
    ]

    # Linux: bundle PyQt6 so PyWebView has a backend at runtime. Native
    # webviews on Mac (WebKit) and Windows (WebView2) are provided by the OS,
    # so no extra Python bindings need bundling there.
    if system == "Linux":
        cmd += [
            "--collect-all", "PyQt6",
            "--collect-all", "qtpy",
        ]

    if system == "Darwin":
        # macOS: build a .app bundle (PyInstaller produces a proper bundle
        # when --windowed is set; --onedir is implicit for .app).
        cmd += ["--windowed", str(ENTRY)]
    elif system == "Windows":
        cmd += ["--windowed", "--onefile", str(ENTRY)]
    else:
        # Linux: --windowed has no effect (no manifest), keep console for
        # easier debugging. Single-file binary.
        cmd += ["--onefile", str(ENTRY)]

    print(">", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=HERE)
    if proc.returncode != 0:
        return proc.returncode

    # Mac: ad-hoc sign + zip the .app for distribution.
    if system == "Darwin":
        app_path = DIST / f"{APP_NAME}.app"
        if not app_path.exists():
            print(f"Expected .app not found at {app_path}", file=sys.stderr)
            return 1

        # Re-apply a clean ad-hoc signature. PyInstaller already signs the
        # bundle, but doing it explicitly guarantees a valid signature right
        # before packaging. macOS on Apple Silicon refuses to launch a bundle
        # with an invalid signature, reporting it as "damaged".
        sign = subprocess.run(
            ["codesign", "--force", "--deep", "--sign", "-", str(app_path)]
        )
        if sign.returncode != 0:
            print("codesign failed", file=sys.stderr)
            return sign.returncode

        zip_path = DIST / f"{APP_NAME}-mac.zip"
        if zip_path.exists():
            zip_path.unlink()

        # Use ditto, not Python's zipfile. zipfile follows symlinks and drops
        # the executable bit, which corrupts the .app bundle and invalidates
        # the code signature — the downloaded app then shows as "damaged".
        # ditto preserves symlinks, permissions, resource forks, and the
        # signature; --keepParent keeps the fwp-desktop.app/ top level.
        ditto = subprocess.run(
            ["ditto", "-c", "-k", "--keepParent", str(app_path), str(zip_path)]
        )
        if ditto.returncode != 0:
            print("ditto packaging failed", file=sys.stderr)
            return ditto.returncode

        print(f"✓ {zip_path} ({zip_path.stat().st_size / 1024 / 1024:.1f} MB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
