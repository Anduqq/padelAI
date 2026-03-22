from __future__ import annotations

from datetime import UTC, datetime, timedelta
import random

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    DataScope,
    Match,
    Round,
    RoundStatus,
    StandingsSnapshot,
    Tournament,
    TournamentFormat,
    TournamentParticipant,
    TournamentStatus,
    User,
)
from app.services.leaderboards import compute_tournament_standings
from app.services.player_accounts import create_player_account, find_player_by_display_name
from app.services.round_generation import generate_americano_schedule, generate_mexicano_round, get_schedule_capacity
from app.services.scoring import CLASSIC_SCORING, default_americano_points_target


DEMO_PLAYER_NAMES = [
    "Ada",
    "Ben",
    "Cris",
    "Daria",
    "Edi",
    "Filip",
    "Gabi",
    "Horia",
    "Ioana",
    "Jules",
    "Kira",
    "Luca",
    "Mara",
    "Nico",
    "Oana",
    "Paul",
    "Radu",
    "Sia",
    "Toma",
]


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _serialize_scope_overview(db: Session) -> dict:
    prod_count = db.execute(select(Tournament).where(Tournament.data_scope == DataScope.PROD)).scalars().all()
    test_count = db.execute(select(Tournament).where(Tournament.data_scope == DataScope.TEST)).scalars().all()
    return {
        "prod_tournaments": len(prod_count),
        "test_tournaments": len(test_count),
    }


def build_admin_overview(db: Session, current_scope: DataScope) -> dict:
    counts = _serialize_scope_overview(db)
    return {
        "current_scope": current_scope.value,
        "available_scopes": [DataScope.PROD.value, DataScope.TEST.value],
        **counts,
    }


def _ensure_demo_players(db: Session) -> list:
    players = []
    for name in DEMO_PLAYER_NAMES:
        player = find_player_by_display_name(db, name, data_scope=DataScope.TEST)
        if player is None:
            player = create_player_account(db, name, data_scope=DataScope.TEST)
        players.append(player)
    db.flush()
    return players


def clear_scope_tournaments(db: Session, scope: DataScope) -> int:
    tournaments = db.execute(select(Tournament).where(Tournament.data_scope == scope)).scalars().all()
    tournament_ids = [tournament.id for tournament in tournaments]
    if tournament_ids:
        db.execute(delete(StandingsSnapshot).where(StandingsSnapshot.tournament_id.in_(tournament_ids)))
        for tournament in tournaments:
            db.delete(tournament)
        db.flush()
    return len(tournament_ids)


def _score_pair(
    *,
    scoring_system: str,
    americano_points_target: int | None,
    rng: random.Random,
) -> tuple[int, int]:
    if scoring_system == "americano_points" and americano_points_target is not None:
        loser_score = rng.randint(max(0, americano_points_target - 10), americano_points_target - 1)
        if rng.random() < 0.5:
            return americano_points_target, loser_score
        return loser_score, americano_points_target

    winner_score = rng.randint(6, 10)
    loser_score = rng.randint(max(0, winner_score - 6), winner_score - 1)
    if rng.random() < 0.5:
        return winner_score, loser_score
    return loser_score, winner_score


def _create_tournament_shell(
    db: Session,
    *,
    admin_user: User,
    name: str,
    format_value: TournamentFormat,
    status: TournamentStatus,
    player_ids: list[str],
    court_count: int,
    target_rounds: int | None,
    scoring_system: str,
    americano_points_target: int | None,
    created_at: datetime,
    started_at: datetime | None,
    completed_at: datetime | None,
) -> Tournament:
    tournament = Tournament(
        name=name,
        format=format_value,
        status=status,
        court_count=court_count,
        target_rounds=target_rounds,
        scoring_system=scoring_system,
        americano_points_target=americano_points_target,
        data_scope=DataScope.TEST,
        created_by_user_id=admin_user.id,
        created_at=created_at,
        started_at=started_at,
        completed_at=completed_at,
    )
    db.add(tournament)
    db.flush()

    for order_index, player_id in enumerate(player_ids):
        db.add(
            TournamentParticipant(
                tournament_id=tournament.id,
                player_id=player_id,
                order_index=order_index,
            )
        )

    db.flush()
    return tournament


