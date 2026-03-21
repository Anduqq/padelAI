from __future__ import annotations

from datetime import UTC, datetime
import random
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import (
    Match,
    Player,
    Round,
    RoundStatus,
    ScoreAuditLog,
    StandingsSnapshot,
    Tournament,
    TournamentFormat,
    TournamentParticipant,
    TournamentStatus,
    User,
)
from app.schemas.requests import ScoreUpdateRequest, TournamentCreateRequest
from app.services.leaderboards import compute_tournament_standings
from app.services.round_generation import (
    RoundSpec,
    generate_americano_schedule,
    generate_mexicano_round,
    get_schedule_capacity,
)
from app.services.scoring import resolve_tournament_scoring, validate_match_score
from app.ws.manager import manager

router = APIRouter()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _randomize_player_ids(player_ids: list[str]) -> list[str]:
    randomized = list(player_ids)
    random.SystemRandom().shuffle(randomized)
    return randomized


def _serialize_participant(participant: TournamentParticipant) -> dict:
    return {
        "player_id": participant.player.id,
        "display_name": participant.player.display_name,
        "order_index": participant.order_index,
    }


def _serialize_tournament_summary(tournament: Tournament) -> dict:
    return {
        "id": tournament.id,
        "name": tournament.name,
        "format": tournament.format.value,
        "status": tournament.status.value,
        "court_count": tournament.court_count,
        "target_rounds": tournament.target_rounds,
        "scoring_system": tournament.scoring_system,
        "americano_points_target": tournament.americano_points_target,
        "participant_count": len(tournament.participants),
        "created_at": tournament.created_at,
        "started_at": tournament.started_at,
        "completed_at": tournament.completed_at,
    }


def _serialize_match(match: Match, player_map: dict[str, Player]) -> dict:
    return {
        "id": match.id,
        "court_number": match.court_number,
        "version": match.version,
        "team_a_games": match.team_a_games,
        "team_b_games": match.team_b_games,
        "updated_at": match.updated_at,
        "team_a": [
            {
                "player_id": match.team_a_player_1_id,
                "display_name": player_map[match.team_a_player_1_id].display_name,
            },
            {
                "player_id": match.team_a_player_2_id,
                "display_name": player_map[match.team_a_player_2_id].display_name,
            },
        ],
        "team_b": [
            {
                "player_id": match.team_b_player_1_id,
                "display_name": player_map[match.team_b_player_1_id].display_name,
            },
            {
                "player_id": match.team_b_player_2_id,
                "display_name": player_map[match.team_b_player_2_id].display_name,
            },
        ],
    }


def _serialize_round(round_row: Round, player_map: dict[str, Player], can_unlock: bool) -> dict:
    metadata = dict(round_row.metadata_json or {})
    bench_player_ids = [player_id for player_id in metadata.get("bench_player_ids", []) if player_id in player_map]
    if metadata:
        metadata["bench_players"] = [
            {"player_id": player_id, "display_name": player_map[player_id].display_name}
            for player_id in bench_player_ids
        ]

    return {
        "id": round_row.id,
        "number": round_row.number,
        "status": round_row.status.value,
        "metadata": metadata or None,
        "started_at": round_row.started_at,
        "completed_at": round_row.completed_at,
        "can_unlock": can_unlock,
        "matches": [_serialize_match(match, player_map) for match in round_row.matches],
    }


def _load_tournament(db: Session, tournament_id: str) -> Tournament | None:
    return (
        db.execute(
            select(Tournament)
            .where(Tournament.id == tournament_id)
            .options(
                selectinload(Tournament.participants).selectinload(TournamentParticipant.player),
                selectinload(Tournament.rounds).selectinload(Round.matches),
            )
        )
        .scalars()
        .first()
    )


def _build_player_map(tournament: Tournament) -> dict[str, Player]:
    return {participant.player.id: participant.player for participant in tournament.participants}


def _round_has_scores(round_row: Round) -> bool:
    return any(match.team_a_games is not None or match.team_b_games is not None for match in round_row.matches)


def _can_unlock_round(tournament: Tournament, round_row: Round) -> bool:
    return round_row.status == RoundStatus.COMPLETED


