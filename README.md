# Padel By Claudiu

Private tournament tracking app for Americano and classical dynamic Mexicano games.

## Stack

- React + TypeScript + Vite
- FastAPI + SQLAlchemy
- PostgreSQL
- Docker Compose

## Local structure

- `frontend`: React app
- `backend`: FastAPI app
- `docker-compose.yml`: production-style local deployment

## Run with Docker

1. Copy `.env.example` to `.env` and adjust values.
2. Run `docker compose up --build`.
3. Open `http://localhost:8000`.

## Notes

- The app expects a single hostname setup with `/api` and `/ws` on the same host.
- Authentication is cookie-based.
- Mexicano rounds are generated dynamically from current standings.