def _materialize_completed_round(
    db: Session,
    *,
    tournament: Tournament,
    round_number: int,
    round_spec,
    started_at: datetime,
    completed_at: datetime,
    rng: random.Random,
) -> None:
    round_row = Round(
        tournament_id=tournament.id,
        number=round_number,
        status=RoundStatus.COMPLETED,
        metadata_json=round_spec.metadata,
        started_at=started_at,
        completed_at=completed_at,
    )
    db.add(round_row)
    db.flush()

    for match_spec in round_spec.matches:
        team_a_games, team_b_games = _score_pair(
            scoring_system=tournament.scoring_system,
            americano_points_target=tournament.americano_points_target,
            rng=rng,
        )
        db.add(
            Match(
                tournament_id=tournament.id,
                round_id=round_row.id,
                court_number=match_spec.court_number,
                team_a_player_1_id=match_spec.team_a[0],
                team_a_player_2_id=match_spec.team_a[1],
                team_b_player_1_id=match_spec.team_b[0],
                team_b_player_2_id=match_spec.team_b[1],
                team_a_games=team_a_games,
                team_b_games=team_b_games,
                version=2,
                updated_at=completed_at,
            )
        )

    db.flush()
    standings = compute_tournament_standings(db, tournament.id)
    db.add(
        StandingsSnapshot(
            tournament_id=tournament.id,
            round_number=round_number,
            standings_json=standings,
            created_at=completed_at,
        )
    )


