"""FWP Desktop — Add YouTube videos to your Fireworks Planner library.

A focused, single-purpose desktop tool. The full app (show editing, library
browsing, timeline) lives at https://fireworks-planner.onrender.com. This
binary exists only so you can download YouTube videos from your residential
IP — Render's datacenter IPs are blocked by YouTube.

Flow:
  1. Sign in with Google in your default browser. The auth token is captured
     by a one-shot HTTP listener on 127.0.0.1 and saved to ~/.fwp/auth.json.
  2. Paste a YouTube URL. yt-dlp downloads to a temp dir, then the resulting
     MP4 is POSTed to {REMOTE}/api/upload-video. Your library on the web app
     updates immediately.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import sys
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
import webview
import yt_dlp

try:
    # Provides a bundled static ffmpeg binary so the packaged app doesn't
    # need the user to install ffmpeg system-wide.
    import imageio_ffmpeg
    BUNDLED_FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    BUNDLED_FFMPEG = None

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_REMOTE = "https://fireworks-planner.onrender.com"
REMOTE = os.environ.get("FWP_REMOTE", DEFAULT_REMOTE).rstrip("/")
APP_TITLE = "🎆 Fireworks Planner — Add Video"
CONFIG_DIR = Path.home() / ".fwp"
CONFIG_DIR.mkdir(exist_ok=True)
TOKEN_FILE = CONFIG_DIR / "auth.json"
LOOPBACK_PORT_RANGE = (53670, 53700)
USER_AGENT = "fwp-desktop/0.1"


# ---------------------------------------------------------------------------
# Token persistence
# ---------------------------------------------------------------------------

def save_token(token: str, user: dict) -> None:
    TOKEN_FILE.write_text(json.dumps({"token": token, "user": user}))
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except OSError:
        pass


def load_token() -> dict | None:
    if not TOKEN_FILE.exists():
        return None
    try:
        return json.loads(TOKEN_FILE.read_text())
    except Exception:
        return None


def clear_token() -> None:
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()


def fetch_user(token: str) -> dict | None:
    """Hit /api/auth/me with the token to confirm it's still valid."""
    try:
        r = requests.get(
            f"{REMOTE}/api/auth/me",
            headers={"X-Auth-Token": token, "User-Agent": USER_AGENT},
            timeout=10,
        )
        if r.ok and r.json().get("authenticated"):
            return r.json().get("user")
    except requests.RequestException:
        pass
    return None


# ---------------------------------------------------------------------------
# Browser-based OAuth via loopback listener
# ---------------------------------------------------------------------------

class _OAuthHandler(BaseHTTPRequestHandler):
    """One-shot handler. Captures ?token=…&state=… and writes a small page."""

    captured_token: str | None = None
    captured_error: str | None = None
    expected_state: str = ""

    def log_message(self, *args, **kwargs):
        return  # silence the default access log

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/oauth-callback":
            self.send_response(404)
            self.end_headers()
            return

        params = parse_qs(parsed.query)
        token = (params.get("token") or [None])[0]
        state = (params.get("state") or [None])[0]
        error = (params.get("error") or [None])[0]

        if error:
            _OAuthHandler.captured_error = error
        elif state != self.expected_state:
            _OAuthHandler.captured_error = "state_mismatch"
        elif not token:
            _OAuthHandler.captured_error = "no_token"
        else:
            _OAuthHandler.captured_token = token

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        body = (
            "<!doctype html><meta charset='utf-8'>"
            "<title>FWP Sign-in</title>"
            "<body style='font-family: -apple-system, system-ui, sans-serif;"
            " background:#111; color:#eee; text-align:center; padding:60px;'>"
            "<h2>✅ Sign-in complete</h2>"
            "<p>You can close this tab and return to the app.</p>"
            "</body>"
        )
        self.wfile.write(body.encode("utf-8"))


