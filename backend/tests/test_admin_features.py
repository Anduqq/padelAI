from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models import DataScope, Match, Player, Round, RoundStatus, Tournament, TournamentFormat, TournamentParticipant, TournamentStatus, User


def _now() -> datetime:
    return datetime.now(UTC)


def _create_player(
    db_session: Session,
    display_name: str,
    *,
    is_admin: bool = False,
    data_scope: DataScope = DataScope.PROD,
) -> tuple[User, Player]:
    user = User(
        email=f"{display_name.lower()}-{uuid4().hex[:8]}@test.local",
        full_name=display_name,
        password_hash="disabled",
        is_admin=is_admin,
    )
    player = Player(display_name=display_name, user=user, data_scope=data_scope)
    db_session.add_all([user, player])
    db_session.flush()
    return user, player


def _seed_scoped_tournament(
    db_session: Session,
    *,
    admin_user: User,
    players: tuple[Player, Player, Player, Player],
    name: str,
    scope: DataScope,
) -> Tournament:
    tournament = Tournament(
        name=name,
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.COMPLETED,
        data_scope=scope,
        court_count=1,
        target_rounds=1,
        created_by_user_id=admin_user.id,
        created_at=_now(),
        started_at=_now(),
        completed_at=_now(),
    )
    db_session.add(tournament)
    db_session.flush()

    for order_index, player in enumerate(players):
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
        metadata_json={"strategy": "americano", "type": "pre_generated"},
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
            team_a_player_1_id=players[0].id,
            team_a_player_2_id=players[1].id,
            team_b_player_1_id=players[2].id,
            team_b_player_2_id=players[3].id,
            team_a_games=6,
            team_b_games=3,
            version=2,
        )
    )
    db_session.commit()
    return tournament


def test_admin_scope_switch_filters_tournaments_and_leaderboards(client: TestClient, db_session: Session) -> None:
    admin_user, iar = _create_player(db_session, "IAR", is_admin=True)
    _, ada = _create_player(db_session, "Ada")
    _, ben = _create_player(db_session, "Ben")
    _, cris = _create_player(db_session, "Cris")

    _seed_scoped_tournament(
        db_session,
        admin_user=admin_user,
        players=(iar, ada, ben, cris),
        name="Prod Session",
        scope=DataScope.PROD,
    )
    _seed_scoped_tournament(
        db_session,
        admin_user=admin_user,
        players=(iar, ada, ben, cris),
        name="Test Session",
        scope=DataScope.TEST,
    )

    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    prod_response = client.get("/api/tournaments")
    assert prod_response.status_code == 200
    assert [item["name"] for item in prod_response.json()] == ["Prod Session"]

    response = client.post("/api/admin/scope", json={"scope": "test"})
    assert response.status_code == 200
    assert response.json()["current_scope"] == "test"
    client.cookies.set(settings.data_scope_cookie_name, "test")

    test_response = client.get("/api/tournaments")
    assert test_response.status_code == 200
    assert [item["name"] for item in test_response.json()] == ["Test Session"]

    leaderboard_response = client.get("/api/leaderboards/global")
    assert leaderboard_response.status_code == 200
    assert leaderboard_response.json()[0]["tournaments_played"] == 1


def test_admin_seed_endpoint_builds_demo_test_world(client: TestClient, db_session: Session) -> None:
    admin_user, _ = _create_player(db_session, "IAR", is_admin=True)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post("/api/admin/test-data/seed", json={"tournament_count": 12, "replace_existing": True})
    assert response.status_code == 200
    payload = response.json()
    assert payload["test_tournaments"] == 12
    assert payload["current_scope"] == "prod"

    client.cookies.set(settings.data_scope_cookie_name, "test")
    tournaments_response = client.get("/api/tournaments")
    assert tournaments_response.status_code == 200
    assert len(tournaments_response.json()) == 12


def test_player_lists_stay_prod_only_until_test_scope_is_selected(client: TestClient, db_session: Session) -> None:
    admin_user, _ = _create_player(db_session, "IAR", is_admin=True)
    _create_player(db_session, "Claudiu")
    _create_player(db_session, "Ada", data_scope=DataScope.TEST)
    db_session.commit()

    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    prod_players_response = client.get("/api/players")
    assert prod_players_response.status_code == 200
    assert [player["display_name"] for player in prod_players_response.json()] == ["Claudiu", "IAR"]

    login_options_response = client.get("/api/auth/options")
    assert login_options_response.status_code == 200
    assert [player["display_name"] for player in login_options_response.json()] == ["IAR", "Claudiu"]

    client.cookies.set(settings.data_scope_cookie_name, "test")
    test_players_response = client.get("/api/players")
    assert test_players_response.status_code == 200
    assert [player["display_name"] for player in test_players_response.json()] == ["Ada"]

    prod_only_players_response = client.get("/api/players?scope_filter=prod")
    assert prod_only_players_response.status_code == 200
    assert [player["display_name"] for player in prod_only_players_response.json()] == ["Claudiu", "IAR"]
