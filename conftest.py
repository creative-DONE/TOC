import sys
from pathlib import Path
import pytest

backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal

@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()
