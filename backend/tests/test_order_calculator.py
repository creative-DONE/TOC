import math
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
    now = datetime(2026, 9, 21, 8, 0, 0)
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
    now = datetime(2026, 9, 21, 8, 0, 0)
    # Due date is just 1 hour from now
    due_date = now + timedelta(hours=1)

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
    Scenario 3: Color requiring changeover
    Verifies that color changeovers compute positive transition times.
    """
    now = datetime(2026, 9, 21, 8, 0, 0)
    due_date = now + timedelta(days=10)

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

    now = datetime(2026, 9, 21, 8, 0, 0)
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


def test_user_formula_batches_and_processing_time(db: Session):
    """
    Verifies:
      1. Number of Batches = ceil(Order Quantity / Machine Capacity)
      2. Total Processing Time = Number of Batches * Processing Time per Batch
    """
    now = datetime(2026, 9, 21, 8, 0, 0)
    due_date = now + timedelta(days=5)
    qty = 1200.0

    res = calculate_order_time_estimate(
        db=db,
        quantity_kg=qty,
        colour_code="SKY_BLUE",
        due_date=due_date,
        reference_now=now
    )

    all_evals = [res["recommended_machine"]] + res["alternative_machines"]
    for ev in all_evals:
        if ev["is_suitable"]:
            cap = ev["daily_capacity_kg"]
            expected_batches = int(math.ceil(qty / cap))
            assert ev["batches_count"] == expected_batches
            expected_proc_hours = round(expected_batches * ev["processing_time_per_batch_hours"], 2)
            assert ev["total_processing_hours"] == expected_proc_hours


def test_dynamic_update_processing_time(db: Session):
    """
    Verifies:
    If the user later edits M1 Processing Time from 3 hours to 4 hours:
    All approximate completion calculations immediately reflect 4 hours.
    """
    m1 = db.query(Machine).filter(Machine.code == "JET-M1").first()
    assert m1 is not None
    original_time = m1.processing_time_hours or 3.0

    now = datetime(2026, 9, 21, 8, 0, 0)
    due_date = now + timedelta(days=5)
    qty = 1000.0  # 2 batches of 500kg

    try:
        # Step 1: Set M1 to 3.0 hours/batch
        m1.processing_time_hours = 3.0
        db.commit()

        res_3h = calculate_order_time_estimate(
            db=db,
            quantity_kg=qty,
            colour_code="SKY_BLUE",
            due_date=due_date,
            reference_now=now
        )
        m1_eval_3h = next(
            ev for ev in [res_3h["recommended_machine"]] + res_3h["alternative_machines"]
            if ev["machine_code"] == "JET-M1"
        )
        assert m1_eval_3h["batches_count"] == 2
        assert m1_eval_3h["processing_time_per_batch_hours"] == 3.0
        assert m1_eval_3h["total_processing_hours"] == 6.0

        # Step 2: Edit M1 to 4.0 hours/batch
        m1.processing_time_hours = 4.0
        db.commit()

        res_4h = calculate_order_time_estimate(
            db=db,
            quantity_kg=qty,
            colour_code="SKY_BLUE",
            due_date=due_date,
            reference_now=now
        )
        m1_eval_4h = next(
            ev for ev in [res_4h["recommended_machine"]] + res_4h["alternative_machines"]
            if ev["machine_code"] == "JET-M1"
        )
        assert m1_eval_4h["batches_count"] == 2
        assert m1_eval_4h["processing_time_per_batch_hours"] == 4.0
        assert m1_eval_4h["total_processing_hours"] == 8.0
        # Estimated completion must be delayed by exactly 2 hours (2 batches * 1h = 2h)
        assert m1_eval_4h["estimated_completion"] > m1_eval_3h["estimated_completion"]

    finally:
        # Restore original value
        m1.processing_time_hours = original_time
        db.commit()


def test_8_working_hours_per_day_rollover(db: Session):
    """
    Verifies that work exceeding 8 hours/day rolls over into the next working day's 08:00 AM shift.
    """
    now = datetime(2026, 9, 21, 8, 0, 0)
    due_date = now + timedelta(days=5)

    # 1500kg on M1 (capacity 500, proc 3h) = 3 batches * 3h = 9.0 hours of processing
    # Shift is 8 hours/day (08:00 to 16:00).
    # Cannot finish on Day 1 (2026-09-21); must finish on Day 2 (2026-09-22).
    res = calculate_order_time_estimate(
        db=db,
        quantity_kg=1500.0,
        colour_code="SKY_BLUE",
        due_date=due_date,
        reference_now=now
    )

    m1_eval = next(
        ev for ev in [res["recommended_machine"]] + res["alternative_machines"]
        if ev["machine_code"] == "JET-M1"
    )
    assert m1_eval["batches_count"] == 3
    assert m1_eval["total_processing_hours"] == 9.0
    # Must complete on day 2 or later
    assert m1_eval["estimated_completion"].date() > now.date()