def login_via_browser(timeout_seconds: int = 180) -> tuple[str | None, dict | None, str | None]:
    """Open browser, run loopback listener, return (token, user, error)."""
    state = secrets.token_urlsafe(16)
    _OAuthHandler.captured_token = None
    _OAuthHandler.captured_error = None
    _OAuthHandler.expected_state = state

    server = None
    last_err = None
    for port in range(*LOOPBACK_PORT_RANGE):
        try:
            server = HTTPServer(("127.0.0.1", port), _OAuthHandler)
            break
        except OSError as e:
            last_err = e
    if server is None:
        return None, None, f"Could not bind any loopback port: {last_err}"

    try:
        callback_url = f"http://127.0.0.1:{server.server_port}/oauth-callback"
        auth_url = (
            f"{REMOTE}/api/auth/google"
            f"?desktop_callback={callback_url}"
            f"&state={state}"
        )
        threading.Thread(target=server.handle_request, daemon=True).start()
        webbrowser.open(auth_url)

        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if _OAuthHandler.captured_token:
                token = _OAuthHandler.captured_token
                user = fetch_user(token)
                if user:
                    save_token(token, user)
                    return token, user, None
                return None, None, "Token fetch failed"
            if _OAuthHandler.captured_error:
                return None, None, _OAuthHandler.captured_error
            time.sleep(0.2)
        return None, None, "timeout"
    finally:
        try:
            server.server_close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Download + upload
# ---------------------------------------------------------------------------

YOUTUBE_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)"
    r"([A-Za-z0-9_-]{11})"
)


def looks_like_youtube_url(url: str) -> bool:
    return bool(YOUTUBE_RE.search(url or ""))


def _parse_pct(s: str) -> float | None:
    try:
        return float(re.sub(r"\s+|%|\x1b\[[0-9;]*m", "", s))
    except (ValueError, TypeError):
        return None


def download_and_upload(url: str, token: str, on_progress) -> dict:
    """yt-dlp → temp file → POST /api/upload-video. Returns {"ok": bool, ...}."""
    on_progress({"phase": "starting", "message": "Resolving video…", "percent": None})
    with tempfile.TemporaryDirectory(prefix="fwp-") as tmp_root:
        tmp = Path(tmp_root)
        outtmpl = str(tmp / "%(id)s.%(ext)s")

        def hook(d):
            status = d.get("status")
            if status == "downloading":
                pct_raw = d.get("_percent_str") or ""
                pct = _parse_pct(pct_raw)
                speed = d.get("_speed_str", "").strip()
                eta = d.get("_eta_str", "").strip()
                msg = f"Downloading {pct_raw.strip()}"
                if speed:
                    msg += f" — {speed}"
                if eta:
                    msg += f" (eta {eta})"
                on_progress({"phase": "downloading", "message": msg, "percent": pct})
            elif status == "finished":
                on_progress({"phase": "merging", "message": "Merging audio + video…", "percent": None})

        ydl_opts = {
            "format": "bestvideo+bestaudio/best",
            "outtmpl": outtmpl,
            "merge_output_format": "mp4",
            "progress_hooks": [hook],
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
        }
        if BUNDLED_FFMPEG:
            ydl_opts["ffmpeg_location"] = BUNDLED_FFMPEG
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except yt_dlp.utils.DownloadError as e:
            return {"ok": False, "error": f"yt-dlp: {e}"}
        except Exception as e:
            return {"ok": False, "error": f"Download failed: {e}"}

        title = (info or {}).get("title") or "video"
        video_id = (info or {}).get("id") or ""

        # Find the merged file (yt-dlp may rename).
        candidates = sorted(tmp.glob(f"{video_id}.*")) if video_id else list(tmp.glob("*"))
        downloaded = next((c for c in candidates if c.suffix.lower() in {".mp4", ".mkv", ".webm", ".mov"}), None)
        if not downloaded:
            return {"ok": False, "error": "Downloaded file not found"}

        size_mb = downloaded.stat().st_size / (1024 * 1024)
        on_progress({
            "phase": "uploading",
            "message": f"Uploading {downloaded.name} ({size_mb:.1f} MB)…",
            "percent": None,
        })

        try:
            with open(downloaded, "rb") as f:
                r = requests.post(
                    f"{REMOTE}/api/upload-video",
                    files={"video": (downloaded.name, f, "video/mp4")},
                    data={"title": title, "youtube_url": url, "video_id": video_id},
                    headers={"X-Auth-Token": token, "User-Agent": USER_AGENT},
                    timeout=600,
                )
        except requests.RequestException as e:
            return {"ok": False, "error": f"Upload failed: {e}"}

        if not r.ok:
            return {"ok": False, "error": f"Upload failed: HTTP {r.status_code} — {r.text[:200]}"}

        try:
            payload = r.json()
        except ValueError:
            payload = {"raw": r.text[:200]}

        return {"ok": True, "title": title, "filename": payload.get("filename"), "server": payload}


