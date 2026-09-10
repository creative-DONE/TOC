import pytest
import sys
from pathlib import Path
from datetime import datetime, timedelta

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal
from app.models.factory_models import Machine
from app.models.schedule_models import ProductionSchedule
from app.schemas.schemas import OrderCreate
from app.core.rush_insertion import evaluate_rush_order_insertion

@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    yield session
    session.close()

def test_rush_order_insertion_evaluation(db):
    machines = db.query(Machine).all()
    schedules = db.query(ProductionSchedule).all()

    mach_scheds = {m.id: [s for s in schedules if s.machine_id == m.id] for m in machines}

    rush_order = OrderCreate(
        order_number="RUSH-TEST-999",
        customer_name="Emergency Buyer",
        cloth_type="Cotton 100% Greige Knit",
        quantity_kg=400.0,
        colour_name="Royal Blue",
        colour_code="ROYAL_BLUE",
        due_date=datetime.utcnow() + timedelta(days=2),
        priority="EMERGENCY"
    )

    analysis = evaluate_rush_order_insertion(
        emergency_order=rush_order,
        existing_machine_schedules=mach_scheds,
        machines=machines,
        reference_now=datetime.utcnow()
    )

    assert "best_option" in analysis
    assert "all_candidates" in analysis
    assert analysis["total_options_evaluated"] > 0
    if analysis["best_option"]:
        assert analysis["best_option"]["recommended"] is True
