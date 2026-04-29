# ---------- Stage 1: build the frontend bundle ----------
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: Python backend + bundled frontend ----------
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg \
       ca-certificates \
       curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 app
WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install -r /app/backend/requirements.txt \
    && yt-dlp --update || true

COPY backend /app/backend
COPY --from=frontend /frontend/dist /app/frontend/dist

RUN mkdir -p /app/backend/videos && chown -R app:app /app
USER app

WORKDIR /app/backend
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-5000}/api/health || exit 1

# Shell-form CMD so Render's $PORT env var expands at runtime.
# Locally PORT is unset, so we fall back to 5000.
CMD exec gunicorn server:app \
     --bind 0.0.0.0:${PORT:-5000} \
     --workers 2 \
     --threads 4 \
     --timeout 300 \
     --preload \
     --access-logfile - \
     --error-logfile -
