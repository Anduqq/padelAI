from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Padel By Claudiu"
    database_url: str = Field(default="postgresql+psycopg://padel:padel@db:5432/padel", alias="DATABASE_URL")
    secret_key: str = Field(default="change-me-before-production", alias="SECRET_KEY")
    access_token_expire_minutes: int = Field(default=60 * 24 * 7, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    cookie_name: str = Field(default="padel_session", alias="COOKIE_NAME")
    secure_cookies: bool = Field(default=True, alias="SECURE_COOKIES")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")

    @property
    def frontend_dist_dir(self) -> Path:
        return Path(__file__).resolve().parents[1] / "static"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