def _seed_completed_tournament(
    db: Session,
    *,
    admin_user: User,
    players,
    index: int,
    created_at: datetime,
    rng: random.Random,
) -> None:
    candidate_player_count = rng.choice([4, 8, 9, 12])
    format_value = TournamentFormat.AMERICANO if rng.random() < 0.7 else TournamentFormat.MEXICANO
    selected_players = rng.sample(players, candidate_player_count)
    player_ids = [player.id for player in selected_players]
    capacity = get_schedule_capacity(player_ids, min(3, max(1, candidate_player_count // 4)))

    scoring_system = CLASSIC_SCORING
    americano_points_target = None
    if format_value == TournamentFormat.AMERICANO and capacity.active_player_count in {8, 12} and rng.random() < 0.6:
        scoring_system = "americano_points"
        americano_points_target = default_americano_points_target(capacity.active_player_count)

    base_name = "Americano" if format_value == TournamentFormat.AMERICANO else "Mexicano"
    started_at = created_at + timedelta(minutes=18)
    completed_at = started_at + timedelta(minutes=90 + rng.randint(0, 55))
    target_rounds = rng.randint(4, 6) if format_value == TournamentFormat.MEXICANO else None
    tournament = _create_tournament_shell(
        db,
        admin_user=admin_user,
        name=f"{base_name} Demo Night {index + 1}",
        format_value=format_value,
        status=TournamentStatus.COMPLETED,
        player_ids=player_ids,
        court_count=capacity.active_courts,
        target_rounds=target_rounds,
        scoring_system=scoring_system,
        americano_points_target=americano_points_target,
        created_at=created_at,
        started_at=started_at,
        completed_at=completed_at,
    )

    if format_value == TournamentFormat.AMERICANO:
        round_specs = generate_americano_schedule(player_ids, capacity.active_courts)
    else:
        round_specs = []
        ranking_order = list(player_ids)
        previous_rounds_metadata: list[dict] = []
        for round_number in range(1, (target_rounds or 0) + 1):
            round_spec = generate_mexicano_round(
                ranking_order,
                capacity.active_courts,
                round_number=round_number,
                previous_rounds_metadata=previous_rounds_metadata,
            )
            round_specs.append(round_spec)
            previous_rounds_metadata.append(round_spec.metadata)

    for round_index, round_spec in enumerate(round_specs, start=1):
        round_started_at = started_at + timedelta(minutes=(round_index - 1) * 18)
        round_completed_at = round_started_at + timedelta(minutes=15)
        _materialize_completed_round(
            db,
            tournament=tournament,
            round_number=round_index,
            round_spec=round_spec,
            started_at=round_started_at,
            completed_at=round_completed_at,
            rng=rng,
        )
        if format_value == TournamentFormat.MEXICANO:
            ranking_order = [row["player_id"] for row in compute_tournament_standings(db, tournament.id)] or player_ids


def _seed_active_tournament(
    db: Session,
    *,
    admin_user: User,
    players,
    index: int,
    created_at: datetime,
    rng: random.Random,
) -> None:
    candidate_player_count = rng.choice([4, 8, 9, 12])
    format_value = TournamentFormat.AMERICANO if rng.random() < 0.75 else TournamentFormat.MEXICANO
    selected_players = rng.sample(players, candidate_player_count)
    player_ids = [player.id for player in selected_players]
    capacity = get_schedule_capacity(player_ids, min(3, max(1, candidate_player_count // 4)))
    scoring_system = CLASSIC_SCORING
    americano_points_target = None
    if format_value == TournamentFormat.AMERICANO and capacity.active_player_count in {8, 12} and rng.random() < 0.5:
        scoring_system = "americano_points"
        americano_points_target = default_americano_points_target(capacity.active_player_count)

    started_at = created_at + timedelta(minutes=12)
    tournament = _create_tournament_shell(
        db,
        admin_user=admin_user,
        name=f"Live Demo {index + 1}",
        format_value=format_value,
        status=TournamentStatus.ACTIVE,
        player_ids=player_ids,
        court_count=capacity.active_courts,
        target_rounds=5 if format_value == TournamentFormat.MEXICANO else None,
        scoring_system=scoring_system,
        americano_points_target=americano_points_target,
        created_at=created_at,
        started_at=started_at,
        completed_at=None,
    )

    if format_value == TournamentFormat.AMERICANO:
        round_specs = generate_americano_schedule(player_ids, capacity.active_courts)
        selected_round_spec = round_specs[0]
    else:
        selected_round_spec = generate_mexicano_round(player_ids, capacity.active_courts, round_number=1)

    round_row = Round(
        tournament_id=tournament.id,
        number=1,
        status=RoundStatus.ACTIVE,
        metadata_json=selected_round_spec.metadata,
        started_at=started_at,
    )
    db.add(round_row)
    db.flush()

    for match_index, match_spec in enumerate(selected_round_spec.matches, start=1):
        match = Match(
            tournament_id=tournament.id,
            round_id=round_row.id,
            court_number=match_spec.court_number,
            team_a_player_1_id=match_spec.team_a[0],
            team_a_player_2_id=match_spec.team_a[1],
            team_b_player_1_id=match_spec.team_b[0],
            team_b_player_2_id=match_spec.team_b[1],
            version=1,
        )
        if match_index == 1:
            team_a_games, team_b_games = _score_pair(
                scoring_system=tournament.scoring_system,
                americano_points_target=tournament.americano_points_target,
                rng=rng,
            )
            match.team_a_games = team_a_games
            match.team_b_games = team_b_games
            match.version = 2
            match.updated_at = started_at + timedelta(minutes=10)
        db.add(match)


def _seed_draft_tournament(
    db: Session,
    *,
    admin_user: User,
    players,
    index: int,
    created_at: datetime,
    rng: random.Random,
) -> None:
    candidate_player_count = rng.choice([4, 8, 9, 12])
    format_value = TournamentFormat.AMERICANO if rng.random() < 0.75 else TournamentFormat.MEXICANO
    selected_players = rng.sample(players, candidate_player_count)
    player_ids = [player.id for player in selected_players]
    capacity = get_schedule_capacity(player_ids, min(3, max(1, candidate_player_count // 4)))
    _create_tournament_shell(
        db,
        admin_user=admin_user,
        name=f"Draft Demo {index + 1}",
        format_value=format_value,
        status=TournamentStatus.DRAFT,
        player_ids=player_ids,
        court_count=capacity.active_courts,
        target_rounds=5 if format_value == TournamentFormat.MEXICANO else None,
        scoring_system=CLASSIC_SCORING,
        americano_points_target=None,
        created_at=created_at,
        started_at=None,
        completed_at=None,
    )


def seed_demo_data(
    db: Session,
    *,
    admin_user: User,
    tournament_count: int = 100,
    replace_existing: bool = True,
) -> None:
    if replace_existing:
        clear_scope_tournaments(db, DataScope.TEST)

    players = _ensure_demo_players(db)
    rng = random.Random(2625)
    now = _utc_now()

    active_target = max(1, tournament_count // 10) if tournament_count >= 6 else 0
    draft_target = max(1, tournament_count // 10) if tournament_count >= 8 else 0
    completed_target = max(1, tournament_count - active_target - draft_target)
    while completed_target + active_target + draft_target > tournament_count:
        if draft_target > 0:
            draft_target -= 1
        elif active_target > 0:
            active_target -= 1
        else:
            completed_target -= 1

    for index in range(completed_target):
        created_at = now - timedelta(days=tournament_count - index, hours=rng.randint(0, 18))
        _seed_completed_tournament(
            db,
            admin_user=admin_user,
            players=players,
            index=index,
            created_at=created_at,
            rng=rng,
        )

    for index in range(active_target):
        created_at = now - timedelta(days=max(active_target - index, 1), hours=rng.randint(0, 12))
        _seed_active_tournament(
            db,
            admin_user=admin_user,
            players=players,
            index=index,
            created_at=created_at,
            rng=rng,
        )

    for index in range(draft_target):
        created_at = now - timedelta(hours=(draft_target - index) * 3)
        _seed_draft_tournament(
            db,
            admin_user=admin_user,
            players=players,
            index=index,
            created_at=created_at,
            rng=rng,
        )

    db.flush()
