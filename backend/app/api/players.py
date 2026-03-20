from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Player, User
from app.services.leaderboards import build_player_stats, build_player_suggestions

router = APIRouter()


@router.get("")
def list_players(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    players = db.execute(select(Player).order_by(Player.display_name)).scalars().all()
    return [{"id": player.id, "display_name": player.display_name} for player in players]


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
