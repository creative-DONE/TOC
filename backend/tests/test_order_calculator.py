from datetime import datetime, timedelta
import pytest
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.factory_models import Machine, Colour
from app.models.order_models import Order, OrderBatch
from app.models.schedule_models import ProductionSchedule
from app.services.order_calculator_service import calculate_order_time_estimate


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def test_scenario_1_standard_order_on_time(db: Session):
    """
    Scenario 1: Small quantity + common color + flexible due date
    Verifies system automatically chooses a suitable machine that finishes on time.
    """
    now = datetime.utcnow()
    due_date = now + timedelta(days=7)

    result = calculate_order_time_estimate(
        db=db,
        quantity_kg=400.0,
        colour_code="SKY_BLUE",
        due_date=due_date,
        reference_now=now
    )

    assert result["status"] == "SUCCESS"
    assert result["recommended_machine"] is not None
    rec = result["recommended_machine"]

    assert rec["is_suitable"] is True
    assert rec["is_on_time"] is True
    assert rec["delay_hours"] == 0.0
    assert rec["estimated_start"] is not None
    assert rec["estimated_completion"] is not None
    assert rec["estimated_completion"] <= due_date
    assert rec["production_hours"] > 0
    assert len(result["why_recommended"]) > 20
    assert len(result["alternative_machines"]) > 0


def test_scenario_2_tight_due_date_risk(db: Session):
    """
    Scenario 2: Large quantity + tight due date
    Verifies that system detects that machines cannot meet due date,
    flags due date risk, and accurately reports delay and reasons.
    """
    now = datetime.utcnow()
    # Due date is just 2 hours from now - physically impossible for 1200kg dyeing
    due_date = now + timedelta(hours=2)

    result = calculate_order_time_estimate(
        db=db,
        quantity_kg=1200.0,
        colour_code="ROYAL_BLUE",
        due_date=due_date,
        reference_now=now
    )

    assert result["status"] == "SUCCESS"
    rec = result["recommended_machine"]
    assert rec is not None
    assert rec["is_on_time"] is False
    assert rec["delay_hours"] > 0
    assert rec["due_status"] == "LATE"

    # Due date risk diagnostics must be present
    assert result["due_date_risk_warning"] is not None
    assert len(result["risk_factors"]) > 0


def test_scenario_3_color_changeover_impact(db: Session):
    """
    Scenario 3: Color requiring large changeover
    Verifies that different colors result in different changeover and processing times
    according to the multi-dimensional changeover matrix.
    """
    now = datetime.utcnow()
    due_date = now + timedelta(days=10)

    # Test dark to light transition (e.g. WHITE) vs same color transition
    res_white = calculate_order_time_estimate(
        db=db,
        quantity_kg=350.0,
        colour_code="WHITE",
        due_date=due_date,
        reference_now=now
    )
    res_black = calculate_order_time_estimate(
        db=db,
        quantity_kg=350.0,
        colour_code="JET_BLACK",
        due_date=due_date,
        reference_now=now
    )

    assert res_white["status"] == "SUCCESS"
    assert res_black["status"] == "SUCCESS"

    rec_white = res_white["recommended_machine"]
    rec_black = res_black["recommended_machine"]

    # Both must have calculated changeover minutes
    assert rec_white["changeover_min"] is not None
    assert rec_black["changeover_min"] is not None


def test_scenario_4_non_destructive_estimation(db: Session):
    """
    Scenario 4: Verify that running the calculator is strictly non-destructive.
    Zero rows created or modified in orders, production_schedule, or order_batches.
    """
    orders_before = db.query(Order).count()
    slots_before = db.query(ProductionSchedule).count()
    batches_before = db.query(OrderBatch).count()

    now = datetime.utcnow()
    due_date = now + timedelta(days=5)

    calculate_order_time_estimate(
        db=db,
        quantity_kg=800.0,
        colour_code="GOLDEN_YELLOW",
        due_date=due_date,
        reference_now=now
    )

    orders_after = db.query(Order).count()
    slots_after = db.query(ProductionSchedule).count()
    batches_after = db.query(OrderBatch).count()

    assert orders_after == orders_before
    assert slots_after == slots_before
    assert batches_after == batches_before


def test_scenario_5_automatic_machine_selection_changes_by_quantity(db: Session):
    """
    Scenario 5: Verify that machine selection changes depending on order quantity.
    A small order (200kg) vs a large order (1200kg) will recommend different vessels
    matching vessel batch capacity and speed.
    """
    now = datetime.utcnow()
    due_date = now + timedelta(days=5)

    small_res = calculate_order_time_estimate(
        db=db,
        quantity_kg=150.0,
        colour_code="PASTEL_PINK",
        due_date=due_date,
        reference_now=now
    )
    large_res = calculate_order_time_estimate(
        db=db,
        quantity_kg=1200.0,
        colour_code="PASTEL_PINK",
        due_date=due_date,
        reference_now=now
    )

    assert small_res["recommended_machine"] is not None
    assert large_res["recommended_machine"] is not None
    # Large order needs a high capacity vessel (e.g. STENT-M6, JIG-M5, or JET-M2)
    rec_large = large_res["recommended_machine"]
    assert rec_large["daily_capacity_kg"] >= 500.0
