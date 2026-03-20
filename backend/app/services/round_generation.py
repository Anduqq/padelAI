from __future__ import annotations

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


def validate_supported_player_count(player_ids: list[str], court_count: int) -> None:
    if len(player_ids) != court_count * 4:
        raise ValueError("V1 requires exactly 4 players per court.")
    if len(player_ids) % 4 != 0:
        raise ValueError("Player count must be divisible by 4.")


def _round_robin_partnerships(player_ids: list[str]) -> list[list[tuple[str, str]]]:
    players = list(player_ids)
    if len(players) % 2 != 0:
        raise ValueError("Round robin partnership generation requires an even player count.")

    fixed = players[0]
    rotating = players[1:]
    rounds: list[list[tuple[str, str]]] = []

    for _ in range(len(players) - 1):
        current = [fixed, *rotating]
        pairings: list[tuple[str, str]] = []

        for index in range(len(players) // 2):
            pairings.append((current[index], current[-(index + 1)]))

        rounds.append(pairings)
        rotating = [rotating[-1], *rotating[:-1]]

    return rounds


def generate_americano_schedule(player_ids: list[str], court_count: int) -> list[RoundSpec]:
    validate_supported_player_count(player_ids, court_count)
    partnership_rounds = _round_robin_partnerships(player_ids)
    rounds: list[RoundSpec] = []

    for round_number, partnerships in enumerate(partnership_rounds, start=1):
        matches: list[MatchSpec] = []
        for partnership_index in range(0, len(partnerships), 2):
            team_a = partnerships[partnership_index]
            team_b = partnerships[partnership_index + 1]
            matches.append(
                MatchSpec(
                    court_number=(partnership_index // 2) + 1,
                    team_a=team_a,
                    team_b=team_b,
                )
            )

        rounds.append(
            RoundSpec(
                number=round_number,
                matches=matches,
                metadata={"strategy": "americano", "type": "pre_generated"},
            )
        )

    return rounds


def generate_mexicano_round(player_ids_by_ranking: list[str], court_count: int, round_number: int) -> RoundSpec:
    validate_supported_player_count(player_ids_by_ranking, court_count)
    matches: list[MatchSpec] = []

    for group_index in range(court_count):
        start = group_index * 4
        group = player_ids_by_ranking[start : start + 4]
        if len(group) != 4:
            raise ValueError("Each Mexicano group must contain exactly 4 players.")

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
        metadata={"strategy": "mexicano", "type": "dynamic", "ranking_order": player_ids_by_ranking},
    )
