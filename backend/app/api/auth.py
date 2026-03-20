from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import Player, User
from app.schemas.requests import LoginRequest, RegisterRequest

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


def _serialize_user(user: User) -> dict:
    player = user.player_profile
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "player_id": player.id if player else None,
        "display_name": player.display_name if player else None,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    existing_user = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    if existing_user is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
    )
    player = Player(display_name=payload.display_name.strip(), user=user)
    db.add(user)
    db.add(player)
    db.commit()
    db.refresh(user)

    _set_auth_cookie(response, user.id)
    return _serialize_user(user)


@router.post("/login")
def login(
    payload: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    user = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    _set_auth_cookie(response, user.id)
    return _serialize_user(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> Response:
    response.delete_cookie(key=settings.cookie_name, path="/")
    return response


@router.get("/me")
def me(current_user: Annotated[User, Depends(get_current_user)]) -> dict:
    return _serialize_user(current_user)
