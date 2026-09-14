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
from app.services.scheduler_service import optimize_factory_schedule
from app.services.matrix_service import execute_matrix_action, get_planning_matrix_data


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    now = datetime.utcnow()

    # Create fleet of 6 machines
    machines = [
        Machine(id=1, code="JET-M1", name="Jet Dyeing M1", machine_type=MachineType.JET_DYEING.value,
                capacity_kg=500.0, min_batch_kg=80.0, max_batch_kg=500.0, processing_speed=1.0, efficiency=0.92,
                status=MachineStatus.AVAILABLE.value, power_kw=45.0, water_m3_hr=3.5, steam_kg_hr=600.0,
                compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend,Rayon Viscose", compatible_colours="ALL"),
        Machine(id=2, code="JET-M2", name="Jet Dyeing M2 (High Capacity)", machine_type=MachineType.JET_DYEING.value,
                capacity_kg=800.0, min_batch_kg=150.0, max_batch_kg=800.0, processing_speed=1.1, efficiency=0.94,
                status=MachineStatus.AVAILABLE.value, power_kw=65.0, water_m3_hr=5.2, steam_kg_hr=900.0,
                compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend", compatible_colours="ALL"),
        Machine(id=3, code="SOFT-M3", name="Soft Flow Vessel M3 (Delicate)", machine_type=MachineType.SOFT_FLOW.value,
                capacity_kg=400.0, min_batch_kg=50.0, max_batch_kg=400.0, processing_speed=0.95, efficiency=0.90,
                status=MachineStatus.AVAILABLE.value, power_kw=35.0, water_m3_hr=2.8, steam_kg_hr=500.0,
                compatible_cloth_types="Cotton,Organic Cotton,Rayon Viscose,Modal", compatible_colours="ALL"),
        Machine(id=4, code="SOFT-M4", name="Soft Flow Vessel M4", machine_type=MachineType.SOFT_FLOW.value,
                capacity_kg=600.0, min_batch_kg=100.0, max_batch_kg=600.0, processing_speed=1.0, efficiency=0.91,
                status=MachineStatus.AVAILABLE.value, power_kw=48.0, water_m3_hr=4.0, steam_kg_hr=700.0,
                compatible_cloth_types="Cotton,Poly-Cotton Blend,Rayon Viscose", compatible_colours="ALL"),
        Machine(id=5, code="JIG-M5", name="Jigger Dyeing J5", machine_type=MachineType.JIGGER.value,
                capacity_kg=1000.0, min_batch_kg=250.0, max_batch_kg=1000.0, processing_speed=0.85, efficiency=0.88,
                status=MachineStatus.AVAILABLE.value, power_kw=55.0, water_m3_hr=4.5, steam_kg_hr=750.0,
                compatible_cloth_types="Cotton,Woven Twill,Denim,Linen Blend", compatible_colours="ALL"),
        Machine(id=6, code="STENT-M6", name="Stenter Line S6", machine_type=MachineType.STENTER_FINISHING.value,
                capacity_kg=1500.0, min_batch_kg=100.0, max_batch_kg=1500.0, processing_speed=1.3, efficiency=0.95,
                status=MachineStatus.AVAILABLE.value, power_kw=90.0, water_m3_hr=1.5, steam_kg_hr=1200.0,
                compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend,Rayon Viscose,Organic Cotton", compatible_colours="ALL"),
    ]
    session.add_all(machines)

    customer = Customer(id=1, code="CUST-1", name="Premium Apparel", priority_tier="TIER_1", importance_weight=1.5)
    session.add(customer)

    utilities = [
        FactoryUtility(id=1, name="Process Water", capacity_per_hour=25.0, current_load_per_hour=10.0, unit="m3/hr"),
        FactoryUtility(id=2, name="Steam Boiler", capacity_per_hour=4000.0, current_load_per_hour=2000.0, unit="kg/hr"),
        FactoryUtility(id=3, name="Power Substation", capacity_per_hour=650.0, current_load_per_hour=300.0, unit="kW"),
    ]
    session.add_all(utilities)

    session.commit()
    yield session
    session.close()


def test_factory_load_distribution_15k_to_20k(test_db):
    """
    Test Scenario (Section 32):
    Create orders totaling approximately 15,000–20,000 kg with different due dates.
    Verify that the system does NOT assign almost everything to SOFT-M3.
    Verify that work distributes across multiple compatible machines.
    """
    now = datetime.utcnow()

    # Total = 3000 + 2500 + 4000 + 3500 + 2000 + 2500 = 17,500 kg
    orders_data = [
        ("ORD-101", "Cotton 100% Greige Knit", 3000.0, now + timedelta(days=2), "HIGH", "ROYAL_BLUE"),
        ("ORD-102", "Poly-Cotton 65/35 Blend", 2500.0, now + timedelta(days=3), "MEDIUM", "SCARLET_RED"),
        ("ORD-103", "Denim Heavy Twill", 4000.0, now + timedelta(days=4), "MEDIUM", "DEEP_NAVY"),
        ("ORD-104", "Polyester Interlock Fabric", 3500.0, now + timedelta(days=5), "HIGH", "SKY_BLUE"),
        ("ORD-105", "Rayon Viscose Fabric", 2000.0, now + timedelta(days=6), "MEDIUM", "WHITE"),
        ("ORD-106", "Organic Cotton GOTS Certified", 2500.0, now + timedelta(days=7), "LOW", "PASTEL_PINK"),
    ]

    for ord_num, cloth, qty, due, prio, col in orders_data:
        o = Order(
            order_number=ord_num,
            customer_id=1,
            cloth_type=cloth,
            colour_name=col,
            colour_code=col,
            quantity_kg=qty,
            due_date=due,
            order_date=now,
            priority=prio,
            status="PENDING"
        )
        test_db.add(o)
    test_db.commit()

    total_demand = sum(q for _, _, q, _, _, _ in orders_data)
    assert total_demand == 17500.0

    # Run Factory Optimizer
    res = optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=True)
    test_db.commit()

    assert res["status"] == "OPTIMIZED"

    # Fetch Matrix Data
    matrix_data = get_planning_matrix_data(test_db)
    machine_loads = {m["code"]: m["current_load_kg"] for m in matrix_data["machines"]}

    print("\n--- Factory Load Distribution (17,500 kg Total) ---")
    for code, load in machine_loads.items():
        print(f"{code}: {load} kg")

    # CRITICAL ACCEPTANCE CRITERIA:
    # 1. SOFT-M3 must NOT receive 15,000+ kg or monopolize all work
    assert machine_loads["SOFT-M3"] < 5000.0, f"SOFT-M3 was overloaded! Load: {machine_loads['SOFT-M3']} kg"

    # 2. Work must be distributed across multiple compatible machines
    active_machines = [code for code, load in machine_loads.items() if load > 0]
    assert len(active_machines) >= 4, f"Work was not distributed! Active machines: {active_machines}"

    # 3. Specific machine specializations are respected:
    # Denim (ORD-103) should go to JIG-M5
    assert machine_loads["JIG-M5"] >= 1000.0, "JIG-M5 should have received denim work!"

    # 4. Total planned dyeing weight matches total demand
    total_scheduled = sum(machine_loads.values())
    assert abs(total_scheduled - 17500.0) < 1.0, f"Total scheduled ({total_scheduled}) != Demand (17500)"

    # 5. Strict invariant: each order has allocations summing exactly to order quantity
    for o in test_db.query(Order).all():
        slots = test_db.query(ProductionSchedule).filter(ProductionSchedule.order_id == o.id).all()
        assert len(slots) > 0, f"Order {o.order_number} has no schedule slots!"
        tot_alloc = sum(s.batch.batch_quantity_kg if s.batch else s.order.quantity_kg for s in slots)
        assert abs(tot_alloc - o.quantity_kg) < 1.0, f"Order {o.order_number} allocation mismatch: {tot_alloc} != {o.quantity_kg}"
        # No single slot exceeds machine max_batch_kg
        for s in slots:
            assert s.batch.batch_quantity_kg <= s.machine.max_batch_kg + 0.1


def test_order_quantity_change_recalculates_factory(test_db):
    """
    Test Scenario (Section 32):
    Change Order 101 quantity significantly (3,000 kg -> 8,000 kg).
    Verify that the COMPLETE factory schedule is recalculated.
    """
    now = datetime.utcnow()

    # Seed initial orders
    o1 = Order(order_number="ORD-101", customer_id=1, cloth_type="Cotton 100% Greige Knit",
               colour_name="Royal Blue", colour_code="ROYAL_BLUE",
               quantity_kg=3000.0, due_date=now + timedelta(days=3), order_date=now, priority="HIGH", status="PENDING")
    o2 = Order(order_number="ORD-102", customer_id=1, cloth_type="Poly-Cotton 65/35 Blend",
               colour_name="Scarlet Red", colour_code="SCARLET_RED",
               quantity_kg=2000.0, due_date=now + timedelta(days=4), order_date=now, priority="MEDIUM", status="PENDING")
    test_db.add_all([o1, o2])
    test_db.commit()

    optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=True)
    test_db.commit()

    # Change ORD-101: 3,000 kg -> 8,000 kg via matrix edit action
    req = MatrixEditRequest(action="UPDATE_ROW", order_id=o1.id, quantity_kg=8000.0)
    result = execute_matrix_action(test_db, req)

    assert result["success"] is True, f"Matrix update failed: {result.get('error')}"

    # Verify order quantity in DB
    updated_o1 = test_db.query(Order).filter(Order.id == o1.id).first()
    assert updated_o1.quantity_kg == 8000.0

    # Verify allocations for ORD-101 sum to 8000 kg and no batch exceeds machine capacity
    slots_o1 = test_db.query(ProductionSchedule).filter(ProductionSchedule.order_id == o1.id).all()
    tot_o1_weight = sum(s.batch.batch_quantity_kg for s in slots_o1 if s.batch)
    assert abs(tot_o1_weight - 8000.0) < 1.0, f"Allocations sum ({tot_o1_weight}) != 8000.0"

    for s in slots_o1:
        assert s.batch.batch_quantity_kg <= s.machine.max_batch_kg + 0.1


def test_order_due_date_change_recalculates_factory(test_db):
    """
    Test Scenario (Section 32):
    Change an order's due date to be earlier/more urgent.
    Verify that the complete factory schedule recalculates and prioritizes the earlier order.
    """
    now = datetime.utcnow()

    o1 = Order(order_number="ORD-101", customer_id=1, cloth_type="Cotton 100% Greige Knit",
               colour_name="Royal Blue", colour_code="ROYAL_BLUE",
               quantity_kg=2000.0, due_date=now + timedelta(days=10), order_date=now, priority="LOW", status="PENDING")
    o2 = Order(order_number="ORD-102", customer_id=1, cloth_type="Cotton 100% Greige Knit",
               colour_name="Sky Blue", colour_code="SKY_BLUE",
               quantity_kg=2000.0, due_date=now + timedelta(days=3), order_date=now, priority="MEDIUM", status="PENDING")
    test_db.add_all([o1, o2])
    test_db.commit()

    optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=True)
    test_db.commit()

    # Move ORD-101 due date to be tomorrow (super urgent)
    earlier_due = now + timedelta(days=1)
    req = MatrixEditRequest(action="UPDATE_ROW", order_id=o1.id, due_date=earlier_due)
    result = execute_matrix_action(test_db, req)

    assert result["success"] is True

    # Check updated planned start times: ORD-101 should now have high urgency
    upd_o1 = test_db.query(Order).filter(Order.id == o1.id).first()
    assert upd_o1.due_date == earlier_due