def _clear_match_state(match: Match) -> None:
    match.team_a_games = None
    match.team_b_games = None
    match.version += 1
    match.last_updated_by_user_id = None
    match.updated_at = None


def _rotation_rounds(tournament: Tournament) -> list[Round]:
    return [
        round_row
        for round_row in tournament.rounds
        if (round_row.metadata_json or {}).get("strategy") == "americano"
        and (round_row.metadata_json or {}).get("type") in {"pre_generated", "rotation_extension"}
    ]


def _build_rotation_order(tournament: Tournament) -> list[str]:
    americano_round = next(
        (
            round_row
            for round_row in tournament.rounds
            if (round_row.metadata_json or {}).get("strategy") == "americano"
            and (round_row.metadata_json or {}).get("rotation_order")
        ),
        None,
    )
    if americano_round is not None:
        return list(americano_round.metadata_json.get("rotation_order", []))

    return [participant.player_id for participant in tournament.participants]


def _build_seeded_bracket_teams(leaderboard: list[dict]) -> tuple[list[dict], list[str]]:
    bracket_player_count = len(leaderboard) - (len(leaderboard) % 4)
    if bracket_player_count < 4:
        raise HTTPException(status_code=400, detail="At least 4 ranked players are needed to build brackets.")

    active_rows = leaderboard[:bracket_player_count]
    excluded_player_ids = [row["player_id"] for row in leaderboard[bracket_player_count:]]
    teams: list[dict] = []

    for block_start in range(0, bracket_player_count, 4):
        block = active_rows[block_start : block_start + 4]
        teams.append(
            {
                "player_ids": [block[0]["player_id"], block[2]["player_id"]],
                "label": f"#{block_start + 1} + #{block_start + 3}",
                "seed_positions": [block_start + 1, block_start + 3],
            }
        )
        teams.append(
            {
                "player_ids": [block[1]["player_id"], block[3]["player_id"]],
                "label": f"#{block_start + 2} + #{block_start + 4}",
                "seed_positions": [block_start + 2, block_start + 4],
            }
        )

    return teams, excluded_player_ids


def _pair_bracket_teams(teams: list[dict]) -> tuple[list[tuple[dict, dict]], dict | None]:
    if not teams:
        return [], None

    carryover_team = teams[0] if len(teams) % 2 == 1 else None
    start_index = 1 if carryover_team is not None else 0
    matches = [(teams[index], teams[index + 1]) for index in range(start_index, len(teams), 2)]
    return matches, carryover_team


def _label_bracket_stage(team_count: int, *, has_bronze_match: bool = False) -> str:
    if has_bronze_match:
        return "Finals"
    if team_count <= 2:
        return "Final"
    if team_count == 4:
        return "Semifinals"
    if team_count == 8:
        return "Quarterfinals"
    return f"Bracket round ({team_count} teams)"


def _materialize_bracket_round(
    db: Session,
    tournament: Tournament,
    *,
    teams: list[dict],
    round_index: int,
    stage_label: str,
    carryover_team: dict | None = None,
    excluded_player_ids: list[str] | None = None,
) -> Round:
    matches_to_build, carryover = _pair_bracket_teams(teams)
    if not matches_to_build:
        raise HTTPException(status_code=400, detail="Not enough teams are available for the next bracket stage.")

    round_row = Round(
        tournament=tournament,
        number=len(tournament.rounds) + 1,
        status=RoundStatus.ACTIVE,
        metadata_json={
            "strategy": "bracket",
            "type": "knockout",
            "bracket_round_index": round_index,
            "bracket_stage": stage_label,
            "team_slots": [
                {
                    "court_number": court_number,
                    "team_a": team_a,
                    "team_b": team_b,
                }
                for court_number, (team_a, team_b) in enumerate(matches_to_build, start=1)
            ],
            "carryover_team": carryover_team if carryover_team is not None else carryover,
            "excluded_player_ids": excluded_player_ids or [],
        },
        started_at=_utc_now(),
    )
    db.add(round_row)
    db.flush()

    for court_number, (team_a, team_b) in enumerate(matches_to_build, start=1):
        db.add(
            Match(
                tournament=tournament,
                round=round_row,
                court_number=court_number,
                team_a_player_1_id=team_a["player_ids"][0],
                team_a_player_2_id=team_a["player_ids"][1],
                team_b_player_1_id=team_b["player_ids"][0],
                team_b_player_2_id=team_b["player_ids"][1],
            )
        )

    if tournament.target_rounds is None or tournament.target_rounds < round_row.number:
        tournament.target_rounds = round_row.number

    return round_row


