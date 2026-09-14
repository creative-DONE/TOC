import pytest
import sys
from pathlib import Path
from datetime import datetime, timedelta

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal
from app.models.factory_models import Machine
from app.core.dynamic_rescheduler import handle_machine_breakdown_disruption

@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    yield session
    session.close()

def test_machine_breakdown_dynamic_rescheduling(db):
    machine = db.query(Machine).first()
    assert machine is not None

    orig_status = machine.status
    try:
        now = datetime.utcnow()
        res = handle_machine_breakdown_disruption(
            db=db,
            machine_id=machine.id,
            breakdown_start=now,
            duration_hours=6.0,
            description="Test motor failure"
        )

        assert "event_id" in res
        assert "machine_name" in res
        assert "affected_count" in res
        assert machine.status == "BREAKDOWN"
    finally:
        machine.status = orig_status
        db.commit()
