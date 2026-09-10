from datetime import datetime, timedelta
from app.models.factory_models import Machine, MachineMaintenance, MachineReliability
from app.models.schedule_models import ProductionSchedule
from app.core.dynamic_rescheduler import handle_machine_maintenance_scheduling, handle_complete_maintenance
from app.services.scheduler_service import SchedulerService

def test_machine_crud_and_maintenance(db):
    # 1. Create a test machine
    test_m = Machine(
        code="TEST-M99",
        name="Test Dyeing Vessel 99",
        machine_type="JET_DYEING",
        capacity_kg=600.0,
        min_batch_kg=100.0,
        max_batch_kg=600.0,
        processing_speed=1.0,
        efficiency=0.92,
        status="AVAILABLE",
        power_kw=50.0,
        water_m3_hr=4.0,
        steam_kg_hr=650.0,
        compatible_cloth_types="Cotton,Polyester",
        compatible_colours="ALL"
    )
    db.add(test_m)
    db.flush()

    rel = MachineReliability(
        machine_id=test_m.id,
        mtbf_hours=200.0,
        mttr_hours=4.0,
        breakdown_count=0,
        reliability_pct=96.0
    )
    db.add(rel)
    db.commit()

    created_id = test_m.id
    assert created_id is not None
    assert test_m.code == "TEST-M99"

    # 2. Update machine properties
    test_m.capacity_kg = 650.0
    test_m.max_batch_kg = 650.0
    db.commit()
    db.refresh(test_m)
    assert test_m.max_batch_kg == 650.0

    # 3. Schedule maintenance mode for 6 hours
    res = handle_machine_maintenance_scheduling(
        db=db,
        machine_id=created_id,
        duration_hours=6.0,
        title="Preventive Vessel Descaling",
        start_time=datetime.utcnow(),
        maintenance_type="PREVENTIVE"
    )
    assert res["machine_id"] == created_id
    assert res["hours"] == 6.0
    db.refresh(test_m)
    assert test_m.status == "MAINTENANCE"

    # Check maintenance record
    maint = db.query(MachineMaintenance).filter(MachineMaintenance.machine_id == created_id).first()
    assert maint is not None
    assert maint.title == "Preventive Vessel Descaling"

    # 4. Complete maintenance
    comp_res = handle_complete_maintenance(db=db, machine_id=created_id)
    db.refresh(test_m)
    assert test_m.status == "AVAILABLE"
    assert comp_res["status"] == "AVAILABLE"

    # 5. Clean up / Delete machine
    db.query(MachineMaintenance).filter(MachineMaintenance.machine_id == created_id).delete()
    db.query(MachineReliability).filter(MachineReliability.machine_id == created_id).delete()
    db.delete(test_m)
    db.commit()

    deleted = db.query(Machine).filter(Machine.id == created_id).first()
    assert deleted is None