def _build_team_from_slot(slot: dict, side: str) -> dict:
    return dict(slot.get(side, {}))


def _team_won(match: Match, side: str) -> bool:
    if match.team_a_games is None or match.team_b_games is None:
        raise HTTPException(status_code=400, detail="Bracket results are incomplete.")

    if match.team_a_games == match.team_b_games:
        raise HTTPException(status_code=400, detail="Bracket matches cannot finish level.")

    return match.team_a_games > match.team_b_games if side == "team_a" else match.team_b_games > match.team_a_games


def _build_next_bracket_stage(last_round: Round) -> tuple[list[dict], list[dict], dict | None]:
    metadata = dict(last_round.metadata_json or {})
    slots = list(metadata.get("team_slots", []))
    slot_map = {slot.get("court_number"): slot for slot in slots}

    winners: list[dict] = []
    losers: list[dict] = []
    for match in sorted(last_round.matches, key=lambda item: item.court_number):
        slot = slot_map.get(match.court_number, {})
        winning_side = "team_a" if _team_won(match, "team_a") else "team_b"
        losing_side = "team_b" if winning_side == "team_a" else "team_a"
        winners.append(_build_team_from_slot(slot, winning_side))
        losers.append(_build_team_from_slot(slot, losing_side))

    return winners, losers, metadata.get("carryover_team")


def _bracket_rounds(tournament: Tournament) -> list[Round]:
    return [round_row for round_row in tournament.rounds if (round_row.metadata_json or {}).get("strategy") == "bracket"]


def _can_continue_bracket(tournament: Tournament) -> bool:
    if tournament.status != TournamentStatus.ACTIVE:
        return False

    bracket_rounds = _bracket_rounds(tournament)
    if not bracket_rounds:
        return False

    if any(round_row.status == RoundStatus.ACTIVE for round_row in bracket_rounds):
        return False

    last_round = bracket_rounds[-1]
    return last_round.status == RoundStatus.COMPLETED and (last_round.metadata_json or {}).get("bracket_stage") not in {
        "Final",
        "Finals",
    }


def _build_bracket_graph(tournament: Tournament) -> list[dict] | None:
    bracket_rounds = _bracket_rounds(tournament)
    if not bracket_rounds:
        return None

    graph: list[dict] = []
    for round_row in bracket_rounds:
        metadata = dict(round_row.metadata_json or {})
        slot_map = {slot.get("court_number"): slot for slot in metadata.get("team_slots", [])}
        matches: list[dict] = []
        for match in sorted(round_row.matches, key=lambda item: item.court_number):
            slot = slot_map.get(match.court_number, {})
            matches.append(
                {
                    "court_number": match.court_number,
                    "team_a_label": slot.get("team_a", {}).get("label", "Team A"),
                    "team_b_label": slot.get("team_b", {}).get("label", "Team B"),
                    "team_a_score": match.team_a_games,
                    "team_b_score": match.team_b_games,
                }
            )

        graph.append(
            {
                "round_id": round_row.id,
                "title": metadata.get("bracket_stage", f"Bracket round {len(graph) + 1}"),
                "matches": matches,
            }
        )

    return graph


