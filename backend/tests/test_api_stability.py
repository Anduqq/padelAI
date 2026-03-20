from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models import Match, Player, Round, RoundStatus, Tournament, TournamentFormat, TournamentParticipant, TournamentStatus, User
from app.services.leaderboards import compute_tournament_standings


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


def _seed_completed_tournament(db_session: Session) -> tuple[User, Tournament]:
    admin_user, iar_player = _create_player(db_session, "IAR", is_admin=True)
    _, ada = _create_player(db_session, "Ada")
    _, ben = _create_player(db_session, "Ben")
    _, cris = _create_player(db_session, "Cris")

    tournament = Tournament(
        name="Friday Session",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.COMPLETED,
        court_count=1,
        target_rounds=3,
        created_by_user_id=admin_user.id,
        created_at=_now(),
        started_at=_now(),
        completed_at=_now(),
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
        status=RoundStatus.COMPLETED,
        metadata_json={"strategy": "americano", "type": "pre_generated", "bench_player_ids": []},
        started_at=_now(),
        completed_at=_now(),
    )
    db_session.add(round_row)
    db_session.flush()

    db_session.add(
        Match(
            tournament_id=tournament.id,
            round_id=round_row.id,
            court_number=1,
            team_a_player_1_id=iar_player.id,
            team_a_player_2_id=ada.id,
            team_b_player_1_id=ben.id,
            team_b_player_2_id=cris.id,
            team_a_games=6,
            team_b_games=4,
            version=2,
        )
    )
    db_session.commit()
    return admin_user, tournament


def test_auth_options_put_iar_first_and_allow_selection(client: TestClient, db_session: Session) -> None:
    _create_player(db_session, "Alex")
    _, iar_player = _create_player(db_session, "IAR", is_admin=True)
    _create_player(db_session, "Mara")
    db_session.commit()

    response = client.get("/api/auth/options")
    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["display_name"] == "IAR"

    response = client.post("/api/auth/select", json={"player_id": iar_player.id})
    assert response.status_code == 200
    assert response.json()["display_name"] == "IAR"
    assert response.json()["is_admin"] is True


def test_read_only_api_calls_do_not_mutate_tournament_leaderboard(client: TestClient, db_session: Session) -> None:
    admin_user, tournament = _seed_completed_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    before = compute_tournament_standings(db_session, tournament.id)

    for path in (
        "/api/auth/me",
        "/api/players",
        "/api/players/suggestions",
        "/api/players/me/stats",
        "/api/leaderboards/global",
        "/api/tournaments",
        f"/api/tournaments/{tournament.id}",
    ):
        response = client.get(path)
        assert response.status_code == 200, path

    after = compute_tournament_standings(db_session, tournament.id)
    assert after == before

    match = db_session.execute(select(Match).where(Match.tournament_id == tournament.id)).scalars().one()
    assert match.team_a_games == 6
    assert match.team_b_games == 4
