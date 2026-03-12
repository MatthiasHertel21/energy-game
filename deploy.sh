#!/bin/bash
set -e

echo "=== Energy Game Deployment ==="

cd /home/ga/energy-game

compose() {
  docker compose "$@"
}

retry_up() {
  local attempt=1
  local max=2
  until [ $attempt -gt $max ]; do
    if compose up -d; then
      return 0
    fi
    echo "docker compose up failed (attempt $attempt/$max). Retrying after pull..."
    compose pull || true
    attempt=$((attempt+1))
    sleep 2
  done
  return 1
}

if [ "$1" = "--backend-only" ]; then
  echo "Rebuilding and restarting backend only..."
  compose build backend
  compose down
  retry_up || { echo "ERROR: compose up failed"; exit 1; }
elif [ "$1" = "--frontend-only" ]; then
  echo "Rebuilding and restarting frontend only..."
  compose build --no-cache frontend
  compose down
  retry_up || { echo "ERROR: compose up failed"; exit 1; }
else
  echo "Rebuilding all services..."
  compose build --no-cache
  compose down
  retry_up || { echo "ERROR: compose up failed"; exit 1; }
fi

echo "✓ Deployment complete!"
echo "Services running via Docker + Traefik (proxied by nginx)"
echo "Visit: https://iq.2b6.de"
