from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.history_models import HistoricalProduction

def record_completed_job_metrics(
    db: Session,
    order_number: str,
    cloth_type: str,
    colour_name: str,
    machine_id: int,
    operator_id: Optional[int],
    quantity_kg: float,
    planned_duration_min: float,
    actual_duration_min: float,
    changeover_min: float,
    actual_downtime_min: float = 0.0,
    rework_flag: bool = False,
    rework_reason: Optional[str] = None
) -> HistoricalProduction:
    """
    Persists actual shop floor execution telemetry to empower statistical learning.
    """
    variance = actual_duration_min - planned_duration_min
    
    record = HistoricalProduction(
        order_number=order_number,
        cloth_type=cloth_type,
        colour_name=colour_name,
        machine_id=machine_id,
        operator_id=operator_id,
        quantity_kg=quantity_kg,
        planned_duration_min=planned_duration_min,
        actual_duration_min=actual_duration_min,
        variance_min=variance,
        changeover_time_min=changeover_min,
        actual_downtime_min=actual_downtime_min,
        rework_flag=rework_flag,
        rework_reason=rework_reason,
        completed_at=datetime.utcnow()
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
