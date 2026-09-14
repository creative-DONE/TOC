import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from datetime import datetime, timedelta
from app.db.database import SessionLocal
from app.models.schedule_models import ProductionSchedule
from app.models.factory_models import Machine
from app.models.order_models import Order
from app.schemas.schemas import ScheduleSlotUpdateRequest
from app.routers.schedule import update_and_reorganize_slot, toggle_slot_lock

def test_slot_toggle_lock():
    db = SessionLocal()
    slot = db.query(ProductionSchedule).first()
    assert slot is not None

    initial_locked = slot.is_locked
    res1 = toggle_slot_lock(slot.id, db)
    assert res1["success"] is True
    assert res1["is_locked"] == (not initial_locked)

    res2 = toggle_slot_lock(slot.id, db)
    assert res2["success"] is True
    assert res2["is_locked"] == initial_locked

def test_slot_update_and_reorganize():
    db = SessionLocal()
    slots = db.query(ProductionSchedule).order_by(ProductionSchedule.planned_start.asc()).all()
    assert len(slots) >= 2

    target = slots[0]
    original_start = target.planned_start  # Move target forward by 30 mins with force_unlock_conflicts=True

    new_start = original_start + timedelta(minutes=30)
    slot_qty = target.batch.batch_quantity_kg if target.batch else min(target.order.quantity_kg if target.order else 500.0, target.machine.max_batch_kg if target.machine else 500.0)
    req = ScheduleSlotUpdateRequest(
        planned_start=new_start,
        quantity_kg=slot_qty,
        colour_name="Jet Black",
        colour_code="JET_BLACK",
        force_unlock_conflicts=True
    )

    result = update_and_reorganize_slot(target.id, req, db)
    assert result["success"] is True
    assert "diff" in result
    assert result["diff"]["target_slot_id"] == target.id

    db.refresh(target)
    assert target.planned_start == new_start
    assert target.is_locked is True

def test_locked_job_conflict_detection():
    db = SessionLocal()
    slots = db.query(ProductionSchedule).all()
    assert len(slots) >= 2

    s0 = slots[0]
    s0.is_locked = True
    db.commit()

    s1 = slots[1]
    req = ScheduleSlotUpdateRequest(
        machine_id=s0.machine_id,
        planned_start=s0.planned_start,
        planned_end=s0.planned_end,
        force_override=True,
        force_unlock_conflicts=False
    )

    result = update_and_reorganize_slot(s1.id, req, db)
    assert result["success"] is False
    assert result.get("conflict") is True
    assert result.get("locked_slot_id") == s0.id

    req_force = ScheduleSlotUpdateRequest(
        machine_id=s0.machine_id,
        planned_start=s0.planned_start,
        planned_end=s0.planned_end,
        force_override=True,
        force_unlock_conflicts=True
    )
    result2 = update_and_reorganize_slot(s1.id, req_force, db)
    assert result2["success"] is True

if __name__ == "__main__":
    test_slot_toggle_lock()
    test_slot_update_and_reorganize()
    test_locked_job_conflict_detection()
    print("ALL AGENDA REORGANIZATION TESTS PASSED!")
