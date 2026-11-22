from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "VUS OnePortal API"
    secret_key: str = "local-development-secret-change-before-deploy-32-chars"
    sensitive_data_key: str = "local-development-encryption-key-change-before-deploy"
    database_url: str = "postgresql+asyncpg://vus:vus@localhost:5432/vus_oneportal"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:3000"
    demo_mode: bool = True
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    payment_webhook_secret: str = "local-development-webhook-secret"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
