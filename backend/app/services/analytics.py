from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Match, Player, Round, StandingsSnapshot, Tournament, TournamentParticipant
from app.services.leaderboards import _player_base_row, _sorted_rows, compute_global_leaderboard, compute_tournament_standings
from app.services.player_media import build_avatar_url

DEFAULT_ELO_RATING = 1000.0
ELO_K_FACTOR = 24.0


def _coerce_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _player_identity(player: Player) -> dict:
    return {
        "player_id": player.id,
        "display_name": player.display_name,
        "avatar_url": build_avatar_url(player),
    }


def _match_sort_key(match: Match) -> tuple[datetime, int, int]:
    tournament_moment = _coerce_utc(match.tournament.started_at or match.tournament.created_at) or datetime.now(UTC)
    return (
        tournament_moment,
        match.round.number if match.round is not None else 0,
        match.court_number,
    )


def _load_scored_matches(db: Session) -> list[Match]:
    matches = (
        db.execute(
            select(Match)
            .where(Match.team_a_games.is_not(None), Match.team_b_games.is_not(None))
            .options(
                selectinload(Match.tournament),
                selectinload(Match.round),
            )
        )
        .scalars()
        .all()
    )
    return sorted(matches, key=_match_sort_key)


def _load_players(db: Session) -> list[Player]:
    return db.execute(select(Player).order_by(Player.display_name)).scalars().all()


def compute_elo_leaderboard(db: Session) -> list[dict]:
    players = _load_players(db)
    ratings: dict[str, dict] = {
        player.id: {
            **_player_identity(player),
            "rating": DEFAULT_ELO_RATING,
            "matches_played": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0,
        }
        for player in players
    }

    for match in _load_scored_matches(db):
        team_a_ids = [match.team_a_player_1_id, match.team_a_player_2_id]
        team_b_ids = [match.team_b_player_1_id, match.team_b_player_2_id]
        average_a = mean(ratings[player_id]["rating"] for player_id in team_a_ids)
        average_b = mean(ratings[player_id]["rating"] for player_id in team_b_ids)
        expected_a = 1.0 / (1.0 + 10 ** ((average_b - average_a) / 400.0))

        if match.team_a_games > match.team_b_games:
            actual_a = 1.0
        elif match.team_a_games < match.team_b_games:
            actual_a = 0.0
        else:
            actual_a = 0.5

        margin_factor = 1.0 + min(abs(match.team_a_games - match.team_b_games), 10) / 20.0
        delta = ELO_K_FACTOR * margin_factor * (actual_a - expected_a)

        for player_id in team_a_ids:
            ratings[player_id]["rating"] += delta
            ratings[player_id]["matches_played"] += 1
            if actual_a == 1.0:
                ratings[player_id]["wins"] += 1
            elif actual_a == 0.0:
                ratings[player_id]["losses"] += 1
            else:
                ratings[player_id]["draws"] += 1

        for player_id in team_b_ids:
            ratings[player_id]["rating"] -= delta
            ratings[player_id]["matches_played"] += 1
            if actual_a == 1.0:
                ratings[player_id]["losses"] += 1
            elif actual_a == 0.0:
                ratings[player_id]["wins"] += 1
            else:
                ratings[player_id]["draws"] += 1

    ordered = sorted(
        ratings.values(),
        key=lambda item: (-item["rating"], -item["wins"], item["display_name"].lower()),
    )
    for rank, row in enumerate(ordered, start=1):
        row["rank"] = rank
        row["rating"] = int(round(row["rating"]))
    return ordered


def _record_from_bucket(bucket: dict) -> dict:
    matches = bucket["matches"]
    win_rate = round((bucket["wins"] / matches) * 100, 1) if matches else 0.0
    return {
        "player_id": bucket["player_id"],
        "display_name": bucket["display_name"],
        "avatar_url": bucket["avatar_url"],
        "matches": matches,
        "wins": bucket["wins"],
        "losses": bucket["losses"],
        "draws": bucket["draws"],
        "points_for": bucket["points_for"],
        "points_against": bucket["points_against"],
        "game_diff": bucket["points_for"] - bucket["points_against"],
        "win_rate": win_rate,
    }


