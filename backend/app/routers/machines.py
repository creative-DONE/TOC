from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.models.factory_models import Machine, MachineMaintenance, MachineReliability
from app.schemas.schemas import MachineResponse

router = APIRouter(prefix="/api/machines", tags=["Machines"])

@router.get("", response_model=List[MachineResponse])
def get_machines(db: Session = Depends(get_db)):
    machines = db.query(Machine).all()
    result = []
    
    for m in machines:
        rel = m.reliability
        # Calculate nominal utilization
        nominal_weekly_kg = (m.max_batch_kg / 3.0) * (7 * 20.0 * m.efficiency)
        util_pct = round((m.current_workload_kg / max(1.0, nominal_weekly_kg)) * 100.0, 1)

        result.append(MachineResponse(
            id=m.id,
            code=m.code,
            name=m.name,
            machine_type=m.machine_type,
            capacity_kg=m.capacity_kg,
            min_batch_kg=m.min_batch_kg,
            max_batch_kg=m.max_batch_kg,
            processing_speed=m.processing_speed,
            efficiency=m.efficiency,
            status=m.status,
            available_hours_day=m.available_hours_day,
            power_kw=m.power_kw,
            water_m3_hr=m.water_m3_hr,
            steam_kg_hr=m.steam_kg_hr,
            current_workload_kg=m.current_workload_kg,
            utilization_pct=min(99.5, util_pct),
            mtbf_hours=rel.mtbf_hours if rel else 200.0,
            mttr_hours=rel.mttr_hours if rel else 4.0,
            reliability_pct=rel.reliability_pct if rel else 96.0
        ))
    return result

@router.get("/maintenance")
def get_machine_maintenance(db: Session = Depends(get_db)):
    records = db.query(MachineMaintenance).all()
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
