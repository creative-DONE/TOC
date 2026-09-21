from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from app.db.database import get_db
from app.models.factory_models import Machine, MachineMaintenance, MachineReliability, EmployeeSkill
from app.models.schedule_models import ProductionSchedule
from app.models.order_models import Order
from app.schemas.schemas import (
    MachineResponse, MachineCreate, MachineUpdate, MachineMaintenanceScheduleRequest
)
from app.core.dynamic_rescheduler import handle_machine_maintenance_scheduling, handle_complete_maintenance
from app.services.scheduler_service import SchedulerService

router = APIRouter(prefix="/api/machines", tags=["Machines"])

@router.get("", response_model=List[MachineResponse])
def get_machines(db: Session = Depends(get_db)):
    machines = db.query(Machine).all()
    result = []
    now = datetime.utcnow()
    
    for m in machines:
        rel = m.reliability
        # Calculate nominal utilization
        nominal_weekly_kg = (m.max_batch_kg / 3.0) * (7 * 20.0 * m.efficiency)
        util_pct = round((m.current_workload_kg / max(1.0, nominal_weekly_kg)) * 100.0, 1)

        # Check for active maintenance
        active_maint = db.query(MachineMaintenance).filter(
            MachineMaintenance.machine_id == m.id,
            MachineMaintenance.status.in_(["IN_PROGRESS", "SCHEDULED"]),
            MachineMaintenance.end_time > now
        ).order_by(MachineMaintenance.start_time.asc()).first()

        maint_data = None
        if active_maint:
            remaining_hours = max(0.0, round((active_maint.end_time - now).total_seconds() / 3600.0, 1))
            maint_data = {
                "id": active_maint.id,
                "title": active_maint.title,
                "start_time": active_maint.start_time.isoformat(),
                "end_time": active_maint.end_time.isoformat(),
                "type": active_maint.maintenance_type,
                "status": active_maint.status,
                "remaining_hours": remaining_hours,
                "notes": active_maint.notes
            }

        result.append(MachineResponse(
            id=m.id,
            code=m.code,
            name=m.name,
            machine_type=m.machine_type,
            capacity_kg=m.capacity_kg,
            min_batch_kg=m.min_batch_kg,
            max_batch_kg=m.max_batch_kg,
            processing_time_hours=getattr(m, 'processing_time_hours', 3.0) or 3.0,
            working_hours_per_day=getattr(m, 'working_hours_per_day', 8.0) or 8.0,
            processing_speed=m.processing_speed,
            efficiency=m.efficiency,
            status=m.status,
            available_hours_day=m.available_hours_day,
            power_kw=m.power_kw,
            water_m3_hr=m.water_m3_hr,
            steam_kg_hr=m.steam_kg_hr,
            compatible_cloth_types=m.compatible_cloth_types,
            compatible_colours=m.compatible_colours,
            current_workload_kg=m.current_workload_kg,
            utilization_pct=min(99.5, util_pct),
            mtbf_hours=rel.mtbf_hours if rel else 200.0,
            mttr_hours=rel.mttr_hours if rel else 4.0,
            reliability_pct=rel.reliability_pct if rel else 96.0,
            active_maintenance=maint_data
        ))
    return result

