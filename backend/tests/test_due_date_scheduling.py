import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import datetime, timedelta
import io
import pytest
from openpyxl import Workbook

from app.db.database import SessionLocal
from app.models.factory_models import Machine, MachineStatus
from app.models.order_models import Order, OrderBatch
from app.models.schedule_models import ProductionSchedule
from app.services.scheduler_service import optimize_factory_schedule
from app.services.matrix_service import get_planning_matrix_data, execute_matrix_action, extract_numeric_order_id
from app.schemas.schemas import MatrixEditRequest
from app.services.excel_import_service import parse_excel_orders, import_excel_orders_to_db


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


def test_edd_urgency_ordering(db):
    """
    Scenario:
    Order 1: 500 kg, Due Day 10
    Order 2: 500 kg, Due Day 9
    Order 3: 1000 kg, Due Day 5
    Verify that Order 3 (Due Day 5) is scheduled earliest, followed by Order 2 (Due Day 9), then Order 1 (Due Day 10).
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    today_mid = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Clean previous test orders with these numbers
    db.query(ProductionSchedule).filter(ProductionSchedule.order_id.in_(
        db.query(Order.id).filter(Order.order_number.in_(["ORD-TEST-1", "ORD-TEST-2", "ORD-TEST-3"]))
    )).delete(synchronize_session=False)
    db.query(OrderBatch).filter(OrderBatch.order_id.in_(
        db.query(Order.id).filter(Order.order_number.in_(["ORD-TEST-1", "ORD-TEST-2", "ORD-TEST-3"]))
    )).delete(synchronize_session=False)
    db.query(Order).filter(Order.order_number.in_(["ORD-TEST-1", "ORD-TEST-2", "ORD-TEST-3"])).delete(synchronize_session=False)
    db.commit()

    # Create Orders in non-sorted order
    o1 = Order(order_number="ORD-TEST-1", customer_id=1, cloth_type="Cotton", colour_name="Blue",
               colour_code="BLUE", quantity_kg=500.0, due_date=today_mid + timedelta(days=9), status="PENDING")
    o2 = Order(order_number="ORD-TEST-2", customer_id=1, cloth_type="Cotton", colour_name="Red",
               colour_code="RED", quantity_kg=500.0, due_date=today_mid + timedelta(days=8), status="PENDING")
    o3 = Order(order_number="ORD-TEST-3", customer_id=1, cloth_type="Cotton", colour_name="Green",
               colour_code="GREEN", quantity_kg=1000.0, due_date=today_mid + timedelta(days=4), status="PENDING")

    db.add_all([o1, o2, o3])
    db.commit()

    try:
        # Optimize schedule
        res = optimize_factory_schedule(db, reference_now=now, force_reschedule_all=True)
        assert res["status"] in ["OPTIMIZED", "SUCCESS", "CAPACITY_SHORTAGE_WARNING"]

        # Check planned completion dates (EDD sequence)
        db.refresh(o1)
        db.refresh(o2)
        db.refresh(o3)
        assert o3.planned_completion is not None and o2.planned_completion is not None and o1.planned_completion is not None
        # Order 3 (Due Day 5) should complete before or same as Order 2, and Order 2 before or same as Order 1
        assert o3.planned_completion <= o2.planned_completion
        assert o2.planned_completion.date() <= o1.planned_completion.date()
    finally:
        # Clean up
        db.query(ProductionSchedule).filter(ProductionSchedule.order_id.in_([o1.id, o2.id, o3.id])).delete(synchronize_session=False)
        db.query(OrderBatch).filter(OrderBatch.order_id.in_([o1.id, o2.id, o3.id])).delete(synchronize_session=False)
        db.query(Order).filter(Order.id.in_([o1.id, o2.id, o3.id])).delete(synchronize_session=False)
        db.commit()


def test_due_date_reoptimization_on_date_change(db):
    """
    Scenario:
    Changing Order 1's Due Date from Day 10 to Day 2 causes the entire schedule
    to recalculate and prioritizes Order 1 over other jobs.
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    today_mid = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Clean any leftover test orders
    db.query(ProductionSchedule).filter(ProductionSchedule.order_id.in_(
        db.query(Order.id).filter(Order.order_number.in_(["ORD-DYN-A", "ORD-DYN-B"]))
    )).delete(synchronize_session=False)
    db.query(OrderBatch).filter(OrderBatch.order_id.in_(
        db.query(Order.id).filter(Order.order_number.in_(["ORD-DYN-A", "ORD-DYN-B"]))
    )).delete(synchronize_session=False)
    db.query(Order).filter(Order.order_number.in_(["ORD-DYN-A", "ORD-DYN-B"])).delete(synchronize_session=False)
    db.commit()

    # Create Order A (due Day 8) and Order B (due Day 5)
    ord_a = Order(order_number="ORD-DYN-A", customer_id=1, cloth_type="Cotton", colour_name="Blue",
                  colour_code="BLUE", quantity_kg=400.0, due_date=today_mid + timedelta(days=7), status="PENDING")
    ord_b = Order(order_number="ORD-DYN-B", customer_id=1, cloth_type="Cotton", colour_name="Blue",
                  colour_code="BLUE", quantity_kg=400.0, due_date=today_mid + timedelta(days=4), status="PENDING")
    db.add_all([ord_a, ord_b])
    db.commit()

    try:
        # Initial schedule: ord_b (Due Day 5) is ahead of ord_a (Due Day 8)
        optimize_factory_schedule(db, reference_now=now, force_reschedule_all=True)
        s_a1 = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == ord_a.id).first()
        s_b1 = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == ord_b.id).first()
        assert s_b1 is not None and s_a1 is not None
        assert s_b1.planned_start <= s_a1.planned_start

        # Now change Order A's due date via matrix UPDATE_ROW action to Day 2 (urgent!)
        edit_req = MatrixEditRequest(
            action="UPDATE_ROW",
            order_id=ord_a.id,
            order_number=ord_a.order_number,
            quantity_kg=400.0,
            due_date=today_mid + timedelta(days=1), # Day 2
            cloth_type="Cotton",
            colour_name="Blue",
            colour_code="BLUE",
            force_unlock_conflicts=True
        )
        res_edit = execute_matrix_action(db, edit_req, reference_now=now)
        assert res_edit["success"] is True

        # Verify that Order A now takes priority and is scheduled before or same as Order B
        s_a2 = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == ord_a.id).first()
        s_b2 = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == ord_b.id).first()
        assert s_a2 is not None and s_b2 is not None
        assert s_a2.planned_start <= s_b2.planned_start

    finally:
        # Clean test orders
        db.query(ProductionSchedule).filter(ProductionSchedule.order_id.in_([ord_a.id, ord_b.id])).delete(synchronize_session=False)
        db.query(OrderBatch).filter(OrderBatch.order_id.in_([ord_a.id, ord_b.id])).delete(synchronize_session=False)
        db.query(Order).filter(Order.id.in_([ord_a.id, ord_b.id])).delete(synchronize_session=False)
        db.commit()


