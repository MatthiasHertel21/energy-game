#!/bin/bash
set -e

echo "=== Quick Frontend Deployment (with cache) ==="

cd /home/ga/energy-game

# Build frontend WITH cache (nur geänderte Files werden neu gebaut)
echo "Building frontend with cache..."
docker-compose build frontend

# Stop und entferne den alten Frontend-Container
echo "Stopping old frontend container..."
docker stop energy-game_frontend_1 2>/dev/null || true
docker rm energy-game_frontend_1 2>/dev/null || true

# Starte Frontend-Container neu
echo "Starting new frontend container..."
docker-compose up -d --no-deps frontend

echo "✓ Frontend deployed!"
echo "Visit: https://iq.2b6.de"
