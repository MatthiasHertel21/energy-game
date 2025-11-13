#!/bin/bash
set -e

echo "=== Energy Game Deployment ==="

cd /home/ga/energy-game

if [ "$1" = "--backend-only" ]; then
  echo "Rebuilding and restarting backend only..."
  docker-compose build backend
  docker-compose down
  docker-compose up -d
elif [ "$1" = "--frontend-only" ]; then
  echo "Rebuilding and restarting frontend only..."
  docker-compose build --no-cache frontend
  docker-compose down
  docker-compose up -d
else
  echo "Rebuilding all services..."
  docker-compose build --no-cache
  docker-compose down
  docker-compose up -d
fi

echo "✓ Deployment complete!"
echo "Services running via Docker + Traefik (proxied by nginx)"
echo "Visit: https://iq.2b6.de"
