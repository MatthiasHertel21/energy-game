#!/bin/bash
set -e

echo "=== Energy Game Deployment ==="

cd /home/ga/energy-game

retry_up() {
  local attempt=1
  local max=2
  until [ $attempt -gt $max ]; do
    if docker-compose up -d; then
      return 0
    fi
    echo "docker-compose up failed (attempt $attempt/$max). Retrying after pull..."
    docker-compose pull || true
    attempt=$((attempt+1))
    sleep 2
  done
  return 1
}

if [ "$1" = "--backend-only" ]; then
  echo "Rebuilding and restarting backend only..."
  docker-compose build backend
  docker-compose down
  retry_up || { echo "ERROR: compose up failed"; exit 1; }
elif [ "$1" = "--frontend-only" ]; then
  echo "Rebuilding and restarting frontend only..."
  docker-compose build --no-cache frontend
  docker-compose down
  retry_up || { echo "ERROR: compose up failed"; exit 1; }
else
  echo "Rebuilding all services..."
  docker-compose build --no-cache
  docker-compose down
  retry_up || { echo "ERROR: compose up failed"; exit 1; }
fi

echo "✓ Deployment complete!"
echo "Services running via Docker + Traefik (proxied by nginx)"
echo "Visit: https://iq.2b6.de"