def _streaks_from_results(results: list[str]) -> dict:
    current_win_streak = 0
    for result in reversed(results):
        if result != "W":
            break
        current_win_streak += 1

    current_unbeaten_streak = 0
    for result in reversed(results):
        if result == "L":
            break
        current_unbeaten_streak += 1

    best_win_streak = 0
    running_win_streak = 0
    for result in results:
        if result == "W":
            running_win_streak += 1
            best_win_streak = max(best_win_streak, running_win_streak)
        else:
            running_win_streak = 0

    return {
        "current_win_streak": current_win_streak,
        "current_unbeaten_streak": current_unbeaten_streak,
        "best_win_streak": best_win_streak,
    }


def _collect_player_match_insights(db: Session, player_id: str) -> dict:
    players = {player.id: player for player in _load_players(db)}
    matches = _load_scored_matches(db)
    match_results: list[str] = []
    partner_buckets: dict[str, dict] = {}
    opponent_buckets: dict[str, dict] = {}
    finals_won = 0

    for match in matches:
        team_a_ids = [match.team_a_player_1_id, match.team_a_player_2_id]
        team_b_ids = [match.team_b_player_1_id, match.team_b_player_2_id]
        if player_id not in team_a_ids and player_id not in team_b_ids:
            continue

        if player_id in team_a_ids:
            teammate_id = team_a_ids[0] if team_a_ids[1] == player_id else team_a_ids[1]
            opponent_ids = team_b_ids
            points_for = match.team_a_games
            points_against = match.team_b_games
        else:
            teammate_id = team_b_ids[0] if team_b_ids[1] == player_id else team_b_ids[1]
            opponent_ids = team_a_ids
            points_for = match.team_b_games
            points_against = match.team_a_games

        if points_for > points_against:
            result = "W"
        elif points_for < points_against:
            result = "L"
        else:
            result = "D"
        match_results.append(result)

        teammate_bucket = partner_buckets.setdefault(
            teammate_id,
            {
                **_player_identity(players[teammate_id]),
                "matches": 0,
                "wins": 0,
                "losses": 0,
                "draws": 0,
                "points_for": 0,
                "points_against": 0,
            },
        )
        teammate_bucket["matches"] += 1
        teammate_bucket["points_for"] += points_for
        teammate_bucket["points_against"] += points_against
        if result == "W":
            teammate_bucket["wins"] += 1
        elif result == "L":
            teammate_bucket["losses"] += 1
        else:
            teammate_bucket["draws"] += 1

        for opponent_id in opponent_ids:
            opponent_bucket = opponent_buckets.setdefault(
                opponent_id,
                {
                    **_player_identity(players[opponent_id]),
                    "matches": 0,
                    "wins": 0,
                    "losses": 0,
                    "draws": 0,
                    "points_for": 0,
                    "points_against": 0,
                },
            )
            opponent_bucket["matches"] += 1
            opponent_bucket["points_for"] += points_for
            opponent_bucket["points_against"] += points_against
            if result == "W":
                opponent_bucket["wins"] += 1
            elif result == "L":
                opponent_bucket["losses"] += 1
            else:
                opponent_bucket["draws"] += 1

        if (
            result == "W"
            and match.round is not None
            and (match.round.metadata_json or {}).get("strategy") == "bracket"
            and (match.round.metadata_json or {}).get("bracket_stage") in {"Final", "Finals"}
        ):
            finals_won += 1

    partners = [_record_from_bucket(bucket) for bucket in partner_buckets.values()]
    opponents = [_record_from_bucket(bucket) for bucket in opponent_buckets.values()]

    best_partner = next(
        iter(
            sorted(
                partners,
                key=lambda item: (-item["win_rate"], -item["matches"], -item["game_diff"], item["display_name"].lower()),
            )
        ),
        None,
    )
    hardest_opponent = next(
        iter(
            sorted(
                opponents,
                key=lambda item: (item["win_rate"], -item["matches"], item["game_diff"], item["display_name"].lower()),
            )
        ),
        None,
    )
    favorite_opponent = next(
        iter(
            sorted(
                opponents,
                key=lambda item: (-item["win_rate"], -item["matches"], -item["game_diff"], item["display_name"].lower()),
            )
        ),
        None,
    )

    return {
        "best_partner": best_partner,
        "hardest_opponent": hardest_opponent,
        "favorite_opponent": favorite_opponent,
        "partners": partners,
        "opponents": opponents,
        "streaks": _streaks_from_results(match_results),
        "finals_won": finals_won,
    }


