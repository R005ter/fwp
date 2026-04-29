# Overnight changes — 2026-04-28 → 2026-04-29

Quick read: the app is now Dockerized, modularized, JSX-based, and production-hardened.
Local stack runs at **http://localhost:5050**. Render deploys via the same Dockerfile.

---

## TL;DR — what to do in the morning

1. **Rotate two keys that were in git history** (still live unless you do this):
   - Render API key `rnd_dTKNigsW...` (Render dashboard → Account Settings → API Keys)
   - R2 keys (Cloudflare R2 → Manage API Tokens)
2. **Set required env vars on Render** before next push: `SECRET_KEY`, `DATABASE_URL`, plus optional `GOOGLE_CLIENT_ID/SECRET`, `R2_*`, `YOUTUBE_COOKIES`. Backend now refuses to boot on Render without `SECRET_KEY`.
3. **Test it locally**: `./dev.sh up`, login as `jtoth` / `testpass123` (or `./dev.sh test-user` to recreate).
4. **Push to Render** when ready. The `render.yaml` is already configured to use the Dockerfile.

---

## Phase 1 — Docker (already done before bed)

- `Dockerfile` (multi-stage: Node frontend build → Python backend with ffmpeg & yt-dlp)
- `docker-compose.yml` (postgres + backend, host port 5050 because macOS AirPlay squats :5000)
- `.env.example` documents every var; `.env` for local dev (gitignored)
- `requirements.txt` pinned with `~=`; yt-dlp left loose because YouTube anti-bot changes weekly
- `.gitignore` now excludes `.cursor/` (where the leaked Render key was)
- `render.yaml` scrubbed of leaked R2 credentials and switched to Docker runtime

## Phase 3 — Frontend modularization (done overnight)

The 3,620-line `frontend/index.html` is gone. Replaced by a real Vite + React + Tailwind project:

```
frontend/
├── index.html          ← minimal Vite entry
├── package.json, vite.config.js, tailwind.config.js, postcss.config.js
├── public/favicon.svg  ← fixes the favicon 404
└── src/
    ├── main.jsx        ← createRoot
    ├── App.jsx         ← FireworksPlanner (top-level, ~570 lines)
    ├── api.js          ← API_BASE, extractVideoId
    ├── index.css       ← Tailwind + iOS fixes
    └── components/
        ├── LoginView.jsx     (~190 lines)
        ├── Dashboard.jsx     (~270 lines)
        ├── LibraryView.jsx   (~530 lines)
        └── ShowEditor.jsx    (~720 lines)
```

**All five components are now real JSX**, not `React.createElement` calls. Verified each one renders correctly in a real browser via Playwright after every conversion. The build is now 219KB JS / 64KB gzipped.

The legacy file is preserved at `frontend/index-monolith.html.bak` for reference — feel free to delete it once you're confident in the rewrite.

### Bug found and fixed during the rewrite

`ShowEditor` referenced an undefined `showToast()` (line 1066-ish in the original). It was defined inside `FireworksPlanner` and would have thrown `ReferenceError` if you'd ever clicked Play before all videos were ready. JS's lazy lookup hid it. Now wired correctly via prop.

## Production hardening (done overnight)

In `backend/server.py`:

- **`SECRET_KEY` is now required in production.** No more random-per-restart fallback that silently logs everyone out.
- **CORS is no longer wildcard `*` in prod.** Backend serves the frontend from the same origin, so cross-origin isn't needed. If you ever split frontend onto a different domain, set `ALLOWED_ORIGINS=https://...` (comma-separated).
- **`gunicorn --preload`** to fix the `init_db()` race that was causing one of two workers to crash with `pg_type` unique-key violation on first boot.
- **`server.py` static_folder** points at the Vite build output (`../frontend/dist`).

## Polish

- Favicon (🎆 SVG) — no more 404 in console
- The verbose `[Playback]` and `[Video Sync]` logs that ran on every page load are gone (dropped during App.jsx JSX conversion). Console is now clean except for actual errors.
- `dev.sh` helper at the repo root: `./dev.sh up | down | fresh | logs | shell | rebuild | vite | build-frontend | test-user | help`

