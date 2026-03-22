from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.db.base import Base
from app.services.player_accounts import ensure_primary_admin

engine = create_engine(settings.sqlalchemy_database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_db() -> None:
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_user_admin_column()
    _ensure_tournament_scoring_columns()
    _ensure_tournament_data_scope_column()
    _ensure_player_data_scope_column()
    _ensure_player_avatar_column()
    settings.avatars_dir.mkdir(parents=True, exist_ok=True)

    session = SessionLocal()
    try:
        ensure_primary_admin(session, "IAR")
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _ensure_user_admin_column() -> None:
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("users")}
    if "is_admin" in columns:
        return

    statement = (
        "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE"
        if engine.dialect.name == "postgresql"
        else "ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0"
    )
    with engine.begin() as connection:
        connection.execute(text(statement))


def _ensure_tournament_scoring_columns() -> None:
    inspector = inspect(engine)
    if "tournaments" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("tournaments")}
    statements: list[str] = []

    if "scoring_system" not in columns:
        statements.append("ALTER TABLE tournaments ADD COLUMN scoring_system VARCHAR(32) NOT NULL DEFAULT 'classic'")
    if "americano_points_target" not in columns:
        statements.append("ALTER TABLE tournaments ADD COLUMN americano_points_target INTEGER NULL")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def _ensure_tournament_data_scope_column() -> None:
    inspector = inspect(engine)
    if "tournaments" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("tournaments")}
    if "data_scope" in columns:
        return

    statement = "ALTER TABLE tournaments ADD COLUMN data_scope VARCHAR(16) NOT NULL DEFAULT 'PROD'"
    with engine.begin() as connection:
        connection.execute(text(statement))


def _ensure_player_data_scope_column() -> None:
    inspector = inspect(engine)
    if "players" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("players")}
    if "data_scope" in columns:
        return

    statement = "ALTER TABLE players ADD COLUMN data_scope VARCHAR(16) NOT NULL DEFAULT 'PROD'"
    with engine.begin() as connection:
        connection.execute(text(statement))


def _ensure_player_avatar_column() -> None:
    inspector = inspect(engine)
    if "players" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("players")}
    if "avatar_path" in columns:
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE players ADD COLUMN avatar_path VARCHAR(255) NULL"))
