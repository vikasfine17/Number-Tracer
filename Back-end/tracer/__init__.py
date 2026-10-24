from pathlib import Path
from dotenv import load_dotenv

# Automatically load .env if present
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    load_dotenv(_env)

from .pipeline import trace

__all__ = ["trace"]

