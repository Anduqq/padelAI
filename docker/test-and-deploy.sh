#!/bin/sh
set -eu

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

echo "[1/3] Building the app image"
compose build app

echo "[2/3] Running backend tests"
compose run --rm --no-deps app pytest

echo "[3/3] Starting the updated stack"
compose up -d --build