def _find_comeback_podium(db: Session, player_id: str, history: list[dict]) -> bool:
    podium_tournament_ids = [item["tournament_id"] for item in history if item["placement"] is not None and item["placement"] <= 3]
    if not podium_tournament_ids:
        return False

    snapshots = (
        db.execute(
            select(StandingsSnapshot)
            .where(StandingsSnapshot.tournament_id.in_(podium_tournament_ids))
            .order_by(StandingsSnapshot.round_number)
        )
        .scalars()
        .all()
    )

    by_tournament: dict[str, list[StandingsSnapshot]] = defaultdict(list)
    for snapshot in snapshots:
        by_tournament[snapshot.tournament_id].append(snapshot)

    for tournament_id in podium_tournament_ids:
        tournament_snapshots = by_tournament.get(tournament_id, [])
        if len(tournament_snapshots) < 2:
            continue
        halfway_snapshot = tournament_snapshots[max(0, (len(tournament_snapshots) // 2) - 1)]
        halfway_row = next((row for row in halfway_snapshot.standings_json if row["player_id"] == player_id), None)
        if halfway_row and halfway_row.get("rank", 99) > 3:
            return True

    return False


def _build_achievements(
    *,
    global_row: dict,
    history: list[dict],
    streaks: dict,
    finals_won: int,
    comeback_podium: bool,
) -> list[dict]:
    tournaments_played = global_row.get("tournaments_played", len(history))
    champion_count = sum(1 for item in history if item["placement"] == 1)
    podium_count = sum(1 for item in history if item["placement"] is not None and item["placement"] <= 3)
    undefeated_night = any(
        item["placement"] == 1 and item["losses"] == 0
        for item in history
        if item.get("completed_at") is not None
    )

    definitions = [
        ("welcome-board", "First night", "Joined the tournament board.", "\U0001F3BE", tournaments_played >= 1),
        ("first-win", "First win", "Picked up the first recorded win.", "\U0001F525", global_row["wins"] >= 1),
        ("champion-night", "Champion's night", "Finished first in a tournament.", "\U0001F3C6", champion_count >= 1),
        ("podium-regular", "Podium regular", "Reached the podium five times.", "\U0001F947", podium_count >= 5),
        ("ten-tournaments", "Ten tournaments", "Played ten tournaments.", "\U0001F4C5", tournaments_played >= 10),
        ("marathon-player", "Marathon player", "Played twenty-five tournaments.", "\U0001F680", tournaments_played >= 25),
        ("centurion", "Centurion", "Crossed one hundred all-time points.", "\U0001F4AF", global_row["points"] >= 100),
        ("match-machine", "Match machine", "Played fifty recorded matches.", "\U0001F6E0", global_row["matches_played"] >= 50),
        ("hot-hand", "Hot hand", "Won five matches in a row.", "\U0001F525", streaks["best_win_streak"] >= 5),
        ("undefeated-night", "Undefeated night", "Won a tournament without losing a match.", "\u2728", undefeated_night),
        ("comeback-king", "Comeback king", "Climbed from outside the top three to a podium finish.", "\U0001F451", comeback_podium),
        ("clutch-closer", "Clutch closer", "Won a bracket final.", "\U0001F9E0", finals_won >= 1),
    ]

    return [
        {
            "slug": slug,
            "title": title,
            "description": description,
            "icon": icon,
        }
        for slug, title, description, icon, unlocked in definitions
        if unlocked
    ]


def build_player_stats(db: Session, player_id: str) -> dict:
    player = db.get(Player, player_id)
    if player is None:
        raise ValueError("Player not found.")

    standings_rows = compute_global_leaderboard(db)
    global_row = next((row for row in standings_rows if row["player_id"] == player_id), _player_base_row(player))
    elo_rows = compute_elo_leaderboard(db)
    elo_row = next((row for row in elo_rows if row["player_id"] == player_id), None)

    participations = (
        db.execute(
            select(TournamentParticipant)
            .where(TournamentParticipant.player_id == player_id)
            .options(selectinload(TournamentParticipant.tournament))
        )
        .scalars()
        .all()
    )

    history: list[dict] = []
    for participation in participations:
        tournament = participation.tournament
        standings = compute_tournament_standings(db, tournament.id)
        player_row = next((row for row in standings if row["player_id"] == player_id), None)
        history.append(
            {
                "tournament_id": tournament.id,
                "tournament_name": tournament.name,
                "format": tournament.format.value,
                "status": tournament.status.value,
                "created_at": _coerce_utc(tournament.created_at),
                "started_at": _coerce_utc(tournament.started_at),
                "completed_at": _coerce_utc(tournament.completed_at),
                "placement": player_row["rank"] if player_row else None,
                "points": player_row["points"] if player_row else 0,
                "wins": player_row["wins"] if player_row else 0,
                "losses": player_row["losses"] if player_row else 0,
                "game_diff": player_row["game_diff"] if player_row else 0,
            }
        )

    history.sort(
        key=lambda item: item["started_at"] or item["created_at"] or datetime.now(UTC),
        reverse=True,
    )

    insights = _collect_player_match_insights(db, player_id)
    trophies = {
        "champion": sum(1 for item in history if item["placement"] == 1),
        "runner_up": sum(1 for item in history if item["placement"] == 2),
        "third_place": sum(1 for item in history if item["placement"] == 3),
    }
    trophies["podiums"] = trophies["champion"] + trophies["runner_up"] + trophies["third_place"]
    comeback_podium = _find_comeback_podium(db, player_id, history)

    return {
        "player_id": player.id,
        "display_name": player.display_name,
        "avatar_url": build_avatar_url(player),
        "stats": global_row,
        "elo_rating": elo_row["rating"] if elo_row else int(DEFAULT_ELO_RATING),
        "chemistry": {
            "best_partner": insights["best_partner"],
            "hardest_opponent": insights["hardest_opponent"],
            "favorite_opponent": insights["favorite_opponent"],
        },
        "streaks": insights["streaks"],
        "trophies": trophies,
        "achievements": _build_achievements(
            global_row=global_row,
            history=history,
            streaks=insights["streaks"],
            finals_won=insights["finals_won"],
            comeback_podium=comeback_podium,
        ),
        "history": history[:12],
    }


def build_head_to_head(db: Session, player_a_id: str, player_b_id: str) -> dict:
    if player_a_id == player_b_id:
        raise ValueError("Choose two different players.")

    player_a = db.get(Player, player_a_id)
    player_b = db.get(Player, player_b_id)
    if player_a is None or player_b is None:
        raise ValueError("One or both players were not found.")

    against = {
        "matches": 0,
        "player_a_wins": 0,
        "player_b_wins": 0,
        "draws": 0,
        "player_a_points": 0,
        "player_b_points": 0,
    }
    together = {
        "matches": 0,
        "wins": 0,
        "losses": 0,
        "draws": 0,
    }
    recent: list[dict] = []

    for match in reversed(_load_scored_matches(db)):
        team_a_ids = {match.team_a_player_1_id, match.team_a_player_2_id}
        team_b_ids = {match.team_b_player_1_id, match.team_b_player_2_id}

        if {player_a_id, player_b_id}.issubset(team_a_ids) or {player_a_id, player_b_id}.issubset(team_b_ids):
            together["matches"] += 1
            if match.team_a_games == match.team_b_games:
                together["draws"] += 1
            else:
                a_team_won = match.team_a_games > match.team_b_games if player_a_id in team_a_ids else match.team_b_games > match.team_a_games
                if a_team_won:
                    together["wins"] += 1
                else:
                    together["losses"] += 1
            continue

        opposite_sides = (player_a_id in team_a_ids and player_b_id in team_b_ids) or (
            player_a_id in team_b_ids and player_b_id in team_a_ids
        )
        if not opposite_sides:
            continue

        against["matches"] += 1
        if player_a_id in team_a_ids:
            player_a_points = match.team_a_games
            player_b_points = match.team_b_games
        else:
            player_a_points = match.team_b_games
            player_b_points = match.team_a_games

        against["player_a_points"] += player_a_points
        against["player_b_points"] += player_b_points
        if player_a_points > player_b_points:
            against["player_a_wins"] += 1
            result = f"{player_a.display_name} won"
        elif player_a_points < player_b_points:
            against["player_b_wins"] += 1
            result = f"{player_b.display_name} won"
        else:
            against["draws"] += 1
            result = "Draw"

        if len(recent) < 8:
            recent.append(
                {
                    "match_id": match.id,
                    "tournament_id": match.tournament_id,
                    "tournament_name": match.tournament.name,
                    "played_at": _coerce_utc(match.updated_at or match.tournament.started_at or match.tournament.created_at),
                    "player_a_points": player_a_points,
                    "player_b_points": player_b_points,
                    "result": result,
                }
            )

    return {
        "player_a": _player_identity(player_a),
        "player_b": _player_identity(player_b),
        "against": against,
        "together": together,
        "recent_meetings": recent,
    }
