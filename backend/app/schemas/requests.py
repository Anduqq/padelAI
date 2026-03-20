from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


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