---

## Render deployment — ready to push

`render.yaml` now uses Docker runtime via `dockerfilePath: ./Dockerfile`. On Render:
- The same Dockerfile builds the frontend with Node, then the Python backend, all in one image
- `$PORT` is honored at runtime via shell-form CMD
- `healthCheckPath` is `/api/health`

Set these env vars in the Render dashboard (Environment tab) before next deploy:

| Var | Required? | Notes |
|---|---|---|
| `SECRET_KEY` | **YES** — boot-blocking | `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `DATABASE_URL` | **YES** | Supabase pooler URL, port 5432 (not 6543) |
| `GOOGLE_CLIENT_ID` | optional | login screen shows local-auth fallback if absent |
| `GOOGLE_CLIENT_SECRET` | optional | |
| `R2_ACCOUNT_ID` | optional | videos save to local volume if absent (won't survive a Render redeploy) |
| `R2_ACCESS_KEY_ID` | optional | |
| `R2_SECRET_ACCESS_KEY` | optional | |
| `R2_BUCKET_NAME` | optional | default `fwp-videos` |
| `YOUTUBE_COOKIES` | optional | base64-encoded Netscape cookies; expires every few weeks |
| `RENDER` | auto-set by Render | already in render.yaml |
| `ALLOWED_ORIGINS` | optional | only if frontend is on a different domain |

---

## Things I did NOT do (deliberate — not "running out of time")

For your son's home-use 4th-of-July app, these would be overengineering:

- **Alembic migrations.** The `init_db()` create-if-not-exists pattern is fine for a 2-user app. Adding a migration framework adds complexity for almost no benefit at this scale.
- **JWT or Redis tokens.** The local-client token store is an in-memory dict that vanishes on container restart. Doesn't matter — neither of you uses local-client mode against this server, and login is session-based via signed cookies.
- **Splitting `server.py` (1,924 lines) into Flask blueprints.** Real maintainability win, but the routes work and the file isn't growing. Worth doing if you ever come back to add features.
- **Dropping the YouTube downloader from the web client.** It already returns a clean 403 on Render with a helpful message. Web users use MP4 upload; YouTube lives in the local-client app.

Happy to do any of these if you want, just ask.

---

## Files changed/added overnight

```
A  CHANGES.md                            ← this file
M  .env.example                          ← added ALLOWED_ORIGINS, SECRET_KEY note
M  .gitignore                            ← .cursor/, frontend/node_modules, frontend/dist
M  .dockerignore                         ← node_modules, dist, *.bak
A  Dockerfile                            ← multi-stage, Node + Python + ffmpeg
A  docker-compose.yml
A  dev.sh                                ← helper script
M  README.md                             ← Docker quick-start at the top
M  backend/requirements.txt              ← pinned with ~=
M  backend/server.py                     ← SECRET_KEY required in prod, CORS, static_folder
M  render.yaml                           ← Docker runtime, scrubbed leaked secrets

A  frontend/package.json
A  frontend/vite.config.js
A  frontend/tailwind.config.js
A  frontend/postcss.config.js
M  frontend/index.html                   ← minimal Vite entry (was 3620 lines)
A  frontend/public/favicon.svg
A  frontend/src/main.jsx
A  frontend/src/App.jsx                  ← FireworksPlanner, JSX
A  frontend/src/api.js
A  frontend/src/index.css
A  frontend/src/components/LoginView.jsx
A  frontend/src/components/Dashboard.jsx
A  frontend/src/components/LibraryView.jsx
A  frontend/src/components/ShowEditor.jsx
A  frontend/index-monolith.html.bak      ← original, safe to delete
A  frontend/src/App-old.jsx.bak          ← unused legacy file from before
```

Stack is currently running. Verified in a real browser: login screen renders, login flow works, dashboard renders, navigation between dashboard / library / new show editor all work, logout works, toast notifications fire. No console errors. Bundle is 64KB gzipped.

Sleep well.