# ---------------------------------------------------------------------------
# Bridge between embedded web UI and Python
# ---------------------------------------------------------------------------

class API:
    """Methods exposed to the page via webview.expose."""

    def __init__(self):
        self.window = None  # set after window is created
        self.token: str | None = None
        self.user: dict | None = None

    def attach(self, window):
        self.window = window

    def _emit(self, event: str, payload: dict | None = None):
        if not self.window:
            return
        body = json.dumps({"event": event, **(payload or {})})
        self.window.evaluate_js(f"window.fwpHandle({body})")

    # --- exposed ------------------------------------------------------------

    def get_state(self):
        cached = load_token()
        if cached and cached.get("token"):
            user = fetch_user(cached["token"])
            if user:
                self.token = cached["token"]
                self.user = user
                return {"authenticated": True, "user": user, "remote": REMOTE}
            clear_token()
        return {"authenticated": False, "remote": REMOTE}

    def sign_in(self):
        token, user, error = login_via_browser()
        if not token or not user:
            return {"ok": False, "error": error or "sign-in failed"}
        self.token = token
        self.user = user
        return {"ok": True, "user": user}

    def sign_out(self):
        clear_token()
        self.token = None
        self.user = None
        return {"ok": True}

    def submit_url(self, url: str):
        if not self.token:
            return {"ok": False, "error": "Not signed in"}
        if not looks_like_youtube_url(url):
            return {"ok": False, "error": "That doesn't look like a YouTube URL"}

        def runner():
            try:
                result = download_and_upload(url, self.token, lambda p: self._emit("progress", p))
                self._emit("complete", result)
            except Exception as e:  # last-resort guard
                self._emit("complete", {"ok": False, "error": f"Unexpected: {e}"})

        threading.Thread(target=runner, daemon=True).start()
        return {"ok": True}


# ---------------------------------------------------------------------------
# Embedded UI
# ---------------------------------------------------------------------------

