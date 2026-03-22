from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_scope, require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models import DataScope, User
from app.schemas.requests import DemoSeedRequest, ScopeUpdateRequest
from app.services.demo_data import build_admin_overview, clear_scope_tournaments, seed_demo_data

router = APIRouter()


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


@router.get("/overview")
def admin_overview(
    _: Annotated[User, Depends(require_admin)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    return build_admin_overview(db, current_scope)


@router.post("/scope")
def update_scope(
    payload: ScopeUpdateRequest,
    response: Response,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    scope = DataScope(payload.scope)
    _set_scope_cookie(response, scope)
    return build_admin_overview(db, scope)


@router.post("/test-data/seed")
def seed_test_data(
    payload: DemoSeedRequest,
    current_admin: Annotated[User, Depends(require_admin)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    seed_demo_data(
        db,
        admin_user=current_admin,
        tournament_count=payload.tournament_count,
        replace_existing=payload.replace_existing,
    )
    db.commit()
    return build_admin_overview(db, current_scope)


@router.delete("/test-data")
def clear_test_data(
    _: Annotated[User, Depends(require_admin)],
    current_scope: Annotated[DataScope, Depends(get_current_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    clear_scope_tournaments(db, DataScope.TEST)
    db.commit()
    return build_admin_overview(db, current_scope)