def test_capacity_shortage_detection(db):
    """
    Scenario:
    Customer demands 2000 kg by Day 2, but eligible machine capacity by Day 2 is only 1000 kg.
    Verify that the system detects and reports the 1000 kg capacity shortage.
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    today_mid = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Restrict to JET-M1 (capacity = 500 kg/day)
    m1 = db.query(Machine).filter(Machine.code == "JET-M1").first()
    other_machines = db.query(Machine).filter(Machine.id != m1.id).all()
    orig_statuses = {m.id: m.status for m in other_machines}
    for m in other_machines:
        m.status = MachineStatus.BREAKDOWN.value
    db.commit()

    try:
        # Order demanding 2000 kg with Due Date Day 2
        # On M1 (500kg/day), Day 1 + Day 2 = 1000kg max available. Shortage = 1000 kg!
        ord_short = Order(order_number="ORD-SHORT-1", customer_id=1, cloth_type="Cotton", colour_name="Blue",
                          colour_code="BLUE", quantity_kg=2000.0, due_date=today_mid + timedelta(days=1), status="PENDING")
        db.add(ord_short)
        db.commit()

        optimize_factory_schedule(db, reference_now=now, force_reschedule_all=True)

        # Check order diagnostic
        db.refresh(ord_short)
        assert ord_short.seven_day_rule_violated is True
        assert "shortage" in ord_short.seven_day_rule_diagnostic.lower()

        # Check Planning Matrix summary
        matrix = get_planning_matrix_data(db, horizon_days=7, reference_now=now)
        assert matrix["summary"]["due_date_shortages_count"] >= 1
        assert any(o["order_id"] == ord_short.id and o["is_late"] for o in matrix["orders"])

    finally:
        for m in other_machines:
            m.status = orig_statuses[m.id]
        db.query(ProductionSchedule).filter(ProductionSchedule.order_id == ord_short.id).delete(synchronize_session=False)
        db.query(OrderBatch).filter(OrderBatch.order_id == ord_short.id).delete(synchronize_session=False)
        db.query(Order).filter(Order.id == ord_short.id).delete(synchronize_session=False)
        db.commit()


def test_excel_import_with_due_date(db):
    """
    Scenario:
    Import an Excel workbook with columns:
    Job number, Product ID, Customer level, Quantity, Colour, Due Date, Delivery time
    Verify orders are created with correct due dates and scheduled automatically.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Orders"

    # Add header
    headers = ["Job number", "Product ID", "Customer level", "Quantity", "Colour", "Due Date", "Delivery time"]
    ws.append(headers)

    # Add 2 rows: one with "Day 5" string, one with ISO date
    now = datetime(2026, 9, 12, 8, 0, 0)
    iso_date = (now + timedelta(days=8)).strftime("%Y-%m-%d")

    ws.append(["JOB-IMP-101", "Cotton 100%", "Tier 1", 450, "Royal Blue", "Day 5", "14:00"])
    ws.append(["JOB-IMP-102", "Single Jersey", "Tier 2", 600, "Jet Black", iso_date, "18:00"])

    excel_buffer = io.BytesIO()
    wb.save(excel_buffer)
    excel_bytes = excel_buffer.getvalue()

    # Parse
    parsed_orders = parse_excel_orders(excel_bytes, reference_now=now)
    assert len(parsed_orders) == 2
    assert parsed_orders[0]["order_number"] == "JOB-IMP-101"
    assert parsed_orders[0]["quantity_kg"] == 450.0
    assert parsed_orders[0]["priority"] == "HIGH" # Tier 1 -> HIGH
    assert parsed_orders[0]["due_date"] is not None

    assert parsed_orders[1]["order_number"] == "JOB-IMP-102"
    assert parsed_orders[1]["quantity_kg"] == 600.0

    # Import into DB
    try:
        result = import_excel_orders_to_db(db, excel_bytes, reference_now=now)
        assert result["success"] is True
        assert result["imported_count"] == 2

        # Verify orders exist in DB and have scheduled slots
        o101 = db.query(Order).filter(Order.order_number == "JOB-IMP-101").first()
        o102 = db.query(Order).filter(Order.order_number == "JOB-IMP-102").first()
        assert o101 is not None and o102 is not None
        assert o101.status in ["SCHEDULED", "PENDING"]

        slots_101 = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == o101.id).all()
        assert len(slots_101) >= 1
    finally:
        # Clean up
        db.query(ProductionSchedule).filter(ProductionSchedule.order_id.in_(
            db.query(Order.id).filter(Order.order_number.in_(["JOB-IMP-101", "JOB-IMP-102"]))
        )).delete(synchronize_session=False)
        db.query(OrderBatch).filter(OrderBatch.order_id.in_(
            db.query(Order.id).filter(Order.order_number.in_(["JOB-IMP-101", "JOB-IMP-102"]))
        )).delete(synchronize_session=False)
        db.query(Order).filter(Order.order_number.in_(["JOB-IMP-101", "JOB-IMP-102"])).delete(synchronize_session=False)
        db.commit()


def test_matrix_numeric_default_sort_and_due_date_fields(db):
    """
    Scenario:
    Verify Planning Matrix returns due_date, due_day, due_status, and default order is Job Number numeric ascending.
    """
    now = datetime(2026, 9, 12, 8, 0, 0)
    matrix = get_planning_matrix_data(db, horizon_days=7, reference_now=now)

    assert "orders" in matrix
    assert len(matrix["orders"]) > 0

    first_order = matrix["orders"][0]
    assert "due_date" in first_order
    assert "due_day" in first_order
    assert "due_status" in first_order
    assert "due_status_label" in first_order

    # Check that orders are numerically ordered by default
    nums = [extract_numeric_order_id(o.get("raw_order_number", o["order_number"])) for o in matrix["orders"]]
    assert nums == sorted(nums)
