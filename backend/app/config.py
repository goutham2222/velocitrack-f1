import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    port: int = 8000
    host: str = "0.0.0.0"
    fastf1_cache_dir: str = os.getenv("FASTF1_CACHE_DIR", ".fastf1_cache")
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000,*"
    default_sampling_rate: int = 10
    log_level: str = "info"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def get_allowed_origins_list(self) -> List[str]:
        if self.allowed_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()