def _serialize_tournament_detail(db: Session, tournament: Tournament) -> dict:
    player_map = _build_player_map(tournament)
    active_round = next((round_row for round_row in tournament.rounds if round_row.status == RoundStatus.ACTIVE), None)
    leaderboard = compute_tournament_standings(db, tournament.id)
    latest_snapshot = (
        db.execute(
            select(StandingsSnapshot)
            .where(StandingsSnapshot.tournament_id == tournament.id)
            .order_by(StandingsSnapshot.round_number.desc())
        )
        .scalars()
        .first()
    )
    rounds_generated = len(tournament.rounds)
    waiting_for_next_round = (
        tournament.format == TournamentFormat.MEXICANO
        and tournament.status == TournamentStatus.ACTIVE
        and active_round is None
        and rounds_generated < (tournament.target_rounds or 0)
        and rounds_generated > 0
    )

    unlockable_round_ids = {
        round_row.id for round_row in tournament.rounds if _can_unlock_round(tournament, round_row)
    }
    has_bracket_rounds = any((round_row.metadata_json or {}).get("strategy") == "bracket" for round_row in tournament.rounds)
    can_continue_americano = (
        tournament.format == TournamentFormat.AMERICANO
        and tournament.status == TournamentStatus.ACTIVE
        and active_round is None
        and not has_bracket_rounds
    )
    can_start_bracket = (
        tournament.status == TournamentStatus.ACTIVE
        and active_round is None
        and not has_bracket_rounds
        and len(leaderboard) >= 4
    )

    return {
        **_serialize_tournament_summary(tournament),
        "participants": [_serialize_participant(participant) for participant in tournament.participants],
        "rounds": [
            _serialize_round(round_row, player_map, round_row.id in unlockable_round_ids)
            for round_row in tournament.rounds
        ],
        "leaderboard": leaderboard,
        "last_snapshot": latest_snapshot.standings_json if latest_snapshot else None,
        "can_generate_next_round": waiting_for_next_round,
        "can_continue_americano": can_continue_americano,
        "can_start_bracket": can_start_bracket,
        "can_continue_bracket": _can_continue_bracket(tournament),
        "bracket_graph": _build_bracket_graph(tournament),
    }


def _materialize_round(db: Session, tournament: Tournament, round_spec, status_value: RoundStatus) -> Round:
    round_row = Round(
        tournament=tournament,
        number=round_spec.number,
        status=status_value,
        metadata_json=round_spec.metadata,
        started_at=_utc_now() if status_value == RoundStatus.ACTIVE else None,
    )
    db.add(round_row)
    db.flush()

    for match_spec in round_spec.matches:
        db.add(
            Match(
                tournament=tournament,
                round=round_row,
                court_number=match_spec.court_number,
                team_a_player_1_id=match_spec.team_a[0],
                team_a_player_2_id=match_spec.team_a[1],
                team_b_player_1_id=match_spec.team_b[0],
                team_b_player_2_id=match_spec.team_b[1],
            )
        )

    return round_row


def _ensure_supported_participants(payload: TournamentCreateRequest, players: list[Player]):
    if len(players) != len(payload.participant_ids):
        raise HTTPException(status_code=404, detail="One or more players were not found.")

    try:
        capacity = get_schedule_capacity(payload.participant_ids, payload.court_count)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if payload.format == TournamentFormat.MEXICANO.value and payload.target_rounds is None:
        raise HTTPException(status_code=400, detail="Mexicano tournaments require target_rounds.")

    return capacity


def _unlock_round_state(db: Session, tournament: Tournament, round_row: Round) -> None:
    if not _can_unlock_round(tournament, round_row):
        raise HTTPException(
            status_code=400,
            detail="Only completed rounds can be unlocked.",
        )

    later_rounds = [item for item in tournament.rounds if item.number > round_row.number]
    if tournament.format == TournamentFormat.MEXICANO:
        for later_round in later_rounds:
            db.delete(later_round)
    else:
        for later_round in later_rounds:
            later_metadata = later_round.metadata_json or {}
            if later_metadata.get("strategy") != "americano" or later_metadata.get("type") not in {
                "pre_generated",
                "rotation_extension",
            }:
                db.delete(later_round)
                continue

            later_round.status = RoundStatus.PENDING
            later_round.started_at = None
            later_round.completed_at = None
            for match in later_round.matches:
                _clear_match_state(match)

    db.execute(
        delete(StandingsSnapshot).where(
            StandingsSnapshot.tournament_id == tournament.id,
            StandingsSnapshot.round_number >= round_row.number,
        )
    )

    round_row.status = RoundStatus.ACTIVE
    round_row.completed_at = None
    round_row.started_at = round_row.started_at or _utc_now()

    tournament.status = TournamentStatus.ACTIVE
    tournament.completed_at = None


