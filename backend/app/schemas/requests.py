from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PlayerLoginRequest(BaseModel):
    player_id: str = Field(min_length=1, max_length=36)


class PlayerCreateRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=255)

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, display_name: str) -> str:
        normalized = " ".join(display_name.strip().split())
        if len(normalized) < 2:
            raise ValueError("Display name must be at least 2 characters long.")
        return normalized


class TournamentCreateRequest(BaseModel):
    name: str = Field(min_length=3, max_length=255)
    format: Literal["americano", "mexicano"]
    court_count: int = Field(default=2, ge=1, le=8)
    target_rounds: int | None = Field(default=None, ge=1, le=30)
    participant_ids: list[str] = Field(min_length=4)

    @field_validator("participant_ids")
    @classmethod
    def validate_participant_ids(cls, participant_ids: list[str]) -> list[str]:
        if len(participant_ids) != len(set(participant_ids)):
            raise ValueError("Participant list contains duplicates.")
        return participant_ids


class ScoreUpdateRequest(BaseModel):
    team_a_games: int = Field(ge=0, le=99)
    team_b_games: int = Field(ge=0, le=99)
    version: int = Field(ge=1)
