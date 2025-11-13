#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.." # backend/

export FLASK_APP=run.py

if [ ! -d "migrations" ]; then
  echo "Initializing migrations..."
  flask db init
fi

echo "Generating migration..."
flask db migrate -m "auto"

echo "Upgrading database..."
flask db upgrade

echo "Done."