from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ODOO_PORTAL_", env_file=".env")

    data_dir: Path = Path.home() / ".odoo-portal"
    db_url: str = ""
    api_host: str = "127.0.0.1"
    api_port: int = 8765
    frontend_dist: Path = Path(__file__).parent.parent.parent / "frontend" / "dist"

    def model_post_init(self, __context: object) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if not self.db_url:
            self.db_url = f"sqlite+aiosqlite:///{self.data_dir / 'portal.db'}"


settings = Settings()
