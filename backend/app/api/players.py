from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Player, User
from app.schemas.requests import PlayerCreateRequest
from app.services.analytics import build_head_to_head, build_player_stats
from app.services.leaderboards import build_player_suggestions
from app.services.player_accounts import create_player_account
from app.services.player_media import build_avatar_url, replace_player_avatar, validate_avatar_upload

router = APIRouter()


def _serialize_player(player: Player) -> dict:
    return {
        "id": player.id,
        "display_name": player.display_name,
        "avatar_url": build_avatar_url(player),
    }


@router.get("")
def list_players(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    players = db.execute(select(Player).order_by(Player.display_name)).scalars().all()
    return [_serialize_player(player) for player in players]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_player(
    payload: PlayerCreateRequest,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    try:
        player = create_player_account(db, payload.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    db.commit()
    db.refresh(player)
    return _serialize_player(player)


@router.post("/me/avatar")
async def upload_my_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    avatar: UploadFile = File(...),
) -> dict:
    player = current_user.player_profile
    if player is None:
        raise HTTPException(status_code=404, detail="Player profile not found.")

    content = await avatar.read()
    try:
        extension = validate_avatar_upload(avatar, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    player.avatar_path = replace_player_avatar(player.id, extension, content)
    db.commit()
    db.refresh(player)
    return _serialize_player(player)


@router.get("/suggestions")
def suggestions(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    return build_player_suggestions(db)


@router.get("/me/stats")
def my_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    if current_user.player_profile is None:
        raise HTTPException(status_code=404, detail="Player profile not found.")
    return build_player_stats(db, current_user.player_profile.id)


@router.get("/head-to-head")
def head_to_head(
    player_a_id: str,
    player_b_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    try:
        return build_head_to_head(db, player_a_id, player_b_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{player_id}")
def player_stats(
    player_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    try:
        return build_player_stats(db, player_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