HTML = r"""<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>FWP Desktop</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { -webkit-user-select: none; user-select: none; }
  input, textarea { user-select: text; -webkit-user-select: text; }
</style>
</head>
<body class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
<div class="max-w-md mx-auto p-6">
  <div class="text-center mb-6">
    <h1 class="text-2xl font-bold text-orange-400 mb-1">🎆 Fireworks Planner</h1>
    <p class="text-sm text-gray-400">Add YouTube videos to your library</p>
  </div>

  <div id="signedOut" class="hidden bg-gray-800/80 rounded-lg p-6 border border-purple-500/30 text-center space-y-4">
    <p class="text-gray-300">Sign in to add videos to your shared library.</p>
    <button id="signInBtn"
      class="w-full bg-purple-600 hover:bg-purple-700 px-4 py-3 rounded-lg font-bold transition">
      Sign in with Google
    </button>
    <p id="authErr" class="text-xs text-red-400 hidden"></p>
    <p class="text-xs text-gray-500" id="remoteLabel"></p>
  </div>

  <div id="signedIn" class="hidden space-y-4">
    <div class="bg-gray-800/70 rounded-lg p-4 border border-purple-500/30 flex items-center justify-between">
      <div>
        <div class="text-xs text-gray-400">Signed in as</div>
        <div id="userLabel" class="font-medium"></div>
      </div>
      <button id="signOutBtn" class="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded">Sign out</button>
    </div>

    <div class="bg-gray-800/70 rounded-lg p-4 border border-orange-500/30 space-y-3">
      <label class="block text-sm text-gray-400">YouTube URL</label>
      <input id="urlInput" type="text" placeholder="https://www.youtube.com/watch?v=…"
        class="w-full bg-gray-700 text-white px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-orange-500" />
      <button id="downloadBtn"
        class="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-3 rounded-lg font-bold transition">
        Download &amp; Upload
      </button>
    </div>

    <div id="status" class="bg-gray-800/70 rounded-lg p-4 border border-gray-700 hidden">
      <div id="statusMsg" class="text-sm mb-2"></div>
      <div class="h-2 bg-gray-700 rounded overflow-hidden">
        <div id="progressBar" class="h-full bg-orange-500 transition-all" style="width:0%"></div>
      </div>
    </div>

    <div id="history" class="space-y-2"></div>
  </div>
</div>

<script>
(function () {
  const $ = (id) => document.getElementById(id);
  let busy = false;

  function showAuthed(user) {
    $("signedOut").classList.add("hidden");
    $("signedIn").classList.remove("hidden");
    $("userLabel").textContent = (user && (user.username || user.email)) || "—";
  }
  function showAnon(err) {
    $("signedIn").classList.add("hidden");
    $("signedOut").classList.remove("hidden");
    if (err) {
      $("authErr").textContent = err;
      $("authErr").classList.remove("hidden");
    } else {
      $("authErr").classList.add("hidden");
    }
  }

  async function refresh() {
    const state = await window.pywebview.api.get_state();
    $("remoteLabel").textContent = "→ " + state.remote;
    if (state.authenticated) showAuthed(state.user);
    else showAnon();
  }

  $("signInBtn").addEventListener("click", async () => {
    $("signInBtn").disabled = true;
    $("signInBtn").textContent = "Opening browser…";
    const res = await window.pywebview.api.sign_in();
    $("signInBtn").disabled = false;
    $("signInBtn").textContent = "Sign in with Google";
    if (!res.ok) {
      showAnon(res.error || "sign-in failed");
      return;
    }
    showAuthed(res.user);
  });

  $("signOutBtn").addEventListener("click", async () => {
    await window.pywebview.api.sign_out();
    showAnon();
  });

  $("downloadBtn").addEventListener("click", async () => {
    if (busy) return;
    const url = ($("urlInput").value || "").trim();
    if (!url) return;
    busy = true;
    $("downloadBtn").disabled = true;
    $("status").classList.remove("hidden");
    $("statusMsg").textContent = "Submitting…";
    $("progressBar").style.width = "0%";
    const res = await window.pywebview.api.submit_url(url);
    if (!res.ok) {
      $("statusMsg").textContent = "❌ " + res.error;
      busy = false;
      $("downloadBtn").disabled = false;
    }
  });

  // Bridge from Python
  window.fwpHandle = function (msg) {
    if (msg.event === "progress") {
      $("statusMsg").textContent = msg.message || "";
      if (typeof msg.percent === "number") {
        $("progressBar").style.width = Math.max(0, Math.min(100, msg.percent)).toFixed(1) + "%";
      }
    } else if (msg.event === "complete") {
      busy = false;
      $("downloadBtn").disabled = false;
      if (msg.ok) {
        $("statusMsg").textContent = "✅ Uploaded: " + (msg.title || msg.filename || "video");
        $("progressBar").style.width = "100%";
        const item = document.createElement("div");
        item.className = "text-xs text-green-300 bg-gray-800/60 rounded px-3 py-2 border border-green-700/40";
        item.textContent = "✓ " + (msg.title || msg.filename || "video");
        $("history").prepend(item);
        $("urlInput").value = "";
      } else {
        $("statusMsg").textContent = "❌ " + (msg.error || "failed");
      }
    }
  };

  window.addEventListener("pywebviewready", refresh);
})();
</script>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    api = API()
    window = webview.create_window(
        title=APP_TITLE,
        html=HTML,
        js_api=api,
        width=560,
        height=720,
        resizable=True,
        min_size=(420, 520),
    )
    api.attach(window)
    webview.start(debug=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
