from collections import Counter, defaultdict

from app.services.round_generation import generate_americano_schedule, generate_mexicano_round


def _match_signature(team_a: tuple[str, str], team_b: tuple[str, str]) -> frozenset[frozenset[str]]:
    return frozenset((frozenset(team_a), frozenset(team_b)))


def _collect_partner_map(rounds):
    partner_map: dict[str, set[str]] = defaultdict(set)
    bench_rounds: list[tuple[str, ...]] = []
    seen_matches: set[frozenset[frozenset[str]]] = set()

    for round_spec in rounds:
        bench_players = tuple(round_spec.metadata.get("bench_player_ids", []))
        bench_rounds.append(bench_players)
        seen_this_round = set(bench_players)

        for match in round_spec.matches:
            players = [*match.team_a, *match.team_b]
            assert len(players) == len(set(players))
            assert seen_this_round.isdisjoint(players)
            seen_this_round.update(players)

            for team in (match.team_a, match.team_b):
                left, right = team
                partner_map[left].add(right)
                partner_map[right].add(left)

            signature = _match_signature(match.team_a, match.team_b)
            assert signature not in seen_matches
            seen_matches.add(signature)

    return partner_map, bench_rounds


def test_americano_with_8_players_uses_7_unique_partner_rounds() -> None:
    players = [f"p{index}" for index in range(1, 9)]
    rounds = generate_americano_schedule(players, court_count=2)
    partner_map, bench_rounds = _collect_partner_map(rounds)

    assert len(rounds) == 7
    assert all(len(bench) == 0 for bench in bench_rounds)
    assert all(len(partner_map[player_id]) == 7 for player_id in players)


def test_americano_with_9_players_rotates_the_bench_fairly() -> None:
    players = [f"p{index}" for index in range(1, 10)]
    rounds = generate_americano_schedule(players, court_count=2)
    partner_map, bench_rounds = _collect_partner_map(rounds)

    assert len(rounds) == 9
    assert all(len(bench) == 1 for bench in bench_rounds)
    assert all(previous != current for previous, current in zip(bench_rounds, bench_rounds[1:]))

    bench_counts = Counter(player_id for bench in bench_rounds for player_id in bench)
    assert all(bench_counts[player_id] == 1 for player_id in players)
    assert all(len(partner_map[player_id]) == 8 for player_id in players)


def test_americano_supports_single_court_four_player_sessions() -> None:
    players = [f"p{index}" for index in range(1, 5)]
    rounds = generate_americano_schedule(players, court_count=1)
    partner_map, bench_rounds = _collect_partner_map(rounds)

    assert len(rounds) == 3
    assert all(len(bench) == 0 for bench in bench_rounds)
    assert all(len(partner_map[player_id]) == 3 for player_id in players)


def test_americano_supports_twelve_players_across_three_courts() -> None:
    players = [f"p{index}" for index in range(1, 13)]
    rounds = generate_americano_schedule(players, court_count=3)
    partner_map, bench_rounds = _collect_partner_map(rounds)

    assert len(rounds) == 11
    assert all(len(bench) == 0 for bench in bench_rounds)
    assert all(len(partner_map[player_id]) == 11 for player_id in players)


def test_mexicano_avoids_benching_the_same_player_twice_in_a_row_when_one_bench_exists() -> None:
    players = [f"p{index}" for index in range(1, 10)]
    first_round = generate_mexicano_round(players, court_count=2, round_number=1, previous_rounds_metadata=[])
    second_round = generate_mexicano_round(
        players,
        court_count=2,
        round_number=2,
        previous_rounds_metadata=[first_round.metadata],
    )

    assert len(first_round.metadata["bench_player_ids"]) == 1
    assert len(second_round.metadata["bench_player_ids"]) == 1
    assert first_round.metadata["bench_player_ids"] != second_round.metadata["bench_player_ids"]
