from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
from app.db.database import get_db
from app.models.schedule_models import DisruptionEvent
from app.schemas.schemas import DisruptionEventTrigger, DisruptionImpactResponse
from app.core.dynamic_rescheduler import handle_machine_breakdown_disruption, handle_material_delay_disruption

router = APIRouter(prefix="/api/disruptions", tags=["Disruptions & Events"])

@router.post("/trigger-breakdown")
def trigger_machine_breakdown(
    machine_id: int,
    duration_hours: float = 8.0,
    description: str = "Hydraulic pressure loss / Pump motor trip",
    db: Session = Depends(get_db)
):
    now = datetime.utcnow()
    result = handle_machine_breakdown_disruption(
        db=db,
        machine_id=machine_id,
        breakdown_start=now,
        duration_hours=duration_hours,
        description=description
    )
    return result

@router.post("/trigger-material-delay")
def trigger_material_delay(
    material_id: int,
    delay_days: float = 3.0,
    reason: str = "Supplier logistics delay",
    db: Session = Depends(get_db)
):
    now = datetime.utcnow()
    new_arrival = now + timedelta(days=delay_days)
    result = handle_material_delay_disruption(
        db=db,
        material_id=material_id,
        new_expected_arrival=new_arrival,
        reason=reason
    )
    return result

@router.get("/events")
def get_disruption_events(db: Session = Depends(get_db)):
    events = db.query(DisruptionEvent).order_by(DisruptionEvent.created_at.desc()).limit(20).all()
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "description": e.description,
            "duration_hours": e.duration_hours,
            "affected_orders_count": e.affected_orders_count,
            "impact_summary": e.impact_summary,
            "resolved": e.resolved,
            "created_at": e.created_at.isoformat()
        }
        for e in events
    ]
