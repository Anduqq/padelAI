from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Match, Player, Tournament, TournamentParticipant


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _player_base_row(player: Player) -> dict:
    return {
        "player_id": player.id,
        "display_name": player.display_name,
        "points": 0,
        "games_for": 0,
        "games_against": 0,
        "game_diff": 0,
        "matches_played": 0,
        "wins": 0,
        "losses": 0,
        "draws": 0,
    }


def _apply_match_result(row: dict, games_for: int, games_against: int) -> None:
    row["points"] += games_for
    row["games_for"] += games_for
    row["games_against"] += games_against
    row["game_diff"] += games_for - games_against
    row["matches_played"] += 1

    if games_for > games_against:
        row["wins"] += 1
    elif games_for < games_against:
        row["losses"] += 1
    else:
        row["draws"] += 1


def _sorted_rows(rows: list[dict]) -> list[dict]:
    ordered = sorted(
        rows,
        key=lambda item: (
            -item["points"],
            -item["game_diff"],
            -item["wins"],
            item["display_name"].lower(),
        ),
    )
    for rank, row in enumerate(ordered, start=1):
        row["rank"] = rank
    return ordered


def compute_tournament_standings(db: Session, tournament_id: str) -> list[dict]:
    participants = (
        db.execute(
            select(TournamentParticipant)
            .where(TournamentParticipant.tournament_id == tournament_id)
            .options(selectinload(TournamentParticipant.player))
            .order_by(TournamentParticipant.order_index)
        )
        .scalars()
        .all()
    )
    rows = {participant.player_id: _player_base_row(participant.player) for participant in participants}

    matches = db.execute(select(Match).where(Match.tournament_id == tournament_id)).scalars().all()
    for match in matches:
        if match.team_a_games is None or match.team_b_games is None:
            continue

        for player_id in (match.team_a_player_1_id, match.team_a_player_2_id):
            _apply_match_result(rows[player_id], match.team_a_games, match.team_b_games)

        for player_id in (match.team_b_player_1_id, match.team_b_player_2_id):
            _apply_match_result(rows[player_id], match.team_b_games, match.team_a_games)

    return _sorted_rows(list(rows.values()))


def compute_global_leaderboard(db: Session) -> list[dict]:
    players = db.execute(select(Player).order_by(Player.display_name)).scalars().all()
    rows = {player.id: _player_base_row(player) for player in players}

    matches = db.execute(select(Match)).scalars().all()
    for match in matches:
        if match.team_a_games is None or match.team_b_games is None:
            continue

        for player_id in (match.team_a_player_1_id, match.team_a_player_2_id):
            _apply_match_result(rows[player_id], match.team_a_games, match.team_b_games)

        for player_id in (match.team_b_player_1_id, match.team_b_player_2_id):
            _apply_match_result(rows[player_id], match.team_b_games, match.team_a_games)

    tournament_counts = defaultdict(int)
    for participant in db.execute(select(TournamentParticipant)).scalars().all():
        tournament_counts[participant.player_id] += 1

    for player_id, row in rows.items():
        row["tournaments_played"] = tournament_counts[player_id]

    return _sorted_rows(list(rows.values()))


def build_player_stats(db: Session, player_id: str) -> dict:
    player = db.get(Player, player_id)
    if player is None:
        raise ValueError("Player not found.")

    standings_rows = compute_global_leaderboard(db)
    global_row = next((row for row in standings_rows if row["player_id"] == player_id), _player_base_row(player))

    participations = (
        db.execute(
            select(TournamentParticipant)
            .where(TournamentParticipant.player_id == player_id)
            .options(selectinload(TournamentParticipant.tournament))
            .order_by(TournamentParticipant.order_index)
        )
        .scalars()
        .all()
    )

    history: list[dict] = []
    for participation in participations:
        tournament = participation.tournament
        standings = compute_tournament_standings(db, tournament.id)
        player_row = next((row for row in standings if row["player_id"] == player_id), None)
        created_at = _coerce_utc(tournament.created_at)
        started_at = _coerce_utc(tournament.started_at)
        completed_at = _coerce_utc(tournament.completed_at)
        history.append(
            {
                "tournament_id": tournament.id,
                "tournament_name": tournament.name,
                "format": tournament.format.value,
                "status": tournament.status.value,
                "created_at": created_at,
                "started_at": started_at,
                "completed_at": completed_at,
                "placement": player_row["rank"] if player_row else None,
                "points": player_row["points"] if player_row else 0,
            }
        )

    history.sort(
        key=lambda item: item["started_at"] or item["created_at"] or datetime.now(UTC),
        reverse=True,
    )

    return {
        "player_id": player.id,
        "display_name": player.display_name,
        "stats": global_row,
        "history": history[:12],
    }


def build_player_suggestions(db: Session, limit: int = 12) -> list[dict]:
    players = db.execute(select(Player).order_by(Player.display_name)).scalars().all()
    tournaments = {tournament.id: tournament for tournament in db.execute(select(Tournament)).scalars().all()}
    memberships = db.execute(select(TournamentParticipant)).scalars().all()

    by_player: dict[str, dict] = {
        player.id: {
            "player_id": player.id,
            "display_name": player.display_name,
            "frequency": 0,
            "last_played_at": None,
            "suggestion_score": 0.0,
        }
        for player in players
    }

    now = datetime.now(UTC)
    for membership in memberships:
        row = by_player[membership.player_id]
        tournament = tournaments[membership.tournament_id]
        played_at = _coerce_utc(tournament.started_at or tournament.created_at)
        row["frequency"] += 1
        if row["last_played_at"] is None or (played_at and played_at > row["last_played_at"]):
            row["last_played_at"] = played_at

    suggestions: list[dict] = []
    for row in by_player.values():
        if row["frequency"] == 0:
            continue
        days_since_played = (
            (now - row["last_played_at"]).days
            if row["last_played_at"] is not None
            else 365
        )
        recency_score = max(0.0, 30 - float(days_since_played)) / 30
        row["suggestion_score"] = round((row["frequency"] * 2) + recency_score, 2)
        suggestions.append(row)

    suggestions.sort(
        key=lambda item: (
            -item["suggestion_score"],
            -item["frequency"],
            item["display_name"].lower(),
        )
    )
    return suggestions[:limit]
