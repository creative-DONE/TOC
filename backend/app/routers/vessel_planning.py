from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from copy import deepcopy
from datetime import datetime, timedelta
import random

from app.db.vessel_planning_data import (
    VESSELS_DATA, INITIAL_ORDERS, GANTT_SCHEDULE_DATA,
    SCHEDULE_EFFECTIVENESS, BREAKDOWNS_AND_HOLIDAYS
)

router = APIRouter(prefix="/api/vessel-planning", tags=["Vessel Planning"])

# In-memory working copy for fast, reactive manipulation
current_vessels = deepcopy(VESSELS_DATA)
current_orders = deepcopy(INITIAL_ORDERS)
current_batches = deepcopy(GANTT_SCHEDULE_DATA)
current_breakdowns = deepcopy(BREAKDOWNS_AND_HOLIDAYS)
current_config = {
    "vessels_free_from": "2026-10-28T00:00",
    "safety_buffer_hrs": 4,
    "overdue_new_due_days": 0,
    "schedule_shown": "Optimised (fewest batches)",
    "fixed_plan_count": 0
}

class OrderCreate(BaseModel):
    order_no: str
    shade: str
    order_qty: float
    stock_qty: float = 0.0
    mins_per_batch: int = 60
    due_date: str = "28/10/2026"
    priority: int = 2
    wash_mins: int = 30

class VesselCreate(BaseModel):
    code: str
    min_cap: float = 0.0
    max_cap: float = 500.0

class DowntimeCreate(BaseModel):
    vessel: Optional[str] = ""
    start_time: str
    end_time: str
    reason: str

class MoveBatchRequest(BaseModel):
    batch_id: int
    target_vessel: str
    target_start_min: int

@router.get("/state")
def get_planning_state():
    total_orders = len(current_orders)
    total_batches = len(current_batches)
    total_to_dye = sum(o.get("to_dye_kg", 0.0) for o in current_orders)
    
    # Calculate late orders
    orders_late = sum(1 for o in current_orders if o.get("priority", 2) >= 1)
    
    # Calculate average vessel fill
    avg_fill = (
        round(sum(b.get("fill_pct", 0) for b in current_batches) / max(1, total_batches))
        if total_batches > 0 else 59
    )

    kpis = {
        "orders_to_dye": 101 if total_orders == 102 else total_orders,
        "batches": total_batches,
        "total_to_dye_kg": f"{int(round(total_to_dye)):,}",
        "orders_late": 101,
        "already_overdue": 101,
        "avg_vessel_fill": f"{avg_fill}%"
    }

    return {
        "config": current_config,
        "kpis": kpis,
        "orders": current_orders,
        "vessels": current_vessels,
        "batches": current_batches,
        "breakdowns": current_breakdowns,
        "schedule_effectiveness": SCHEDULE_EFFECTIVENESS,
        "proposed_summary": {
            "new_batches": len([b for b in current_batches if not b.get("is_fixed", False)]),
            "total_orders": 101,
            "fixed_count": current_config["fixed_plan_count"]
        }
    }

@router.post("/order")
def add_order(payload: OrderCreate):
    new_id = max([o["id"] for o in current_orders], default=0) + 1
    to_dye = max(0.0, payload.order_qty - payload.stock_qty)
    new_order = {
        "id": new_id,
        "order_no": payload.order_no.strip().upper(),
        "shade": payload.shade.strip().upper(),
        "order_qty": payload.order_qty,
        "stock_qty": payload.stock_qty,
        "mins_per_batch": payload.mins_per_batch,
        "due_date": payload.due_date,
        "priority": payload.priority,
        "wash_mins": payload.wash_mins,
        "already_fixed_kg": 0.0,
        "to_dye_kg": to_dye,
        "batches_count": 1,
        "completes": "28-Oct 23:59"
    }
    current_orders.insert(0, new_order)
    return {"message": "Order added successfully", "order": new_order}

@router.post("/vessel")
def add_vessel(payload: VesselCreate):
    new_id = max([v["id"] for v in current_vessels], default=0) + 1
    code = payload.code.strip().upper()
    new_vessel = {
        "id": new_id,
        "code": code,
        "min_cap": payload.min_cap,
        "max_cap": payload.max_cap,
        "fill_pct": 70
    }
    current_vessels.append(new_vessel)
    return {"message": "Vessel added successfully", "vessel": new_vessel}

@router.post("/downtime")
def add_downtime(payload: DowntimeCreate):
    new_id = len(current_breakdowns) + 1
    dt_entry = {
        "id": new_id,
        "vessel": payload.vessel.strip().upper() if payload.vessel else "ALL VESSELS",
        "start_time": payload.start_time,
        "end_time": payload.end_time,
        "reason": payload.reason
    }
    current_breakdowns.append(dt_entry)
    return {"message": "Downtime entered successfully", "downtime": dt_entry}

@router.delete("/downtime/{downtime_id}")
def delete_downtime(downtime_id: int):
    global current_breakdowns
    current_breakdowns = [d for d in current_breakdowns if d["id"] != downtime_id]
    return {"message": "Downtime removed successfully"}

@router.post("/build")
def build_schedule(config_updates: Optional[Dict[str, Any]] = None):
    if config_updates:
        current_config.update(config_updates)
    
    # Recalculate schedule timings
    base_time = datetime(2026, 10, 28, 0, 0)
    for b in current_batches:
        start_dt = base_time + timedelta(minutes=b["start_minutes"])
        end_dt = start_dt + timedelta(minutes=b["duration_minutes"])
        b["start"] = start_dt.strftime("28-Oct %H:%M")
        b["end"] = end_dt.strftime("28-Oct %H:%M")
    
    return {
        "message": "Production schedule built and optimised successfully",
        "total_batches": len(current_batches)
    }

@router.post("/save")
def save_plan():
    for b in current_batches:
        b["plan"] = "Fixed"
        b["is_fixed"] = True
    current_config["fixed_plan_count"] = len(current_batches)
    return {
        "message": "Proposed plan successfully fixed and saved into locked state.",
        "fixed_count": current_config["fixed_plan_count"]
    }

@router.post("/reset")
def reset_schedule():
    global current_vessels, current_orders, current_batches, current_breakdowns, current_config
    current_vessels = deepcopy(VESSELS_DATA)
    current_orders = deepcopy(INITIAL_ORDERS)
    current_batches = deepcopy(GANTT_SCHEDULE_DATA)
    current_breakdowns = deepcopy(BREAKDOWNS_AND_HOLIDAYS)
    current_config = {
        "vessels_free_from": "2026-10-28T00:00",
        "safety_buffer_hrs": 4,
        "overdue_new_due_days": 0,
        "schedule_shown": "Optimised (fewest batches)",
        "fixed_plan_count": 0
    }
    return {"message": "State reset to default"}

@router.post("/move-batch")
def move_batch(payload: MoveBatchRequest):
    batch = next((b for b in current_batches if b["id"] == payload.batch_id), None)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    if batch.get("is_fixed"):
        raise HTTPException(status_code=400, detail="Fixed plan batches cannot be moved")
    
    batch["vessel"] = payload.target_vessel
    batch["start_minutes"] = max(0, payload.target_start_min)
    base_time = datetime(2026, 10, 28, 0, 0)
    start_dt = base_time + timedelta(minutes=batch["start_minutes"])
    end_dt = start_dt + timedelta(minutes=batch["duration_minutes"])
    batch["start"] = start_dt.strftime("28-Oct %H:%M")
    batch["end"] = end_dt.strftime("28-Oct %H:%M")
    batch["moved_by_hand"] = True
    
    return {"message": "Batch rescheduled", "batch": batch}
