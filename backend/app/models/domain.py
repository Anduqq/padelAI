from __future__ import annotations

import enum
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class TournamentFormat(str, enum.Enum):
    AMERICANO = "americano"
    MEXICANO = "mexicano"


class TournamentStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


class RoundStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    player_profile: Mapped[Player | None] = relationship(back_populates="user", uselist=False)
    created_tournaments: Mapped[list[Tournament]] = relationship(back_populates="creator")


class Player(Base):
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped[User] = relationship(back_populates="player_profile")
    tournament_memberships: Mapped[list[TournamentParticipant]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )


class Tournament(Base):
    __tablename__ = "tournaments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(255))
    format: Mapped[TournamentFormat] = mapped_column(Enum(TournamentFormat))
    status: Mapped[TournamentStatus] = mapped_column(Enum(TournamentStatus), default=TournamentStatus.DRAFT)
    court_count: Mapped[int] = mapped_column(Integer, default=2)
    target_rounds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    creator: Mapped[User] = relationship(back_populates="created_tournaments")
    participants: Mapped[list[TournamentParticipant]] = relationship(
        back_populates="tournament",
        cascade="all, delete-orphan",
        order_by="TournamentParticipant.order_index",
    )
    rounds: Mapped[list[Round]] = relationship(
        back_populates="tournament",
        cascade="all, delete-orphan",
        order_by="Round.number",
    )
    matches: Mapped[list[Match]] = relationship(back_populates="tournament", cascade="all, delete-orphan")


class TournamentParticipant(Base):
    __tablename__ = "tournament_participants"
    __table_args__ = (UniqueConstraint("tournament_id", "player_id", name="uq_tournament_player"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tournament_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournaments.id"), index=True)
    player_id: Mapped[str] = mapped_column(String(36), ForeignKey("players.id"), index=True)
    order_index: Mapped[int] = mapped_column(Integer)

    tournament: Mapped[Tournament] = relationship(back_populates="participants")
    player: Mapped[Player] = relationship(back_populates="tournament_memberships")


class Round(Base):
    __tablename__ = "rounds"
    __table_args__ = (UniqueConstraint("tournament_id", "number", name="uq_tournament_round"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tournament_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournaments.id"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    status: Mapped[RoundStatus] = mapped_column(Enum(RoundStatus), default=RoundStatus.PENDING)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tournament: Mapped[Tournament] = relationship(back_populates="rounds")
    matches: Mapped[list[Match]] = relationship(
        back_populates="round",
        cascade="all, delete-orphan",
        order_by="Match.court_number",
    )


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tournament_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournaments.id"), index=True)
    round_id: Mapped[str] = mapped_column(String(36), ForeignKey("rounds.id"), index=True)
    court_number: Mapped[int] = mapped_column(Integer)
    team_a_player_1_id: Mapped[str] = mapped_column(String(36), ForeignKey("players.id"))
    team_a_player_2_id: Mapped[str] = mapped_column(String(36), ForeignKey("players.id"))
    team_b_player_1_id: Mapped[str] = mapped_column(String(36), ForeignKey("players.id"))
    team_b_player_2_id: Mapped[str] = mapped_column(String(36), ForeignKey("players.id"))
    team_a_games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    team_b_games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    last_updated_by_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    tournament: Mapped[Tournament] = relationship(back_populates="matches")
    round: Mapped[Round] = relationship(back_populates="matches")
    audit_logs: Mapped[list[ScoreAuditLog]] = relationship(back_populates="match", cascade="all, delete-orphan")


class StandingsSnapshot(Base):
    __tablename__ = "standings_snapshots"
    __table_args__ = (UniqueConstraint("tournament_id", "round_number", name="uq_tournament_snapshot_round"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tournament_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournaments.id"), index=True)
    round_number: Mapped[int] = mapped_column(Integer)
    standings_json: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ScoreAuditLog(Base):
    __tablename__ = "score_audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    match_id: Mapped[str] = mapped_column(String(36), ForeignKey("matches.id"), index=True)
    changed_by_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    previous_team_a_games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_team_b_games: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_team_a_games: Mapped[int] = mapped_column(Integer)
    new_team_b_games: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    match: Mapped[Match] = relationship(back_populates="audit_logs")
