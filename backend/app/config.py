"""Runtime settings loaded from environment / .env.

Missing API keys switch the corresponding integration to mock mode so the
project runs end to end without any credentials.
"""
from __future__ import annotations

from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    demo_today: str = ""  # empty = real date; set to pin a day (YYYY-MM-DD)
    data_dir: Path = BACKEND_DIR / "data"
    runtime_dir: Path = BACKEND_DIR / "data" / "runtime"
    # Comma-separated list of allowed frontend origins, or "*" to allow any origin.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    # Public URL of this API, used to build absolute links (e.g. dossier PDFs).
    public_base_url: str = "http://localhost:8000"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5-5"

    elevenlabs_api_key: str = ""
    elevenlabs_agent_id: str = ""

    # Demo value only, NOT a real MyInvestor offer. Annual rate as a decimal string.
    mock_savings_rate: Decimal = Decimal("0.025")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def anthropic_enabled(self) -> bool:
        return bool(self.anthropic_api_key.strip())

    @property
    def elevenlabs_enabled(self) -> bool:
        return bool(self.elevenlabs_api_key.strip() and self.elevenlabs_agent_id.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