def _persist_round_completion(db: Session, tournament: Tournament, round_row: Round) -> None:
    round_row.status = RoundStatus.COMPLETED
    round_row.completed_at = _utc_now()
    standings = compute_tournament_standings(db, tournament.id)
    db.add(StandingsSnapshot(tournament_id=tournament.id, round_number=round_row.number, standings_json=standings))

    if tournament.format == TournamentFormat.AMERICANO:
        next_round = next((item for item in tournament.rounds if item.status == RoundStatus.PENDING), None)
        if next_round is None:
            return
        next_round.status = RoundStatus.ACTIVE
        next_round.started_at = _utc_now()
        return

    if round_row.number >= (tournament.target_rounds or round_row.number):
        return


def _finish_tournament_state(db: Session, tournament: Tournament) -> None:
    tournament.status = TournamentStatus.COMPLETED
    tournament.completed_at = _utc_now()

    for round_row in list(tournament.rounds):
        if round_row.status == RoundStatus.PENDING:
            db.delete(round_row)
            continue

        if round_row.status == RoundStatus.ACTIVE:
            round_row.status = RoundStatus.COMPLETED
            round_row.completed_at = _utc_now()
            round_row.started_at = round_row.started_at or _utc_now()


def _create_top_four_final_round(db: Session, tournament: Tournament) -> Round:
    if tournament.status != TournamentStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Only active tournaments can schedule finals.")

    if any(round_row.status == RoundStatus.ACTIVE for round_row in tournament.rounds):
        raise HTTPException(status_code=400, detail="Finish the current round before creating a final.")

    if any((round_row.metadata_json or {}).get("type") == "top4_final" for round_row in tournament.rounds):
        raise HTTPException(status_code=400, detail="A top 4 final has already been created for this tournament.")

    leaderboard = compute_tournament_standings(db, tournament.id)
    ranked_player_ids = [row["player_id"] for row in leaderboard[:4]]
    if len(ranked_player_ids) < 4:
        raise HTTPException(status_code=400, detail="At least 4 ranked players are needed to create a top 4 final.")

    round_row = Round(
        tournament=tournament,
        number=len(tournament.rounds) + 1,
        status=RoundStatus.ACTIVE,
        metadata_json={
            "strategy": "finals",
            "type": "top4_final",
            "ranking_order": ranked_player_ids,
        },
        started_at=_utc_now(),
    )
    db.add(round_row)
    db.flush()

    db.add(
        Match(
            tournament=tournament,
            round=round_row,
            court_number=1,
            team_a_player_1_id=ranked_player_ids[0],
            team_a_player_2_id=ranked_player_ids[2],
            team_b_player_1_id=ranked_player_ids[1],
            team_b_player_2_id=ranked_player_ids[3],
        )
    )

    if tournament.target_rounds is None or tournament.target_rounds < round_row.number:
        tournament.target_rounds = round_row.number

    return round_row


