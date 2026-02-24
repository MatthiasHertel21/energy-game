#!/bin/bash
set -e

echo "=== Quick Backend Deployment (with cache) ==="

cd /home/ga/energy-game

# Build backend WITH cache
echo "Building backend with cache..."
docker-compose build backend

# Stop und entferne den alten Backend-Container
echo "Stopping old backend container..."
docker stop energy-game_backend_1 2>/dev/null || true
docker rm energy-game_backend_1 2>/dev/null || true

# Starte Backend-Container neu
echo "Starting new backend container..."
docker-compose up -d --no-deps backend

echo "✓ Backend deployed!"
echo "Visit: https://iq.2b6.de"
