from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models import Match, Player, Round, RoundStatus, Tournament, TournamentFormat, TournamentParticipant, TournamentStatus, User
from app.services.scoring import (
    AMERICANO_POINTS_SCORING,
    CLASSIC_SCORING,
    default_americano_points_target,
    resolve_tournament_scoring,
    validate_match_score,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _create_player(db_session: Session, display_name: str, *, is_admin: bool = False) -> tuple[User, Player]:
    user = User(
        email=f"{display_name.lower()}-{uuid4().hex[:8]}@test.local",
        full_name=display_name,
        password_hash="disabled",
        is_admin=is_admin,
    )
    player = Player(display_name=display_name, user=user)
    db_session.add_all([user, player])
    db_session.flush()
    return user, player


def _seed_active_americano_tournament(db_session: Session) -> tuple[User, Match]:
    admin_user, iar_player = _create_player(db_session, "IAR", is_admin=True)
    _, ada = _create_player(db_session, "Ada")
    _, ben = _create_player(db_session, "Ben")
    _, cris = _create_player(db_session, "Cris")

    tournament = Tournament(
        name="Americano Points",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.ACTIVE,
        court_count=1,
        target_rounds=1,
        scoring_system=AMERICANO_POINTS_SCORING,
        americano_points_target=17,
        created_by_user_id=admin_user.id,
        created_at=_now(),
        started_at=_now(),
    )
    db_session.add(tournament)
    db_session.flush()

    for order_index, player in enumerate((iar_player, ada, ben, cris)):
        db_session.add(
            TournamentParticipant(
                tournament_id=tournament.id,
                player_id=player.id,
                order_index=order_index,
            )
        )

    round_row = Round(
        tournament_id=tournament.id,
        number=1,
        status=RoundStatus.ACTIVE,
        metadata_json={"strategy": "americano", "type": "pre_generated", "bench_player_ids": []},
        started_at=_now(),
    )
    db_session.add(round_row)
    db_session.flush()

    match = Match(
        tournament_id=tournament.id,
        round_id=round_row.id,
        court_number=1,
        team_a_player_1_id=iar_player.id,
        team_a_player_2_id=ada.id,
        team_b_player_1_id=ben.id,
        team_b_player_2_id=cris.id,
        version=1,
    )
    db_session.add(match)
    db_session.commit()
    return admin_user, match


def test_default_americano_points_target_matches_supported_recommendations() -> None:
    assert default_americano_points_target(8) == 17
    assert default_americano_points_target(12) == 13
    assert default_americano_points_target(4) is None


def test_resolve_tournament_scoring_defaults_to_classic_for_four_player_americano() -> None:
    config = resolve_tournament_scoring(
        tournament_format="americano",
        scoring_system=CLASSIC_SCORING,
        americano_points_target=None,
        active_player_count=4,
    )

    assert config.scoring_system == CLASSIC_SCORING
    assert config.americano_points_target is None


def test_resolve_tournament_scoring_uses_recommended_americano_target_when_missing() -> None:
    config = resolve_tournament_scoring(
        tournament_format="americano",
        scoring_system=AMERICANO_POINTS_SCORING,
        americano_points_target=None,
        active_player_count=8,
    )

    assert config.scoring_system == AMERICANO_POINTS_SCORING
    assert config.americano_points_target == 17


def test_validate_match_score_requires_a_single_team_to_hit_the_americano_target() -> None:
    validate_match_score(
        scoring_system=AMERICANO_POINTS_SCORING,
        americano_points_target=17,
        team_a_score=9,
        team_b_score=17,
    )

    try:
        validate_match_score(
            scoring_system=AMERICANO_POINTS_SCORING,
            americano_points_target=17,
            team_a_score=9,
            team_b_score=8,
        )
    except ValueError as exc:
        assert "reach exactly 17" in str(exc)
    else:
        raise AssertionError("Expected Americano validation to reject scores without a team on the target.")


def test_api_rejects_invalid_americano_points_score(client: TestClient, db_session: Session) -> None:
    admin_user, match = _seed_active_americano_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post(
        f"/api/tournaments/matches/{match.id}/score",
        json={"team_a_games": 10, "team_b_games": 10, "version": 1},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "One team must reach exactly 17 points in Americano scoring."


def test_api_accepts_valid_americano_points_score(client: TestClient, db_session: Session) -> None:
    admin_user, match = _seed_active_americano_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post(
        f"/api/tournaments/matches/{match.id}/score",
        json={"team_a_games": 17, "team_b_games": 12, "version": 1},
    )

    assert response.status_code == 200
    db_session.refresh(match)
    assert match.team_a_games == 17
    assert match.team_b_games == 12
