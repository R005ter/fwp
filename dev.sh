#!/usr/bin/env bash
# Helper for common FWP dev tasks. Run `./dev.sh` to see commands.
set -euo pipefail

CMD=${1:-help}

case "$CMD" in
  up)
    docker compose up -d --build
    echo "→ http://localhost:5050"
    ;;
  down)
    docker compose down
    ;;
  fresh)
    # Wipe DB + videos and rebuild from scratch.
    docker compose down -v
    docker compose up -d --build
    echo "→ Fresh stack at http://localhost:5050 (data wiped)"
    ;;
  logs)
    docker compose logs -f --tail=100 "${2:-backend}"
    ;;
  shell)
    # Shell into the backend container.
    docker compose exec backend bash
    ;;
  rebuild)
    # Rebuild without wiping data.
    docker compose up -d --build
    ;;
  vite)
    # Native Vite dev server with HMR. Backend is assumed to be running in
    # docker (./dev.sh up first). Vite proxies /api and /videos to it.
    cd frontend
    if [ ! -d node_modules ]; then
      npm install
    fi
    npm run dev
    ;;
  build-frontend)
    # Build the frontend bundle locally (without docker).
    cd frontend
    if [ ! -d node_modules ]; then
      npm install
    fi
    npm run build
    ;;
  test-user)
    # Create the dev test user (idempotent — fails politely if exists).
    curl -s -X POST http://localhost:5050/api/auth/register \
      -H 'Content-Type: application/json' \
      -d '{"username":"jtoth","email":"jtoth@example.com","password":"testpass123"}'
    echo
    ;;
  help|*)
    cat <<EOF
FWP dev helper. Usage: ./dev.sh <command>

  up               Build and start the docker stack (postgres + backend).
  down             Stop the stack (keeps volumes).
  fresh            down -v + up — wipes the database and uploaded videos.
  logs [service]   Tail logs (default: backend; try 'postgres').
  shell            bash into the backend container.
  rebuild          Rebuild the image and restart, keeping data.
  vite             Run Vite dev server with HMR (proxies /api to docker backend).
  build-frontend   Run a local frontend build into frontend/dist.
  test-user        Create the dev user (jtoth / testpass123) via the API.
  help             Show this message.
EOF
    ;;
esac
