from __future__ import annotations

from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.models import Player

ALLOWED_AVATAR_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_AVATAR_BYTES = 3 * 1024 * 1024


def build_avatar_url(player: Player | None) -> str | None:
    if player is None or not player.avatar_path:
        return None
    return f"/media/{player.avatar_path}"


def validate_avatar_upload(upload: UploadFile, content: bytes) -> str:
    extension = ALLOWED_AVATAR_TYPES.get(upload.content_type or "")
    if extension is None:
        raise ValueError("Avatar must be a JPG, PNG, or WEBP image.")
    if not content:
        raise ValueError("Avatar upload was empty.")
    if len(content) > MAX_AVATAR_BYTES:
        raise ValueError("Avatar must be smaller than 3 MB.")
    return extension


def replace_player_avatar(player_id: str, extension: str, content: bytes) -> str:
    settings.avatars_dir.mkdir(parents=True, exist_ok=True)
    for existing_file in settings.avatars_dir.glob(f"{player_id}.*"):
        existing_file.unlink(missing_ok=True)

    avatar_name = f"{player_id}{extension}"
    avatar_path = settings.avatars_dir / avatar_name
    avatar_path.write_bytes(content)
    return str(Path("avatars") / avatar_name).replace("\\", "/")
