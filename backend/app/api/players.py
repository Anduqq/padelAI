from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_scope, get_current_user
from app.db.session import get_db
from app.models import DataScope, Player, User
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


async def _store_avatar(
    *,
    player: Player,
    db: Session,
    avatar: UploadFile,
) -> dict:
    content = await avatar.read()
    try:
        extension = validate_avatar_upload(avatar, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    player.avatar_path = replace_player_avatar(player.id, extension, content)
    db.commit()
    db.refresh(player)
    return _serialize_player(player)


@router.get("")
def list_players(
    _: Annotated[User, Depends(get_current_user)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
    scope_filter: Literal["current", "prod"] = "current",
) -> list[dict]:
    selected_scope = DataScope.PROD if scope_filter == "prod" else current_scope
    players = (
        db.execute(select(Player).where(Player.data_scope == selected_scope).order_by(Player.display_name))
        .scalars()
        .all()
    )
    return [_serialize_player(player) for player in players]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_player(
    payload: PlayerCreateRequest,
    _: Annotated[User, Depends(get_current_user)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    try:
        player = create_player_account(db, payload.display_name, data_scope=current_scope)
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

    return await _store_avatar(player=player, db=db, avatar=avatar)


@router.post("/{player_id}/avatar")
async def upload_player_avatar(
    player_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    avatar: UploadFile = File(...),
) -> dict:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")

    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player profile not found.")

    return await _store_avatar(player=player, db=db, avatar=avatar)


@router.get("/suggestions")
def suggestions(
    _: Annotated[User, Depends(get_current_user)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    return build_player_suggestions(db, data_scope=current_scope)


@router.get("/me/stats")
def my_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    if current_user.player_profile is None:
        raise HTTPException(status_code=404, detail="Player profile not found.")
    return build_player_stats(db, current_user.player_profile.id, current_scope)


@router.get("/head-to-head")
def head_to_head(
    player_a_id: str,
    player_b_id: str,
    _: Annotated[User, Depends(get_current_user)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    try:
        return build_head_to_head(db, player_a_id, player_b_id, current_scope)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{player_id}")
def player_stats(
    player_id: str,
    _: Annotated[User, Depends(get_current_user)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    try:
        return build_player_stats(db, player_id, current_scope)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
