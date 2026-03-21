from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models import Match, Player, Round, RoundStatus, StandingsSnapshot, Tournament, TournamentFormat, TournamentParticipant, TournamentStatus, User
from app.api import tournaments as tournaments_api
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


def _seed_unlockable_tournament(db_session: Session) -> tuple[User, Tournament, Round]:
    admin_user, iar_player = _create_player(db_session, "IAR", is_admin=True)
    _, ada = _create_player(db_session, "Ada")
    _, ben = _create_player(db_session, "Ben")
    _, cris = _create_player(db_session, "Cris")

    tournament = Tournament(
        name="Unlockable Session",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.ACTIVE,
        court_count=1,
        target_rounds=3,
        scoring_system="classic",
        americano_points_target=None,
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

    first_round = Round(
        tournament_id=tournament.id,
        number=1,
        status=RoundStatus.COMPLETED,
        metadata_json={"strategy": "americano", "type": "pre_generated", "bench_player_ids": []},
        started_at=_now(),
        completed_at=_now(),
    )
    second_round = Round(
        tournament_id=tournament.id,
        number=2,
        status=RoundStatus.ACTIVE,
        metadata_json={"strategy": "americano", "type": "pre_generated", "bench_player_ids": []},
        started_at=_now(),
    )
    db_session.add_all([first_round, second_round])
    db_session.flush()

    db_session.add(
        Match(
            tournament_id=tournament.id,
            round_id=first_round.id,
            court_number=1,
            team_a_player_1_id=iar_player.id,
            team_a_player_2_id=ada.id,
            team_b_player_1_id=ben.id,
            team_b_player_2_id=cris.id,
            team_a_games=6,
            team_b_games=3,
            version=2,
        )
    )
    db_session.add(
        Match(
            tournament_id=tournament.id,
            round_id=second_round.id,
            court_number=1,
            team_a_player_1_id=iar_player.id,
            team_a_player_2_id=ben.id,
            team_b_player_1_id=ada.id,
            team_b_player_2_id=cris.id,
            version=1,
        )
    )
    db_session.add(
        StandingsSnapshot(
            tournament_id=tournament.id,
            round_number=1,
            standings_json=[{"player_id": iar_player.id, "points": 6}],
        )
    )
    db_session.commit()
    return admin_user, tournament, first_round


def _seed_draft_tournament(db_session: Session) -> tuple[User, Tournament]:
    admin_user, iar_player = _create_player(db_session, "IAR", is_admin=True)
    _, ada = _create_player(db_session, "Ada")
    _, ben = _create_player(db_session, "Ben")
    _, cris = _create_player(db_session, "Cris")

    tournament = Tournament(
        name="Draft Session",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.DRAFT,
        court_count=1,
        target_rounds=3,
        created_by_user_id=admin_user.id,
        created_at=_now(),
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

    db_session.commit()
    return admin_user, tournament


def _seed_eight_player_draft_tournament(db_session: Session) -> tuple[User, Tournament]:
    admin_user, first_player = _create_player(db_session, "IAR", is_admin=True)
    extra_players = [_create_player(db_session, f"Player {index}")[1] for index in range(2, 9)]
    players = [first_player, *extra_players]

    tournament = Tournament(
        name="Eight Player Draft",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.DRAFT,
        court_count=2,
        created_by_user_id=admin_user.id,
        created_at=_now(),
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

    db_session.commit()
    return admin_user, tournament


def _seed_post_round_tournament(db_session: Session) -> tuple[User, Tournament]:
    admin_user, iar_player = _create_player(db_session, "IAR", is_admin=True)
    _, ada = _create_player(db_session, "Ada")
    _, ben = _create_player(db_session, "Ben")
    _, cris = _create_player(db_session, "Cris")

    tournament = Tournament(
        name="Post Round Session",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.ACTIVE,
        court_count=1,
        target_rounds=1,
        scoring_system="classic",
        americano_points_target=None,
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

    completed_round = Round(
        tournament_id=tournament.id,
        number=1,
        status=RoundStatus.COMPLETED,
        metadata_json={"strategy": "americano", "type": "pre_generated", "bench_player_ids": []},
        started_at=_now(),
        completed_at=_now(),
    )
    db_session.add(completed_round)
    db_session.flush()

    db_session.add(
        Match(
            tournament_id=tournament.id,
            round_id=completed_round.id,
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


def _seed_rewindable_tournament(db_session: Session) -> tuple[User, Tournament, Round]:
    admin_user, iar_player = _create_player(db_session, "IAR", is_admin=True)
    _, ada = _create_player(db_session, "Ada")
    _, ben = _create_player(db_session, "Ben")
    _, cris = _create_player(db_session, "Cris")

    tournament = Tournament(
        name="Rewindable Session",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.ACTIVE,
        court_count=1,
        target_rounds=3,
        scoring_system="classic",
        americano_points_target=None,
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

    first_round = Round(
        tournament_id=tournament.id,
        number=1,
        status=RoundStatus.COMPLETED,
        metadata_json={"strategy": "americano", "type": "pre_generated", "rotation_order": [iar_player.id, ada.id, ben.id, cris.id]},
        started_at=_now(),
        completed_at=_now(),
    )
    second_round = Round(
        tournament_id=tournament.id,
        number=2,
        status=RoundStatus.COMPLETED,
        metadata_json={"strategy": "americano", "type": "pre_generated", "rotation_order": [iar_player.id, ada.id, ben.id, cris.id]},
        started_at=_now(),
        completed_at=_now(),
    )
    db_session.add_all([first_round, second_round])
    db_session.flush()

    db_session.add(
        Match(
            tournament_id=tournament.id,
            round_id=first_round.id,
            court_number=1,
            team_a_player_1_id=iar_player.id,
            team_a_player_2_id=ada.id,
            team_b_player_1_id=ben.id,
            team_b_player_2_id=cris.id,
            team_a_games=6,
            team_b_games=3,
            version=2,
        )
    )
    db_session.add(
        Match(
            tournament_id=tournament.id,
            round_id=second_round.id,
            court_number=1,
            team_a_player_1_id=iar_player.id,
            team_a_player_2_id=ben.id,
            team_b_player_1_id=ada.id,
            team_b_player_2_id=cris.id,
            team_a_games=6,
            team_b_games=4,
            version=2,
        )
    )
    db_session.add(
        StandingsSnapshot(
            tournament_id=tournament.id,
            round_number=1,
            standings_json=[{"player_id": iar_player.id, "points": 6}],
        )
    )
    db_session.add(
        StandingsSnapshot(
            tournament_id=tournament.id,
            round_number=2,
            standings_json=[{"player_id": iar_player.id, "points": 12}],
        )
    )
    db_session.commit()
    return admin_user, tournament, first_round


def _seed_eight_player_active_tournament(db_session: Session) -> tuple[User, Tournament]:
    admin_user, first_player = _create_player(db_session, "IAR", is_admin=True)
    extra_players = [_create_player(db_session, f"Player {index}")[1] for index in range(2, 9)]
    players = [first_player, *extra_players]

    tournament = Tournament(
        name="Eight Player Active",
        format=TournamentFormat.AMERICANO,
        status=TournamentStatus.ACTIVE,
        court_count=2,
        created_by_user_id=admin_user.id,
        created_at=_now(),
        started_at=_now(),
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


def test_logout_clears_the_session_cookie(client: TestClient, db_session: Session) -> None:
    _, iar_player = _create_player(db_session, "IAR", is_admin=True)
    db_session.commit()

    response = client.post("/api/auth/select", json={"player_id": iar_player.id})
    assert response.status_code == 200

    response = client.post("/api/auth/logout")
    assert response.status_code == 204

    response = client.get("/api/auth/me")
    assert response.status_code == 401


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


def test_unlock_round_reopens_the_latest_completed_results(client: TestClient, db_session: Session) -> None:
    admin_user, tournament, round_row = _seed_unlockable_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post(f"/api/tournaments/{tournament.id}/rounds/{round_row.id}/unlock")
    assert response.status_code == 200

    payload = response.json()
    rounds_by_number = {item["number"]: item for item in payload["rounds"]}
    assert rounds_by_number[1]["status"] == "active"
    assert rounds_by_number[2]["status"] == "pending"
    assert rounds_by_number[1]["can_unlock"] is False


def test_delete_tournament_removes_non_completed_sessions(client: TestClient, db_session: Session) -> None:
    admin_user, tournament = _seed_draft_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.delete(f"/api/tournaments/{tournament.id}")
    assert response.status_code == 204
    assert db_session.get(Tournament, tournament.id) is None


def test_delete_tournament_removes_active_sessions_with_related_rows(client: TestClient, db_session: Session) -> None:
    admin_user, tournament, _ = _seed_unlockable_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.delete(f"/api/tournaments/{tournament.id}")
    assert response.status_code == 204
    assert db_session.get(Tournament, tournament.id) is None
    assert db_session.execute(select(Round).where(Round.tournament_id == tournament.id)).scalars().all() == []
    assert db_session.execute(select(Match).where(Match.tournament_id == tournament.id)).scalars().all() == []
    assert (
        db_session.execute(select(StandingsSnapshot).where(StandingsSnapshot.tournament_id == tournament.id))
        .scalars()
        .all()
        == []
    )


def test_start_tournament_randomizes_the_initial_pairing_order(
    client: TestClient,
    db_session: Session,
    monkeypatch,
) -> None:
    admin_user, tournament = _seed_eight_player_draft_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    def reverse_shuffle(player_ids: list[str]) -> list[str]:
        return list(reversed(player_ids))

    monkeypatch.setattr(tournaments_api, "_randomize_player_ids", reverse_shuffle)

    response = client.post(f"/api/tournaments/{tournament.id}/start")
    assert response.status_code == 200

    payload = response.json()
    first_match = payload["rounds"][0]["matches"][0]
    first_team_names = [player["display_name"] for player in first_match["team_a"]]
    assert first_team_names == ["Player 8", "IAR"]


def test_finish_tournament_marks_an_active_session_completed(client: TestClient, db_session: Session) -> None:
    admin_user, tournament, _ = _seed_unlockable_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post(f"/api/tournaments/{tournament.id}/finish")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"

    db_session.refresh(tournament)
    assert tournament.status == TournamentStatus.COMPLETED
    assert tournament.completed_at is not None


def test_play_top_four_final_creates_a_ranked_final_match(client: TestClient, db_session: Session) -> None:
    admin_user, tournament = _seed_post_round_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post(f"/api/tournaments/{tournament.id}/play-top-four-final")
    assert response.status_code == 200

    payload = response.json()
    final_round = payload["rounds"][-1]
    assert final_round["metadata"]["type"] == "top4_final"
    assert [player["display_name"] for player in final_round["matches"][0]["team_a"]] == ["Ada", "Ben"]
    assert [player["display_name"] for player in final_round["matches"][0]["team_b"]] == ["IAR", "Cris"]


def test_unlocking_an_older_round_rewinds_later_scores(client: TestClient, db_session: Session) -> None:
    admin_user, tournament, first_round = _seed_rewindable_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post(f"/api/tournaments/{tournament.id}/rounds/{first_round.id}/unlock")
    assert response.status_code == 200

    payload = response.json()
    rounds_by_number = {item["number"]: item for item in payload["rounds"]}
    assert rounds_by_number[1]["status"] == "active"
    assert rounds_by_number[2]["status"] == "pending"
    assert rounds_by_number[2]["matches"][0]["team_a_games"] is None
    assert rounds_by_number[2]["matches"][0]["team_b_games"] is None


def test_start_bracket_builds_a_seeded_knockout_round(client: TestClient, db_session: Session) -> None:
    admin_user, tournament = _seed_eight_player_active_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post(f"/api/tournaments/{tournament.id}/start-bracket")
    assert response.status_code == 200

    payload = response.json()
    bracket_round = payload["rounds"][-1]
    assert bracket_round["metadata"]["strategy"] == "bracket"
    assert bracket_round["metadata"]["bracket_stage"] == "Semifinals"
    assert len(bracket_round["matches"]) == 2
    assert payload["bracket_graph"][0]["title"] == "Semifinals"


def test_continue_bracket_builds_finals_and_small_final(client: TestClient, db_session: Session) -> None:
    admin_user, tournament = _seed_eight_player_active_tournament(db_session)
    client.cookies.set(settings.cookie_name, create_access_token(admin_user.id))

    response = client.post(f"/api/tournaments/{tournament.id}/start-bracket")
    assert response.status_code == 200
    semifinal_round = response.json()["rounds"][-1]

    for match, score in zip(semifinal_round["matches"], ((6, 3), (6, 4)), strict=True):
        response = client.post(
            f"/api/tournaments/matches/{match['id']}/score",
            json={"team_a_games": score[0], "team_b_games": score[1], "version": 1},
        )
        assert response.status_code == 200

    response = client.post(f"/api/tournaments/{tournament.id}/continue-bracket")
    assert response.status_code == 200

    payload = response.json()
    finals_round = payload["rounds"][-1]
    assert finals_round["metadata"]["bracket_stage"] == "Finals"
    assert len(finals_round["matches"]) == 2
