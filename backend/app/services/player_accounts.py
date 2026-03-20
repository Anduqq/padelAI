from __future__ import annotations

import re
import secrets
from uuid import uuid4

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.security import hash_password
from app.models import Match, Player, ScoreAuditLog, Tournament, TournamentParticipant, User


def normalize_display_name(display_name: str) -> str:
    return " ".join(display_name.strip().split())


def build_internal_email(display_name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", normalize_display_name(display_name).lower()).strip("-") or "player"
    return f"{slug}-{uuid4().hex[:10]}@players.local"


def find_player_by_display_name(db: Session, display_name: str) -> Player | None:
    normalized = normalize_display_name(display_name)
    if not normalized:
        return None

    return (
        db.execute(
            select(Player)
            .where(func.lower(Player.display_name) == normalized.lower())
            .options(selectinload(Player.user))
        )
        .scalars()
        .first()
    )


def create_player_account(db: Session, display_name: str, *, is_admin: bool = False) -> Player:
    normalized = normalize_display_name(display_name)
    if len(normalized) < 2:
        raise ValueError("Display name must be at least 2 characters long.")

    if find_player_by_display_name(db, normalized) is not None:
        raise ValueError("Player name already exists.")

    user = User(
        email=build_internal_email(normalized),
        full_name=normalized,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        is_admin=is_admin,
    )
    player = Player(display_name=normalized, user=user)
    db.add(user)
    db.add(player)
    db.flush()
    return player


def ensure_primary_admin(db: Session, display_name: str = "IAR") -> Player:
    normalized = normalize_display_name(display_name)
    player = find_player_by_display_name(db, normalized)

    if player is None:
        player = create_player_account(db, normalized, is_admin=True)
    else:
        player.display_name = normalized
        if player.user is None:
            player.user = User(
                email=build_internal_email(normalized),
                full_name=normalized,
                password_hash=hash_password(secrets.token_urlsafe(32)),
                is_admin=True,
            )
            db.add(player.user)

        player.user.full_name = normalized
        player.user.is_admin = True

    if player.user is None:
        raise ValueError("Primary admin player must have an attached user.")

    db.execute(update(User).where(User.id != player.user.id).values(is_admin=False))
    _remove_legacy_admin_account(db, player)
    db.flush()
    return player


def _remove_legacy_admin_account(db: Session, primary_admin_player: Player) -> None:
    legacy_user = (
        db.execute(select(User).where(User.email == "admin@padelai.com").options(selectinload(User.player_profile)))
        .scalars()
        .first()
    )
    if legacy_user is None or legacy_user.id == primary_admin_player.user_id:
        return

    db.execute(
        update(Tournament)
        .where(Tournament.created_by_user_id == legacy_user.id)
        .values(created_by_user_id=primary_admin_player.user_id)
    )
    db.execute(
        update(Match)
        .where(Match.last_updated_by_user_id == legacy_user.id)
        .values(last_updated_by_user_id=primary_admin_player.user_id)
    )
    db.execute(
        update(ScoreAuditLog)
        .where(ScoreAuditLog.changed_by_user_id == legacy_user.id)
        .values(changed_by_user_id=primary_admin_player.user_id)
    )

    legacy_user.is_admin = False
    player = legacy_user.player_profile
    if player is None:
        db.delete(legacy_user)
        return

    has_participations = (
        db.execute(select(TournamentParticipant.id).where(TournamentParticipant.player_id == player.id).limit(1)).scalar_one_or_none()
        is not None
    )
    has_matches = (
        db.execute(
            select(Match.id)
            .where(
                or_(
                    Match.team_a_player_1_id == player.id,
                    Match.team_a_player_2_id == player.id,
                    Match.team_b_player_1_id == player.id,
                    Match.team_b_player_2_id == player.id,
                )
            )
            .limit(1)
        ).scalar_one_or_none()
        is not None
    )

    if has_participations or has_matches:
        return

    db.delete(player)
    db.flush()
    db.delete(legacy_user)
