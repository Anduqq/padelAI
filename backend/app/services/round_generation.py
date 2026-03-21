from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass


@dataclass(slots=True)
class MatchSpec:
    court_number: int
    team_a: tuple[str, str]
    team_b: tuple[str, str]


@dataclass(slots=True)
class RoundSpec:
    number: int
    matches: list[MatchSpec]
    metadata: dict


@dataclass(slots=True)
class ScheduleCapacity:
    active_courts: int
    active_player_count: int
    bench_count: int


def get_schedule_capacity(player_ids: list[str], court_count: int) -> ScheduleCapacity:
    active_courts = min(court_count, len(player_ids) // 4)
    active_player_count = active_courts * 4
    bench_count = len(player_ids) - active_player_count

    if active_player_count < 4:
        raise ValueError("At least four players are required.")
    if bench_count not in (0, 1):
        raise ValueError("This version supports full courts plus at most one benched player per round.")

    return ScheduleCapacity(
        active_courts=active_courts,
        active_player_count=active_player_count,
        bench_count=bench_count,
    )


def validate_supported_player_count(player_ids: list[str], court_count: int) -> None:
    get_schedule_capacity(player_ids, court_count)


def _round_robin_partnerships(player_ids: list[str]) -> list[tuple[list[tuple[str, str]], list[str]]]:
    players: list[str | None] = list(player_ids)
    if len(players) % 2 == 1:
        players.append(None)

    fixed = players[0]
    rotating = players[1:]
    rounds: list[tuple[list[tuple[str, str]], list[str]]] = []

    for _ in range(len(players) - 1):
        current = [fixed, *rotating]
        pairings: list[tuple[str, str]] = []
        bench_players: list[str] = []

        for index in range(len(players) // 2):
            left = current[index]
            right = current[-(index + 1)]

            if left is None and right is None:
                continue
            if left is None and right is not None:
                bench_players.append(right)
                continue
            if right is None and left is not None:
                bench_players.append(left)
                continue
            if left is None or right is None:
                continue

            pairings.append((left, right))

        rounds.append((pairings, bench_players))
        rotating = [rotating[-1], *rotating[:-1]]

    return rounds


def _build_matches_from_partnerships(partnerships: list[tuple[str, str]]) -> list[MatchSpec]:
    if len(partnerships) % 2 != 0:
        raise ValueError("Partnership count must be divisible by two to form matches.")

    matches: list[MatchSpec] = []
    for partnership_index in range(0, len(partnerships), 2):
        matches.append(
            MatchSpec(
                court_number=(partnership_index // 2) + 1,
                team_a=partnerships[partnership_index],
                team_b=partnerships[partnership_index + 1],
            )
        )
    return matches


def generate_americano_schedule(player_ids: list[str], court_count: int) -> list[RoundSpec]:
    capacity = get_schedule_capacity(player_ids, court_count)
    partnership_rounds = _round_robin_partnerships(player_ids)
    rounds: list[RoundSpec] = []

    for round_number, (partnerships, bench_players) in enumerate(partnership_rounds, start=1):
        if len(partnerships) != capacity.active_player_count // 2:
            raise ValueError("Generated partnership count does not match the available courts.")

        rounds.append(
            RoundSpec(
                number=round_number,
                matches=_build_matches_from_partnerships(partnerships),
                metadata={
                    "strategy": "americano",
                    "type": "pre_generated",
                    "rotation_order": list(player_ids),
                    "schedule_index": round_number - 1,
                    "bench_player_ids": bench_players,
                },
            )
        )

    return rounds


def _build_bench_history(previous_rounds_metadata: list[dict] | None) -> tuple[dict[str, int], set[str]]:
    counts: dict[str, int] = defaultdict(int)
    last_benched: set[str] = set()

    for metadata in previous_rounds_metadata or []:
        current_bench = set(metadata.get("bench_player_ids", []))
        for player_id in current_bench:
            counts[player_id] += 1
        if current_bench:
            last_benched = current_bench

    return counts, last_benched


def _select_benched_players(
    player_ids_by_ranking: list[str],
    bench_count: int,
    previous_rounds_metadata: list[dict] | None,
) -> list[str]:
    if bench_count == 0:
        return []

    bench_history, last_benched = _build_bench_history(previous_rounds_metadata)
    ranking_index = {player_id: index for index, player_id in enumerate(player_ids_by_ranking)}
    ordered = sorted(
        player_ids_by_ranking,
        key=lambda player_id: (
            bench_history.get(player_id, 0),
            1 if player_id in last_benched else 0,
            -ranking_index[player_id],
        ),
    )
    return ordered[:bench_count]


def generate_mexicano_round(
    player_ids_by_ranking: list[str],
    court_count: int,
    round_number: int,
    previous_rounds_metadata: list[dict] | None = None,
) -> RoundSpec:
    capacity = get_schedule_capacity(player_ids_by_ranking, court_count)
    bench_players = _select_benched_players(player_ids_by_ranking, capacity.bench_count, previous_rounds_metadata)
    bench_player_ids = set(bench_players)
    active_players = [player_id for player_id in player_ids_by_ranking if player_id not in bench_player_ids]

    matches: list[MatchSpec] = []
    for group_index in range(capacity.active_courts):
        start = group_index * 4
        group = active_players[start : start + 4]
        if len(group) != 4:
            raise ValueError("Each Mexicano group must contain exactly four active players.")

        matches.append(
            MatchSpec(
                court_number=group_index + 1,
                team_a=(group[0], group[3]),
                team_b=(group[1], group[2]),
            )
        )

    return RoundSpec(
        number=round_number,
        matches=matches,
        metadata={
            "strategy": "mexicano",
            "type": "dynamic",
            "ranking_order": list(player_ids_by_ranking),
            "bench_player_ids": bench_players,
        },
    )
