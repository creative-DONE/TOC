import pytest
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import Base
from app.models.factory_models import (
    Machine, MachineMaintenance, FactoryUtility, Employee, MachineStatus, MachineType
)
from app.models.order_models import Order, Customer, OrderStatus, OrderBatch
from app.models.schedule_models import ProductionSchedule
from app.schemas.schemas import MatrixEditRequest
from app.services.scheduler_service import (
    optimize_factory_schedule, calculate_machine_daily_capacity, validate_daily_schedule_capacity
)
from app.services.matrix_service import execute_matrix_action, get_planning_matrix_data


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Standard 6-machine fleet with explicit daily capacities
    m1 = Machine(id=1, code="JET-M1", name="Jet Dyeing Machine M1", machine_type=MachineType.JET_DYEING.value,
                 capacity_kg=500.0, max_batch_kg=500.0, min_batch_kg=50.0, efficiency=0.92, status=MachineStatus.AVAILABLE.value,
                 compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend,Rayon Viscose")
    m2 = Machine(id=2, code="JET-M2", name="Jet Dyeing Machine M2", machine_type=MachineType.JET_DYEING.value,
                 capacity_kg=800.0, max_batch_kg=800.0, min_batch_kg=50.0, efficiency=0.94, status=MachineStatus.AVAILABLE.value,
                 compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend,Viscose,Modal")
    m3 = Machine(id=3, code="SOFT-M3", name="Soft Flow Vessel M3 (Delicate)", machine_type=MachineType.SOFT_FLOW.value,
                 capacity_kg=400.0, max_batch_kg=400.0, min_batch_kg=50.0, efficiency=0.88, status=MachineStatus.AVAILABLE.value,
                 compatible_cloth_types="Silk,Wool,Bamboo,Modal,Rayon Viscose,Organic Cotton")
    m4 = Machine(id=4, code="SOFT-M4", name="Soft Flow Vessel M4", machine_type=MachineType.SOFT_FLOW.value,
                 capacity_kg=600.0, max_batch_kg=600.0, min_batch_kg=50.0, efficiency=0.91, status=MachineStatus.AVAILABLE.value,
                 compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend,Viscose,Nylon")
    m5 = Machine(id=5, code="JIG-M5", name="Jumbo Jigger M5", machine_type=MachineType.JIGGER.value,
                 capacity_kg=1000.0, max_batch_kg=1000.0, min_batch_kg=100.0, efficiency=0.95, status=MachineStatus.AVAILABLE.value,
                 compatible_cloth_types="Denim,Twill,Heavy Canvas,Cotton Duck,Linen")
    m6 = Machine(id=6, code="STENT-M6", name="Continuous Stenter M6", machine_type=MachineType.STENTER_FINISHING.value,
                 capacity_kg=1500.0, max_batch_kg=1500.0, min_batch_kg=100.0, efficiency=0.96, status=MachineStatus.AVAILABLE.value,
                 compatible_cloth_types="Polyester,Poly-Cotton Blend,Nylon,Viscose,Cotton Woven")
    session.add_all([m1, m2, m3, m4, m5, m6])

    cust = Customer(id=1, name="Prime Global Textile Client", code="CUST-PRIME", importance_weight=1.2)
    session.add(cust)

    op = Employee(id=1, code="EMP-1", name="Senior Master Operator", role="OPERATOR", on_leave=False)
    session.add(op)

    u1 = FactoryUtility(name="Steam", current_load_per_hour=20.0, capacity_per_hour=100.0, unit="kg/hr")
    u2 = FactoryUtility(name="Water", current_load_per_hour=30.0, capacity_per_hour=100.0, unit="m3/hr")
    u3 = FactoryUtility(name="Electricity", current_load_per_hour=25.0, capacity_per_hour=100.0, unit="kW")
    session.add_all([u1, u2, u3])
    session.commit()

    yield session
    session.close()


def test_daily_capacity_calculation(test_db):
    """Test that machine daily capacities reset and reflect maintenance windows."""
    now = datetime(2026, 9, 12, 8, 0, 0)
    m1 = test_db.query(Machine).filter(Machine.code == "JET-M1").first()
    assert calculate_machine_daily_capacity(m1, 1, now) == 500.0
    assert calculate_machine_daily_capacity(m1, 2, now) == 500.0

    # Simulate 12 hours maintenance on Day 2
    maint = MachineMaintenance(
        machine_id=m1.id,
        title="12h Scheduled Servicing",
        maintenance_type="PREVENTIVE",
        start_time=now + timedelta(days=1, hours=2),
        end_time=now + timedelta(days=1, hours=14),
        status="SCHEDULED"
    )
    test_db.add(maint)
    test_db.commit()

    cap_day2 = calculate_machine_daily_capacity(m1, 2, now, {m1.id: [maint]})
    assert cap_day2 < 500.0
    assert cap_day2 == 250.0  # 12 hours out of 24 -> 50% capacity


def test_demand_greater_than_day1_capacity_distributes_across_days(test_db):
    """
    Section 5 and 31:
    Total Day 1 theoretical capacity = 4,800 kg.
    Create orders totaling 7,000 kg.
    Verify:
    1. Day 1 load <= 4,800 kg.
    2. NO machine exceeds daily capacity on Day 1 or any subsequent day.
    3. Excess work flows to Day 2 and Day 3.
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    order_specs = [
        ("ORD-101", 1000.0, "Poly-Cotton 65/35 Blend", now + timedelta(days=2)),
        ("ORD-102", 1200.0, "Single Jersey 100% Cotton", now + timedelta(days=2)),
        ("ORD-103", 800.0,  "Rayon Viscose Fabric", now + timedelta(days=3)),
        ("ORD-104", 1000.0, "Heavy Canvas Cotton Duck", now + timedelta(days=3)),
        ("ORD-105", 1200.0, "Polyester Microfiber Interlock", now + timedelta(days=4)),
        ("ORD-106", 900.0,  "Single Jersey 100% Cotton", now + timedelta(days=4)),
        ("ORD-107", 900.0,  "Poly-Cotton 65/35 Blend", now + timedelta(days=5)),
    ]
    for num, qty, cloth, due in order_specs:
        o = Order(
            order_number=num, customer_id=1, cloth_type=cloth, colour_name="Navy Blue",
            colour_code="NAVY", quantity_kg=qty, due_date=due, status="PENDING"
        )
        test_db.add(o)
    test_db.commit()

    res = optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=True)
    assert res["status"] == "OPTIMIZED"

    # Validate that daily capacity was NEVER exceeded on any machine on any day
    is_valid, errors = validate_daily_schedule_capacity(test_db, reference_now=now, horizon_days=7)
    assert is_valid, f"Validation failed with errors: {errors}"

    matrix_data = get_planning_matrix_data(test_db, horizon_days=7, reference_now=now)
    day_summaries = matrix_data["day_summary"]

    day1 = day_summaries[0]
    assert day1["day"] == 1
    assert day1["total_kg"] <= 4800.0
    assert day1["total_kg"] > 0.0

    total_scheduled = sum(ds["total_kg"] for ds in day_summaries)
    assert abs(total_scheduled - 7000.0) < 1.0

    # Excess work MUST have moved to Day 2 or later
    day2 = day_summaries[1]
    assert day2["total_kg"] > 0.0, "Day 2 must contain work since Day 1 alone cannot process 7,000 kg!"

    # Check each machine on each day
    for ds in day_summaries:
        for mb in ds.get("machine_breakdown", []):
            assert mb["load_kg"] <= mb["capacity_kg"] + 0.1, (
                f"Machine {mb['code']} on Day {ds['day']} has load {mb['load_kg']} exceeding capacity {mb['capacity_kg']}"
            )


def test_order_splitting_across_days_when_single_day_capacity_insufficient(test_db):
    """
    Section 7 and 31:
    Order 108 = 1200 kg on M2 (capacity = 800 kg/day).
    Verify that the order cannot be placed on M2 on Day 1 alone with 1200 kg.
    It must be split across days or compatible machines.
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    m2 = test_db.query(Machine).filter(Machine.code == "JET-M2").first()
    for m in test_db.query(Machine).filter(Machine.id != m2.id).all():
        m.status = MachineStatus.BREAKDOWN.value
    test_db.commit()

    order = Order(
        order_number="ORD-108", customer_id=1, cloth_type="Cotton", colour_name="Red",
        colour_code="RED", quantity_kg=1200.0, due_date=now + timedelta(days=3), status="PENDING"
    )
    test_db.add(order)
    test_db.commit()

    res = optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=True)
    assert res["status"] == "OPTIMIZED"

    slots = test_db.query(ProductionSchedule).filter(ProductionSchedule.order_id == order.id).all()
    assert len(slots) >= 2, "1200 kg on an 800 kg/day machine must be split into at least 2 batches!"
    assert sum(s.batch.batch_quantity_kg for s in slots) == 1200.0

    is_valid, errors = validate_daily_schedule_capacity(test_db, reference_now=now, horizon_days=7)
    assert is_valid, f"Validation failed: {errors}"


def test_manual_assign_rejects_when_daily_capacity_exceeded(test_db):
    """
    Section 20 and 31:
    Attempting to manually assign an order to a machine/day that exceeds daily capacity
    must be rejected with a clear error message.
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    m1 = test_db.query(Machine).filter(Machine.code == "JET-M1").first()
    for m in test_db.query(Machine).filter(Machine.id != m1.id).all():
        m.status = MachineStatus.BREAKDOWN.value
    test_db.commit()

    # Pre-fill Day 1 with 400 kg on M1
    o1 = Order(
        order_number="ORD-101", customer_id=1, cloth_type="Cotton", colour_name="Blue",
        colour_code="BLUE", quantity_kg=400.0, due_date=now + timedelta(days=2), status="PENDING"
    )
    test_db.add(o1)
    test_db.commit()
    optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=True)

    # Now create another order of 300 kg
    o2 = Order(
        order_number="ORD-102", customer_id=1, cloth_type="Cotton", colour_name="Navy",
        colour_code="NAVY", quantity_kg=300.0, due_date=now + timedelta(days=2), status="PENDING"
    )
    test_db.add(o2)
    test_db.commit()

    # Manually try to assign ORD-102 (300 kg) to M1 on Day 1 (which already has 400 kg; 400 + 300 = 700 > 500)
    req = MatrixEditRequest(
        action="ASSIGN",
        order_id=o2.id,
        target_machine_id=m1.id,
        planned_day=1
    )
    res = execute_matrix_action(test_db, req, reference_now=now)
    assert res["success"] is False
    assert "capacity exceeded" in res["error"].lower()
    assert "500" in res["error"]


def test_order_quantity_change_recalculates_factory(test_db):
    """
    Section 19 and 31:
    Changing an order's quantity recalculates the entire schedule across the factory.
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    o1 = Order(order_number="ORD-101", customer_id=1, cloth_type="Cotton", colour_name="Blue",
               colour_code="BLUE", quantity_kg=400.0, due_date=now + timedelta(days=2), status="PENDING")
    o2 = Order(order_number="ORD-102", customer_id=1, cloth_type="Cotton", colour_name="Red",
               colour_code="RED", quantity_kg=400.0, due_date=now + timedelta(days=2), status="PENDING")
    test_db.add_all([o1, o2])
    test_db.commit()

    optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=True)

    # Increase quantity of ORD-101 from 400 to 1200 kg
    req = MatrixEditRequest(
        action="UPDATE_ROW",
        order_id=o1.id,
        quantity_kg=1200.0
    )
    res = execute_matrix_action(test_db, req, reference_now=now)
    assert res["success"] is True

    # Invariants must hold
    is_valid, errors = validate_daily_schedule_capacity(test_db, reference_now=now, horizon_days=7)
    assert is_valid, f"Validation failed after quantity change: {errors}"

    reloaded_o1 = test_db.query(Order).filter(Order.id == o1.id).first()
    assert reloaded_o1.quantity_kg == 1200.0
    slots = test_db.query(ProductionSchedule).filter(ProductionSchedule.order_id == o1.id).all()
    assert sum(s.batch.batch_quantity_kg for s in slots) == 1200.0


def test_due_date_urgency_prioritizes_earlier_deadline(test_db):
    """
    Section 12 and 31:
    Order A (due Day 2) vs Order B (due Day 8), both competing for M1 capacity.
    Verify Order A is scheduled on Day 1, while Order B is scheduled later.
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    m1 = test_db.query(Machine).filter(Machine.code == "JET-M1").first()
    for m in test_db.query(Machine).filter(Machine.id != m1.id).all():
        m.status = MachineStatus.BREAKDOWN.value
    test_db.commit()

    # Order B created first, but due Day 8
    o_b = Order(order_number="ORD-B", customer_id=1, cloth_type="Cotton", colour_name="Blue",
                colour_code="BLUE", quantity_kg=500.0, due_date=now + timedelta(days=8), status="PENDING")
    # Order A created second, but due Day 2 (urgent!)
    o_a = Order(order_number="ORD-A", customer_id=1, cloth_type="Cotton", colour_name="Blue",
                colour_code="BLUE", quantity_kg=500.0, due_date=now + timedelta(days=2), status="PENDING")
    test_db.add_all([o_b, o_a])
    test_db.commit()

    optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=True)

    slots_a = test_db.query(ProductionSchedule).filter(ProductionSchedule.order_id == o_a.id).all()
    slots_b = test_db.query(ProductionSchedule).filter(ProductionSchedule.order_id == o_b.id).all()

    assert slots_a[0].planned_start < slots_b[0].planned_start