def _delete_tournament_dependencies(db: Session, tournament_id: str) -> None:
    match_ids = db.execute(select(Match.id).where(Match.tournament_id == tournament_id)).scalars().all()
    if match_ids:
        db.execute(delete(ScoreAuditLog).where(ScoreAuditLog.match_id.in_(match_ids)))

    db.execute(delete(StandingsSnapshot).where(StandingsSnapshot.tournament_id == tournament_id))
    db.execute(delete(Match).where(Match.tournament_id == tournament_id))
    db.execute(delete(Round).where(Round.tournament_id == tournament_id))
    db.execute(delete(TournamentParticipant).where(TournamentParticipant.tournament_id == tournament_id))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tournament(
    payload: TournamentCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    players = db.execute(select(Player).where(Player.id.in_(payload.participant_ids))).scalars().all()
    capacity = _ensure_supported_participants(payload, players)
    try:
        scoring_config = resolve_tournament_scoring(
            tournament_format=payload.format,
            scoring_system=payload.scoring_system,
            americano_points_target=payload.americano_points_target,
            active_player_count=capacity.active_player_count,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    tournament = Tournament(
        name=payload.name.strip(),
        format=TournamentFormat(payload.format),
        court_count=capacity.active_courts,
        target_rounds=payload.target_rounds,
        scoring_system=scoring_config.scoring_system,
        americano_points_target=scoring_config.americano_points_target,
        created_by_user_id=current_user.id,
    )
    db.add(tournament)
    db.flush()

    for order_index, player_id in enumerate(payload.participant_ids):
        db.add(
            TournamentParticipant(
                tournament_id=tournament.id,
                player_id=player_id,
                order_index=order_index,
            )
        )

    db.commit()
    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be loaded.")
    return _serialize_tournament_detail(db, tournament)


@router.get("")
def list_tournaments(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    tournaments = (
        db.execute(
            select(Tournament)
            .options(selectinload(Tournament.participants))
            .order_by(Tournament.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_serialize_tournament_summary(tournament) for tournament in tournaments]


@router.get("/history/tournaments")
def completed_tournaments(
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict]:
    tournaments = (
        db.execute(
            select(Tournament)
            .where(Tournament.status == TournamentStatus.COMPLETED)
            .options(selectinload(Tournament.participants))
            .order_by(Tournament.completed_at.desc(), Tournament.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [_serialize_tournament_summary(tournament) for tournament in tournaments]


@router.get("/{tournament_id}")
def get_tournament(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    return _serialize_tournament_detail(db, tournament)


@router.delete("/{tournament_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tournament(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    tournament = db.get(Tournament, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    if tournament.status == TournamentStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Completed tournaments can only be viewed from the archive.")

    _delete_tournament_dependencies(db, tournament.id)
    db.delete(tournament)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{tournament_id}/start")
async def start_tournament(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    if tournament.status != TournamentStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Tournament has already started.")

    participant_ids = _randomize_player_ids([participant.player_id for participant in tournament.participants])
    tournament.status = TournamentStatus.ACTIVE
    tournament.started_at = _utc_now()

    if tournament.format == TournamentFormat.AMERICANO:
        round_specs = generate_americano_schedule(participant_ids, tournament.court_count)
        tournament.target_rounds = len(round_specs)
        for round_spec in round_specs:
            round_status = RoundStatus.ACTIVE if round_spec.number == 1 else RoundStatus.PENDING
            _materialize_round(db, tournament, round_spec, round_status)
    else:
        round_spec = generate_mexicano_round(
            participant_ids,
            tournament.court_count,
            round_number=1,
            previous_rounds_metadata=[],
        )
        _materialize_round(db, tournament, round_spec, RoundStatus.ACTIVE)

    db.commit()
    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be loaded after start.")

    await manager.broadcast(tournament.id, {"type": "tournament_started", "tournament_id": tournament.id})
    return _serialize_tournament_detail(db, tournament)


@router.post("/{tournament_id}/generate-next-round")
async def generate_next_round(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    if tournament.format != TournamentFormat.MEXICANO:
        raise HTTPException(status_code=400, detail="Next-round generation is only used by Mexicano.")
    if tournament.status != TournamentStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Tournament is not active.")
    if any(round_row.status == RoundStatus.ACTIVE for round_row in tournament.rounds):
        raise HTTPException(status_code=400, detail="Finish the current round first.")
    if len(tournament.rounds) >= (tournament.target_rounds or 0):
        raise HTTPException(status_code=400, detail="Tournament already reached its target rounds.")

    leaderboard = compute_tournament_standings(db, tournament.id)
    player_ids = [row["player_id"] for row in leaderboard]
    if not player_ids:
        player_ids = [participant.player_id for participant in tournament.participants]

    next_round_spec = generate_mexicano_round(
        player_ids,
        tournament.court_count,
        round_number=len(tournament.rounds) + 1,
        previous_rounds_metadata=[round_row.metadata_json or {} for round_row in tournament.rounds],
    )
    _materialize_round(db, tournament, next_round_spec, RoundStatus.ACTIVE)
    db.commit()

    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be reloaded.")

    await manager.broadcast(
        tournament.id,
        {"type": "next_round_generated", "tournament_id": tournament.id, "round_number": len(tournament.rounds)},
    )
    return _serialize_tournament_detail(db, tournament)


@router.post("/{tournament_id}/generate-next-rotation")
async def generate_next_rotation(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    if tournament.format != TournamentFormat.AMERICANO:
        raise HTTPException(status_code=400, detail="Extra rotations are only available for Americano.")
    if tournament.status != TournamentStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Tournament is not active.")
    if any(round_row.status == RoundStatus.ACTIVE for round_row in tournament.rounds):
        raise HTTPException(status_code=400, detail="Finish the current round first.")
    if _bracket_rounds(tournament):
        raise HTTPException(status_code=400, detail="Extra rotations are not available after brackets have started.")

    rotation_order = _build_rotation_order(tournament)
    schedule = generate_americano_schedule(rotation_order, tournament.court_count)
    rotation_round_count = len(_rotation_rounds(tournament))
    next_template = schedule[rotation_round_count % len(schedule)]
    round_row = _materialize_round(
        db,
        tournament,
        RoundSpec(
            number=len(tournament.rounds) + 1,
            matches=next_template.matches,
            metadata={
                **dict(next_template.metadata),
                "type": "rotation_extension",
            },
        ),
        RoundStatus.ACTIVE,
    )
    if tournament.target_rounds is None or tournament.target_rounds < round_row.number:
        tournament.target_rounds = round_row.number

    db.commit()
    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be reloaded.")

    await manager.broadcast(
        tournament.id,
        {"type": "rotation_extended", "tournament_id": tournament.id, "round_id": round_row.id},
    )
    return _serialize_tournament_detail(db, tournament)


@router.post("/{tournament_id}/start-bracket")
async def start_bracket(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    if tournament.status != TournamentStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Tournament is not active.")
    if any(round_row.status == RoundStatus.ACTIVE for round_row in tournament.rounds):
        raise HTTPException(status_code=400, detail="Finish the current round first.")
    if _bracket_rounds(tournament):
        raise HTTPException(status_code=400, detail="A bracket has already started for this tournament.")

    leaderboard = compute_tournament_standings(db, tournament.id)
    teams, excluded_player_ids = _build_seeded_bracket_teams(leaderboard)
    stage_label = _label_bracket_stage(len(teams))
    round_row = _materialize_bracket_round(
        db,
        tournament,
        teams=teams,
        round_index=1,
        stage_label=stage_label,
        excluded_player_ids=excluded_player_ids,
    )
    db.commit()

    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be reloaded.")

    await manager.broadcast(
        tournament.id,
        {"type": "bracket_started", "tournament_id": tournament.id, "round_id": round_row.id},
    )
    return _serialize_tournament_detail(db, tournament)


@router.post("/{tournament_id}/continue-bracket")
async def continue_bracket(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    if tournament.status != TournamentStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Tournament is not active.")
    if any(round_row.status == RoundStatus.ACTIVE for round_row in tournament.rounds):
        raise HTTPException(status_code=400, detail="Finish the current round first.")

    bracket_rounds = _bracket_rounds(tournament)
    if not bracket_rounds:
        raise HTTPException(status_code=400, detail="Start a bracket before continuing it.")

    last_round = bracket_rounds[-1]
    if last_round.status != RoundStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Complete the current bracket round first.")
    if (last_round.metadata_json or {}).get("bracket_stage") in {"Final", "Finals"}:
        raise HTTPException(status_code=400, detail="This bracket is already complete.")

    winners, losers, carryover_team = _build_next_bracket_stage(last_round)
    contenders = ([carryover_team] if carryover_team else []) + winners
    if len(contenders) <= 1:
        raise HTTPException(status_code=400, detail="This bracket is already complete.")

    next_round_index = int((last_round.metadata_json or {}).get("bracket_round_index", len(bracket_rounds))) + 1
    if len(winners) == 2 and len(losers) == 2 and len(last_round.matches) == 2 and carryover_team is None:
        round_row = _materialize_bracket_round(
            db,
            tournament,
            teams=[
                winners[0],
                winners[1],
                losers[0],
                losers[1],
            ],
            round_index=next_round_index,
            stage_label=_label_bracket_stage(2, has_bronze_match=True),
        )
    else:
        round_row = _materialize_bracket_round(
            db,
            tournament,
            teams=contenders,
            round_index=next_round_index,
            stage_label=_label_bracket_stage(len(contenders)),
        )

    db.commit()
    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be reloaded.")

    await manager.broadcast(
        tournament.id,
        {"type": "bracket_continued", "tournament_id": tournament.id, "round_id": round_row.id},
    )
    return _serialize_tournament_detail(db, tournament)


@router.post("/{tournament_id}/finish")
async def finish_tournament(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")
    if tournament.status != TournamentStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Only active tournaments can be finished.")

    _finish_tournament_state(db, tournament)
    db.commit()

    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be reloaded.")

    await manager.broadcast(
        tournament.id,
        {"type": "tournament_finished", "tournament_id": tournament.id},
    )
    return _serialize_tournament_detail(db, tournament)


@router.post("/{tournament_id}/play-top-four-final")
async def play_top_four_final(
    tournament_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")

    round_row = _create_top_four_final_round(db, tournament)
    db.commit()

    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be reloaded.")

    await manager.broadcast(
        tournament.id,
        {"type": "top4_final_created", "tournament_id": tournament.id, "round_id": round_row.id},
    )
    return _serialize_tournament_detail(db, tournament)


@router.post("/{tournament_id}/rounds/{round_id}/unlock")
async def unlock_round(
    tournament_id: str,
    round_id: str,
    _: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    tournament = _load_tournament(db, tournament_id)
    if tournament is None:
        raise HTTPException(status_code=404, detail="Tournament not found.")

    round_row = next((item for item in tournament.rounds if item.id == round_id), None)
    if round_row is None:
        raise HTTPException(status_code=404, detail="Round not found.")

    _unlock_round_state(db, tournament, round_row)
    db.commit()

    tournament = _load_tournament(db, tournament.id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be reloaded.")

    await manager.broadcast(
        tournament.id,
        {"type": "round_unlocked", "tournament_id": tournament.id, "round_id": round_id},
    )
    return _serialize_tournament_detail(db, tournament)


@router.post("/matches/{match_id}/score")
async def update_score(
    match_id: str,
    payload: ScoreUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    match = (
        db.execute(
            select(Match)
            .where(Match.id == match_id)
            .options(
                selectinload(Match.round).selectinload(Round.matches),
                selectinload(Match.tournament).selectinload(Tournament.rounds).selectinload(Round.matches),
                selectinload(Match.tournament).selectinload(Tournament.participants).selectinload(TournamentParticipant.player),
            )
        )
        .scalars()
        .first()
    )
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found.")
    if match.tournament.status != TournamentStatus.ACTIVE or match.round.status != RoundStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Only active round matches can be edited.")
    if payload.version != match.version:
        raise HTTPException(status_code=409, detail="This match has been updated by someone else. Refresh and try again.")
    if (match.round.metadata_json or {}).get("strategy") == "bracket" and payload.team_a_games == payload.team_b_games:
        raise HTTPException(status_code=400, detail="Bracket matches cannot finish level.")
    try:
        validate_match_score(
            scoring_system=match.tournament.scoring_system,
            americano_points_target=match.tournament.americano_points_target,
            team_a_score=payload.team_a_games,
            team_b_score=payload.team_b_games,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.add(
        ScoreAuditLog(
            match_id=match.id,
            changed_by_user_id=current_user.id,
            previous_team_a_games=match.team_a_games,
            previous_team_b_games=match.team_b_games,
            new_team_a_games=payload.team_a_games,
            new_team_b_games=payload.team_b_games,
        )
    )

    match.team_a_games = payload.team_a_games
    match.team_b_games = payload.team_b_games
    match.version += 1
    match.last_updated_by_user_id = current_user.id
    match.updated_at = _utc_now()

    if all(item.team_a_games is not None and item.team_b_games is not None for item in match.round.matches):
        _persist_round_completion(db, match.tournament, match.round)

    db.commit()
    tournament = _load_tournament(db, match.tournament_id)
    if tournament is None:
        raise HTTPException(status_code=500, detail="Tournament could not be reloaded.")

    await manager.broadcast(
        tournament.id,
        {"type": "score_updated", "tournament_id": tournament.id, "match_id": match.id},
    )
    return _serialize_tournament_detail(db, tournament)
