from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_scope, get_current_user
from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db
from app.models import DataScope, Player, User
from app.schemas.requests import PlayerLoginRequest
from app.services.player_media import build_avatar_url

router = APIRouter()


def _set_auth_cookie(response: Response, user_id: str) -> None:
    token = create_access_token(user_id)
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


def _set_scope_cookie(response: Response, scope: DataScope) -> None:
    response.set_cookie(
        key=settings.data_scope_cookie_name,
        value=scope.value,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


def _serialize_user(user: User, scope: DataScope) -> dict:
    player = user.player_profile
    return {
        "id": user.id,
        "full_name": user.full_name,
        "player_id": player.id if player else None,
        "display_name": player.display_name if player else None,
        "avatar_url": build_avatar_url(player),
        "is_admin": user.is_admin,
        "data_scope": scope.value,
    }


def _serialize_login_option(player: Player) -> dict:
    return {
        "player_id": player.id,
        "display_name": player.display_name,
        "avatar_url": build_avatar_url(player),
        "is_admin": bool(player.user and player.user.is_admin),
    }


@router.get("/options")
def login_options(db: Annotated[Session, Depends(get_db)]) -> list[dict]:
    players = (
        db.execute(
            select(Player)
            .where(Player.data_scope == DataScope.PROD)
            .options(selectinload(Player.user))
            .order_by(Player.display_name)
        )
        .scalars()
        .all()
    )
    ordered_players = sorted(
        players,
        key=lambda player: (
            0 if player.user and player.user.is_admin else 1,
            player.display_name.lower(),
        ),
    )
    return [_serialize_login_option(player) for player in ordered_players]


@router.post("/select")
def select_player(
    payload: PlayerLoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    player = (
        db.execute(
            select(Player)
            .where(Player.id == payload.player_id, Player.data_scope == DataScope.PROD)
            .options(selectinload(Player.user))
        )
        .scalars()
        .first()
    )
    if player is None or player.user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found.")

    _set_auth_cookie(response, player.user.id)
    _set_scope_cookie(response, DataScope.PROD)
    return _serialize_user(player.user, DataScope.PROD)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout() -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(
        key=settings.cookie_name,
        path="/",
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
    )
    response.delete_cookie(
        key=settings.data_scope_cookie_name,
        path="/",
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
    )
    return response


@router.get("/me")
def me(
    current_user: Annotated[User, Depends(get_current_user)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
) -> dict:
    return _serialize_user(current_user, current_scope)
