from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models import Match, Player, Round, RoundStatus, Tournament, TournamentFormat, TournamentParticipant, TournamentStatus, User

PNG_PIXEL = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
    b"\xc0\x00\x00\x04\x00\x01\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82"
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


def _seed_completed_session(db_session: Session) -> tuple[User, tuple[Player, Player, Player, Player]]:
    admin_user, iar = _create_player(db_session, "IAR", is_admin=True)
    _, ada = _create_player(db_session, "Ada")
    _, ben = _create_player(db_session, "Ben")
    _, cris = _create_player(db_session, "Cris")

    tournament = Tournament(
        name="Chemistry Night",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.COMPLETED,
        court_count=1,
        target_rounds=1,
        created_by_user_id=admin_user.id,
        created_at=_now(),
        started_at=_now(),
        completed_at=_now(),
    )
    db_session.add(tournament)
    db_session.flush()

    for index, player in enumerate((iar, ada, ben, cris)):
        db_session.add(
            TournamentParticipant(
                tournament_id=tournament.id,
                player_id=player.id,
                order_index=index,
            )
        )

    round_row = Round(
        tournament_id=tournament.id,
        number=1,
        status=RoundStatus.COMPLETED,
        metadata_json={"strategy": "bracket", "bracket_stage": "Final"},
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
            team_a_player_1_id=iar.id,
            team_a_player_2_id=ada.id,
            team_b_player_1_id=ben.id,
            team_b_player_2_id=cris.id,
            team_a_games=6,
            team_b_games=3,
            version=2,
        )
    )
    db_session.commit()
    return admin_user, (iar, ada, ben, cris)


def test_my_stats_exposes_chemistry_achievements_and_elo(client: TestClient, db_session: Session) -> None:
    admin_user, _ = _seed_completed_session(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.get("/api/players/me/stats")
    assert response.status_code == 200

    payload = response.json()
    assert payload["chemistry"]["best_partner"]["display_name"] == "Ada"
    assert payload["chemistry"]["hardest_opponent"]["display_name"] in {"Ben", "Cris"}
    assert payload["elo_rating"] > 1000
    assert {achievement["slug"] for achievement in payload["achievements"]} >= {
        "welcome-board",
        "first-win",
        "champion-night",
        "clutch-closer",
    }


def test_elo_leaderboard_rewards_the_winning_team(client: TestClient, db_session: Session) -> None:
    admin_user, (iar, _, ben, _) = _seed_completed_session(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.get("/api/leaderboards/elo")
    assert response.status_code == 200

    by_player = {row["player_id"]: row for row in response.json()}
    assert by_player[iar.id]["rating"] > 1000
    assert by_player[ben.id]["rating"] < 1000


def test_head_to_head_compares_two_players(client: TestClient, db_session: Session) -> None:
    admin_user, (iar, _, ben, _) = _seed_completed_session(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.get(f"/api/players/head-to-head?player_a_id={iar.id}&player_b_id={ben.id}")
    assert response.status_code == 200

    payload = response.json()
    assert payload["against"]["matches"] == 1
    assert payload["against"]["player_a_wins"] == 1
    assert payload["against"]["player_b_wins"] == 0


def test_avatar_upload_updates_the_current_player(client: TestClient, db_session: Session, tmp_path, monkeypatch) -> None:
    admin_user, _ = _seed_completed_session(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))
    monkeypatch.setattr(settings, "media_dir_override", str(tmp_path))

    response = client.post(
        "/api/players/me/avatar",
        files={"avatar": ("avatar.png", PNG_PIXEL, "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["avatar_url"].startswith("/media/avatars/")
