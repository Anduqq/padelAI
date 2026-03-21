from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "IAR PADEL"
    database_url: str | None = Field(default=None, alias="DATABASE_URL")
    postgres_db: str = Field(default="padel", alias="POSTGRES_DB")
    postgres_user: str = Field(default="padel", alias="POSTGRES_USER")
    postgres_password: str | None = Field(default=None, alias="POSTGRES_PASSWORD")
    postgres_host: str = Field(default="db", alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    secret_key: str = Field(default="change-me-before-production", alias="SECRET_KEY")
    access_token_expire_minutes: int = Field(default=60 * 24 * 7, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    cookie_name: str = Field(default="padel_session", alias="COOKIE_NAME")
    secure_cookies: bool = Field(default=True, alias="SECURE_COOKIES")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    media_dir_override: str | None = Field(default=None, alias="MEDIA_DIR")

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        if not self.postgres_password:
            raise ValueError("POSTGRES_PASSWORD or DATABASE_URL must be configured.")
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def frontend_dist_dir(self) -> Path:
        return Path(__file__).resolve().parents[1] / "static"

    @property
    def media_dir(self) -> Path:
        if self.media_dir_override:
            return Path(self.media_dir_override)
        return Path(__file__).resolve().parents[2] / "media"

    @property
    def avatars_dir(self) -> Path:
        return self.media_dir / "avatars"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
