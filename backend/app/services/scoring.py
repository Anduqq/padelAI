from __future__ import annotations

from dataclasses import dataclass


CLASSIC_SCORING = "classic"
AMERICANO_POINTS_SCORING = "americano_points"


@dataclass(slots=True)
class TournamentScoringConfig:
    scoring_system: str
    americano_points_target: int | None


def default_americano_points_target(active_player_count: int) -> int | None:
    if active_player_count == 8:
        return 17
    if active_player_count == 12:
        return 13
    return None


def resolve_tournament_scoring(
    *,
    tournament_format: str,
    scoring_system: str | None,
    americano_points_target: int | None,
    active_player_count: int,
) -> TournamentScoringConfig:
    if tournament_format != "americano":
        return TournamentScoringConfig(scoring_system=CLASSIC_SCORING, americano_points_target=None)

    requested_system = scoring_system or CLASSIC_SCORING
    if requested_system not in {CLASSIC_SCORING, AMERICANO_POINTS_SCORING}:
        raise ValueError("Unsupported scoring system.")

    if requested_system == CLASSIC_SCORING:
        return TournamentScoringConfig(scoring_system=CLASSIC_SCORING, americano_points_target=None)

    resolved_target = americano_points_target or default_americano_points_target(active_player_count)
    if resolved_target is None:
        raise ValueError("Enter the Americano points target for this player count.")

    return TournamentScoringConfig(
        scoring_system=AMERICANO_POINTS_SCORING,
        americano_points_target=resolved_target,
    )


def validate_match_score(
    *,
    scoring_system: str,
    americano_points_target: int | None,
    team_a_score: int,
    team_b_score: int,
) -> None:
    if scoring_system != AMERICANO_POINTS_SCORING:
        return

    if americano_points_target is None:
        raise ValueError("Americano points target is missing for this tournament.")

    winner_hits_target = (team_a_score == americano_points_target) ^ (team_b_score == americano_points_target)
    losing_score = min(team_a_score, team_b_score)

    if not winner_hits_target or losing_score >= americano_points_target:
        raise ValueError(f"One team must reach exactly {americano_points_target} points in Americano scoring.")
