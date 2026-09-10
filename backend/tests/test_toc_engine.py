import pytest
import sys
from pathlib import Path
from datetime import datetime, timedelta

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal, Base, engine
from app.models.factory_models import Machine, FactoryUtility
from app.models.order_models import Order
from app.core.toc_engine import identify_system_bottleneck, generate_five_focusing_steps

@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    yield session
    session.close()

def test_identify_system_bottleneck(db):
    machines = db.query(Machine).all()
    orders = db.query(Order).all()
    utilities = db.query(FactoryUtility).all()

    assert len(machines) > 0
    assert len(orders) > 0

    bottleneck = identify_system_bottleneck(machines, orders, utilities, horizon_days=7)
    
    assert "current_bottleneck_type" in bottleneck
    assert "resource_code" in bottleneck
    assert "utilization_pct" in bottleneck
    assert "recommendation" in bottleneck
    assert "five_focusing_steps" in bottleneck
    assert bottleneck["utilization_pct"] >= 0.0

def test_five_focusing_steps():
    steps = generate_five_focusing_steps("Jet Dyeing Machine M2", "MACHINE")
    assert "step_1_identify" in steps
    assert "step_2_exploit" in steps
    assert "step_3_subordinate" in steps
    assert "step_4_elevate" in steps
    assert "step_5_repeat" in steps
    assert "Jet Dyeing Machine M2" in steps["step_1_identify"]