@router.post("", response_model=MachineResponse, status_code=status.HTTP_201_CREATED)
def create_machine(data: MachineCreate, db: Session = Depends(get_db)):
    """
    Creates a new machine vessel, initializes its reliability profile,
    and recalculates factory capacity.
    """
    machine_code = data.code
    if not machine_code:
        count = db.query(Machine).count() + 1
        prefix = "JET" if "JET" in data.machine_type else ("SOFT" if "SOFT" in data.machine_type else "MACH")
        machine_code = f"{prefix}-M{count}"

    existing = db.query(Machine).filter(Machine.code == machine_code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Machine with code '{machine_code}' already exists.")

    new_machine = Machine(
        code=machine_code,
        name=data.name,
        machine_type=data.machine_type,
        capacity_kg=data.capacity_kg,
        min_batch_kg=data.min_batch_kg,
        max_batch_kg=data.max_batch_kg,
        processing_time_hours=data.processing_time_hours,
        working_hours_per_day=data.working_hours_per_day,
        processing_speed=data.processing_speed,
        efficiency=data.efficiency,
        status=data.status,
        power_kw=data.power_kw,
        water_m3_hr=data.water_m3_hr,
        steam_kg_hr=data.steam_kg_hr,
        compatible_cloth_types=data.compatible_cloth_types,
        compatible_colours=data.compatible_colours or "ALL",
        current_workload_kg=0.0
    )
    db.add(new_machine)
    db.flush()

    reliability = MachineReliability(
        machine_id=new_machine.id,
        mtbf_hours=200.0,
        mttr_hours=4.0,
        breakdown_count=0,
        avg_repair_hours=3.5,
        reliability_pct=96.0
    )
    db.add(reliability)
    db.commit()
    db.refresh(new_machine)

    try:
        scheduler = SchedulerService(db)
        scheduler.generate_full_schedule()
    except Exception as e:
        print(f"Schedule re-optimization note on machine add: {e}")

    return MachineResponse(
        id=new_machine.id,
        code=new_machine.code,
        name=new_machine.name,
        machine_type=new_machine.machine_type,
        capacity_kg=new_machine.capacity_kg,
        min_batch_kg=new_machine.min_batch_kg,
        max_batch_kg=new_machine.max_batch_kg,
        processing_time_hours=getattr(new_machine, 'processing_time_hours', 3.0) or 3.0,
        working_hours_per_day=getattr(new_machine, 'working_hours_per_day', 8.0) or 8.0,
        processing_speed=new_machine.processing_speed,
        efficiency=new_machine.efficiency,
        status=new_machine.status,
        available_hours_day=new_machine.available_hours_day,
        power_kw=new_machine.power_kw,
        water_m3_hr=new_machine.water_m3_hr,
        steam_kg_hr=new_machine.steam_kg_hr,
        compatible_cloth_types=new_machine.compatible_cloth_types,
        compatible_colours=new_machine.compatible_colours,
        current_workload_kg=0.0,
        utilization_pct=0.0,
        mtbf_hours=200.0,
        mttr_hours=4.0,
        reliability_pct=96.0,
        active_maintenance=None
    )

@router.put("/{machine_id}", response_model=MachineResponse)
def update_machine(machine_id: int, data: MachineUpdate, db: Session = Depends(get_db)):
    """
    Updates an existing machine's parameters (capacity, processing time, working hours, etc.).
    """
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine #{machine_id} not found.")

    update_data = data.dict(exclude_unset=True)
    for field, val in update_data.items():
        if val is not None:
            setattr(machine, field, val)

    db.commit()
    db.refresh(machine)

    try:
        scheduler = SchedulerService(db)
        scheduler.generate_full_schedule()
    except Exception as e:
        print(f"Schedule re-optimization note on machine update: {e}")

    rel = machine.reliability
    nominal_weekly_kg = (machine.max_batch_kg / 3.0) * (7 * 20.0 * machine.efficiency)
    util_pct = round((machine.current_workload_kg / max(1.0, nominal_weekly_kg)) * 100.0, 1)

    return MachineResponse(
        id=machine.id,
        code=machine.code,
        name=machine.name,
        machine_type=machine.machine_type,
        capacity_kg=machine.capacity_kg,
        min_batch_kg=machine.min_batch_kg,
        max_batch_kg=machine.max_batch_kg,
        processing_time_hours=getattr(machine, 'processing_time_hours', 3.0) or 3.0,
        working_hours_per_day=getattr(machine, 'working_hours_per_day', 8.0) or 8.0,
        processing_speed=machine.processing_speed,
        efficiency=machine.efficiency,
        status=machine.status,
        available_hours_day=machine.available_hours_day,
        power_kw=machine.power_kw,
        water_m3_hr=machine.water_m3_hr,
        steam_kg_hr=machine.steam_kg_hr,
        compatible_cloth_types=machine.compatible_cloth_types,
        compatible_colours=machine.compatible_colours,
        current_workload_kg=machine.current_workload_kg,
        utilization_pct=min(99.5, util_pct),
        mtbf_hours=rel.mtbf_hours if rel else 200.0,
        mttr_hours=rel.mttr_hours if rel else 4.0,
        reliability_pct=rel.reliability_pct if rel else 96.0,
        active_maintenance=None
    )

@router.delete("/{machine_id}")
def delete_machine(machine_id: int, db: Session = Depends(get_db)):
    """
    Safely removes a machine from the factory fleet.
    Existing scheduled jobs are reassigned to available machines.
    """
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine #{machine_id} not found.")

    name = machine.name

    db.query(EmployeeSkill).filter(EmployeeSkill.machine_id == machine_id).delete()
    db.query(MachineReliability).filter(MachineReliability.machine_id == machine_id).delete()
    db.query(MachineMaintenance).filter(MachineMaintenance.machine_id == machine_id).delete()

    affected_slots = db.query(ProductionSchedule).filter(ProductionSchedule.machine_id == machine_id).all()
    affected_order_ids = set(s.order_id for s in affected_slots)

    for slot in affected_slots:
        db.delete(slot)

    for oid in affected_order_ids:
        order = db.query(Order).filter(Order.id == oid).first()
        if order:
            order.assigned_machine_id = None
            order.status = "PENDING"
            order.planned_start = None
            order.planned_completion = None

    db.delete(machine)
    db.commit()

    try:
        scheduler = SchedulerService(db)
        scheduler.generate_full_schedule()
    except Exception as e:
        print(f"Schedule re-optimization note on machine delete: {e}")

    return {
        "success": True,
        "message": f"Machine '{name}' was deleted. {len(affected_order_ids)} orders were reassigned across the remaining fleet."
    }

@router.post("/{machine_id}/maintenance")
def schedule_machine_maintenance_endpoint(
    machine_id: int,
    req: MachineMaintenanceScheduleRequest,
    db: Session = Depends(get_db)
):
    """
    Sets a machine into Maintenance Mode for a specified duration in hours.
    Automatically reschedules conflicting production jobs.
    """
    try:
        result = handle_machine_maintenance_scheduling(
            db=db,
            machine_id=machine_id,
            duration_hours=req.hours,
            title=req.title or f"Scheduled Maintenance ({req.hours:.1f}h)",
            start_time=req.start_time,
            maintenance_type=req.maintenance_type or "PREVENTIVE",
            notes=req.notes
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to schedule maintenance: {str(e)}")

@router.post("/{machine_id}/complete-maintenance")
def complete_machine_maintenance_endpoint(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """
    Completes maintenance on a machine, marks it AVAILABLE,
    and re-optimizes the production schedule.
    """
    try:
        result = handle_complete_maintenance(db=db, machine_id=machine_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to complete maintenance: {str(e)}")

@router.get("/maintenance")
def get_machine_maintenance(db: Session = Depends(get_db)):
    records = db.query(MachineMaintenance).order_by(MachineMaintenance.start_time.desc()).all()
    return [
        {
            "id": r.id,
            "machine_id": r.machine_id,
            "machine_name": r.machine.name if r.machine else f"Machine #{r.machine_id}",
            "title": r.title,
            "start_time": r.start_time.isoformat(),
            "end_time": r.end_time.isoformat(),
            "type": r.maintenance_type,
            "status": r.status,
            "notes": r.notes
        }
        for r in records
    ]
