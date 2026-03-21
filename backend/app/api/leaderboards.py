from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.services.analytics import compute_elo_leaderboard
from app.services.leaderboards import compute_global_leaderboard

router = APIRouter()


@router.get("/global")
def global_leaderboard(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    return compute_global_leaderboard(db)


@router.get("/elo")
def elo_leaderboard(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    return compute_elo_leaderboard(db)
