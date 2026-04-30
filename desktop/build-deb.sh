#!/bin/bash
# Build a Debian package for the FWP desktop app.
#
# Usage: ./build-deb.sh <version>     # version like 0.2.0 (no leading 'v')
#
# Produces: desktop/dist/fwp-desktop_<version>_all.deb
#
# Requires: dpkg-deb, rsvg-convert, python3 with pip (build host).
# Runs on Linux only.

set -euo pipefail

VERSION="${1:-0.0.0}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TEMPLATE="$HERE/deb-template"
STAGE="$HERE/dist/deb-stage"
APP_DST="$STAGE/opt/fwp-desktop"
DIST_DIR="$HERE/dist"
DEB_NAME="fwp-desktop_${VERSION}_all.deb"

command -v dpkg-deb >/dev/null    || { echo "dpkg-deb not found" >&2; exit 1; }
command -v rsvg-convert >/dev/null || { echo "rsvg-convert not found (apt install librsvg2-bin)" >&2; exit 1; }

rm -rf "$STAGE"
mkdir -p "$STAGE"

# Copy the package skeleton over, preserving permissions on DEBIAN scripts.
cp -a "$TEMPLATE"/. "$STAGE"/
chmod 0755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/postrm"
chmod 0755 "$STAGE/usr/bin/fwp-desktop"
mkdir -p "$APP_DST"

# Stamp the actual version into control.
sed -i "s/^Version: .*/Version: ${VERSION}/" "$STAGE/DEBIAN/control"

# Drop the source the .deb will install.
cp "$HERE/fwp_mini.py" "$APP_DST/fwp_mini.py"

# postinst pip-installs the Python deps from PyPI at install time (the user
# has internet then anyway). No bundled wheels, no resolution conflicts
# from pywebview's per-OS backend extras.

# Convert the project SVG icon to a 256x256 PNG for hicolor.
ICONS_DIR="$STAGE/usr/share/icons/hicolor/256x256/apps"
mkdir -p "$ICONS_DIR"
rsvg-convert -w 256 -h 256 "$ROOT/frontend/public/favicon.svg" \
  > "$ICONS_DIR/fwp-desktop.png"

# Set sane perms on tree contents (dpkg-deb is fussy about this).
find "$STAGE" -type d -exec chmod 0755 {} +
find "$STAGE" -type f -exec chmod 0644 {} +
chmod 0755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/postrm" "$STAGE/usr/bin/fwp-desktop"

mkdir -p "$DIST_DIR"
dpkg-deb --build --root-owner-group "$STAGE" "$DIST_DIR/$DEB_NAME"

echo
echo "Built $DIST_DIR/$DEB_NAME ($(du -h "$DIST_DIR/$DEB_NAME" | cut -f1))"