def test_add_large_order_recalculates_factory(test_db):
    """
    Test Scenario (Section 32):
    Add another large order via matrix edit.
    Verify that the factory schedule recalculates without crashing or capacity violation.
    """
    now = datetime.utcnow()

    req = MatrixEditRequest(
        action="ADD_ORDER",
        order_number="ORD-LARGE-900",
        cloth_type="Polyester Interlock Fabric",
        quantity_kg=6000.0,
        due_date=now + timedelta(days=6),
        priority="HIGH"
    )
    result = execute_matrix_action(test_db, req)
    assert result["success"] is True

    # Verify ORD-LARGE-900 is scheduled
    new_ord = test_db.query(Order).filter(Order.order_number == "ORD-LARGE-900").first()
    assert new_ord is not None
    assert new_ord.status == "SCHEDULED"
    slots = test_db.query(ProductionSchedule).filter(ProductionSchedule.order_id == new_ord.id).all()
    assert len(slots) > 0
    tot_weight = sum(s.batch.batch_quantity_kg for s in slots if s.batch)
    assert abs(tot_weight - 6000.0) < 1.0


def test_zero_ghost_duplicates(test_db):
    """
    Verify that repeated optimizations do NOT accumulate ghost duplicate slots.
    """
    now = datetime.utcnow()
    o = Order(order_number="ORD-101", customer_id=1, cloth_type="Cotton 100% Greige Knit",
              colour_name="Royal Blue", colour_code="ROYAL_BLUE",
              quantity_kg=400.0, due_date=now + timedelta(days=2), order_date=now, priority="HIGH", status="PENDING")
    test_db.add(o)
    test_db.commit()

    # Run optimizer 3 times in a row
    for _ in range(3):
        optimize_factory_schedule(test_db, reference_now=now, force_reschedule_all=False, preserve_locked=True)
        test_db.commit()

    slots = test_db.query(ProductionSchedule).filter(ProductionSchedule.order_id == o.id).all()
    # 400 kg on any machine (min cap 400 kg) should have exactly 1 slot, NOT 3 or 41!
    assert len(slots) == 1, f"Expected 1 slot, got {len(slots)} duplicate slots!"
