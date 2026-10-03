"""Application settings (pydantic-settings, reads server/.env).

Rules (spec §5):
- GOOGLE_APPLICATION_CREDENTIALS is resolved relative to /server.
- If GOOGLE_CLOUD_PROJECT is empty, project_id is read from the key file.
- On startup we log whether the key file exists (never its contents). Without it, the
  effective LLM mode is "demo".
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parent.parent
# Overridable so tests (tests/conftest.py) run against a temporary copy and never touch the real data or uploads.
DATA_DIR = Path(os.environ.get("AMC_DATA_DIR") or SERVER_DIR / "data")
UPLOADS_DIR = Path(os.environ.get("AMC_UPLOADS_DIR") or SERVER_DIR / "uploads")
PROMPTS_DIR = SERVER_DIR / "prompts"

log = logging.getLogger("amc.config")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=SERVER_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Agentic Motor Claims"
    insurer_name: str = "ABC General Insurance"
    demo_mode: bool = True
    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_expires_minutes: int = 480

    google_application_credentials: str = "credentials/vertex-key.json"
    google_cloud_project: str = ""
    google_cloud_location: str = "global"
    gemini_model: str = "gemini-3.7-flash"
    gemini_timeout_seconds: int = 45
    gemini_max_retries: int = 3

    llm_mode: Literal["auto", "live", "demo"] = "auto"
    pipeline_min_step_ms: int = 1200
    cors_origins: str = Field(default="http://localhost:5173")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def credentials_path(self) -> Path:
        p = Path(self.google_application_credentials)
        return p if p.is_absolute() else (SERVER_DIR / p).resolve()

    @property
    def credentials_present(self) -> bool:
        return self.credentials_path.is_file()

    @property
    def project_id(self) -> str | None:
        if self.google_cloud_project:
            return self.google_cloud_project
        if not self.credentials_present:
            return None
        try:
            return json.loads(self.credentials_path.read_text(encoding="utf-8")).get("project_id")
        except (OSError, ValueError):
            return None

    @property
    def effective_llm_mode(self) -> Literal["live", "demo", "auto"]:
        """Without a key file the only possible mode is demo."""
        return self.llm_mode if self.credentials_present else "demo"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def log_startup_state(settings: Settings) -> None:
    """Log configuration state without revealing secrets."""
    if settings.credentials_present:
        log.info("Vertex key file found (%s). LLM mode: %s", settings.credentials_path.name, settings.effective_llm_mode)
    else:
        log.warning(
            "Vertex key file not found at server/%s - running in demo mode (AI responses are pre-recorded).",
            settings.google_application_credentials,
        )
    if settings.jwt_secret.startswith("change-me"):
        log.warning("JWT_SECRET is the placeholder value - set a long random string in server/.env.")
