import pytest
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal
from app.models.order_models import Order, ReadinessStatus
from app.core.readiness import evaluate_order_readiness, find_smart_ready_swap

@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    yield session
    session.close()

def test_order_readiness_evaluation(db):
    order = db.query(Order).first()
    assert order is not None

    readiness = evaluate_order_readiness(order, db)
    assert "fabric_available" in readiness
    assert "dye_available" in readiness
    assert "operator_available" in readiness
    assert "machine_available" in readiness
    assert "lab_dip_approved" in readiness
    assert "status" in readiness
    assert readiness["status"] in ["READY", "PARTIALLY_READY", "NOT_READY"]

def test_smart_ready_swap(db):
    # Find an unready order or create one
    unready = db.query(Order).filter(Order.readiness_status == ReadinessStatus.NOT_READY.value).first()
    if not unready:
        unready = db.query(Order).first()
        unready.readiness_status = ReadinessStatus.NOT_READY.value
        db.commit()

    ready_swap = find_smart_ready_swap(unready, db)
    if ready_swap:
        assert ready_swap.id != unready.id
        assert ready_swap.readiness_status == ReadinessStatus.READY.value
