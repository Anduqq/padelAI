from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import auth, leaderboards, players, tournaments
from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import SessionLocal, init_db
from app.models import User
from app.ws.manager import manager


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(players.router, prefix="/api/players", tags=["players"])
app.include_router(leaderboards.router, prefix="/api/leaderboards", tags=["leaderboards"])
app.include_router(tournaments.router, prefix="/api/tournaments", tags=["tournaments"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.websocket("/ws/tournaments/{tournament_id}")
async def tournament_updates(websocket: WebSocket, tournament_id: str) -> None:
    token = websocket.cookies.get(settings.cookie_name)
    if token is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_access_token(token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    db = SessionLocal()
    try:
        user = db.get(User, payload.get("sub"))
        if user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await manager.connect(tournament_id, websocket)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(tournament_id, websocket)
    finally:
        db.close()


frontend_dir = settings.frontend_dist_dir
assets_dir = frontend_dir / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


def _serve_frontend(path_fragment: str | None = None) -> FileResponse:
    if path_fragment:
        candidate = frontend_dir / path_fragment
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)

    index_file = frontend_dir / "index.html"
    return FileResponse(index_file)


@app.get("/", include_in_schema=False)
def serve_index() -> FileResponse:
    return _serve_frontend()


@app.get("/{full_path:path}", include_in_schema=False)
def serve_spa(full_path: str) -> FileResponse:
    if full_path.startswith("api") or full_path.startswith("ws"):
        raise HTTPException(status_code=404)
    return _serve_frontend(full_path)
