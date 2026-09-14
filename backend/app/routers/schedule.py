from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from app.db.database import get_db
from app.models.schedule_models import ProductionSchedule, ScheduleQualityScoreLog
from app.models.factory_models import Machine, Colour, ChangeoverMatrixItem, MachineMaintenance, FactoryUtility, Employee
from app.models.order_models import Order
from app.schemas.schemas import ScheduleSlotResponse, QualityScoreResponse, OrderCreate, ScheduleSlotUpdateRequest, MatrixEditRequest
from app.services.scheduler_service import SchedulerService
from app.services.matrix_service import get_planning_matrix_data, execute_matrix_action
from app.core.changeover import calculate_changeover_penalty
from app.core.rush_insertion import evaluate_rush_order_insertion
from app.core.hierarchy import filter_schedule_by_tier
from app.core.buffers import validate_seven_day_planning_rule
from app.core.toc_engine import identify_system_bottleneck

router = APIRouter(prefix="/api/schedule", tags=["Schedule"])

@router.post("/generate")
def generate_schedule(db: Session = Depends(get_db)):
    scheduler = SchedulerService(db)
    result = scheduler.generate_full_schedule()
    return result

@router.get("/slots", response_model=List[ScheduleSlotResponse])
def get_schedule_slots(
    tier: str = Query("WEEKLY", description="DAILY, WEEKLY, or MONTHLY"),
    machine_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(ProductionSchedule)
    if machine_id:
        query = query.filter(ProductionSchedule.machine_id == machine_id)
        
    schedules = query.order_by(ProductionSchedule.planned_start.asc()).all()
    
    # Filter by tier
    filtered = filter_schedule_by_tier(schedules, tier, datetime.utcnow())

    result = []
    for s in filtered:
        o = s.order
        m = s.machine
        op = s.operator
        cust_name = o.customer.name if (o and o.customer) else "Customer"

        result.append(ScheduleSlotResponse(
            id=s.id,
            schedule_tier=s.schedule_tier,
            order_id=s.order_id,
            order_number=o.order_number if o else f"ORD-{s.order_id}",
            customer_name=cust_name,
            cloth_type=o.cloth_type if o else "Cotton",
            quantity_kg=o.quantity_kg if o else 500.0,
            colour_name=o.colour_name if o else "Navy",
            colour_code=o.colour_code if o else "NAVY",
            batch_number=s.batch.batch_number if s.batch else 1,
            total_batches=s.batch.total_batches if s.batch else 1,
            machine_id=s.machine_id,
            machine_name=m.name if m else f"Machine #{s.machine_id}",
            operator_id=s.operator_id,
            operator_name=op.name if op else None,
            planned_start=s.planned_start,
            planned_end=s.planned_end,
            base_processing_min=s.base_processing_min,
            setup_min=s.setup_min,
            changeover_min=s.changeover_min,
            cleaning_min=s.cleaning_min,
            drum_buffer_min=s.drum_buffer_min,
            shipping_buffer_min=s.shipping_buffer_min,
            buffer_penetration_pct=o.buffer_penetration_pct if o else 0.0,
            status=s.status,
            is_locked=s.is_locked,
            freeze_level=s.freeze_level,
            priority=o.priority if o else "MEDIUM",
            due_date=o.due_date if o else None,
            scheduling_reason=s.scheduling_reason,
            operating_cost_inr=s.operating_cost_inr
        ))
    return result

@router.post("/override")
def manual_schedule_override(
    schedule_id: int,
    new_machine_id: int,
    new_start_time: datetime,
    force_override: bool = False,
    db: Session = Depends(get_db)
):
    """
    Manual Override with Constraint Validation:
    Allows manager to drag-and-drop or modify a slot, but validates:
    - Machine compatibility
    - Capacity limit
    - Freeze window restrictions
    - Downstream delay consequences
    """
    sched = db.query(ProductionSchedule).filter(ProductionSchedule.id == schedule_id).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule slot not found")

    new_machine = db.query(Machine).filter(Machine.id == new_machine_id).first()
    if not new_machine:
        raise HTTPException(status_code=404, detail="Target machine not found")

    order = sched.order

    # 1. Compatibility check
    if order and order.cloth_type.lower() not in (new_machine.compatible_cloth_types or "").lower():
        if not force_override:
            return {
                "success": False,
                "warning": f"INCOMPATIBLE FABRIC: Machine '{new_machine.name}' is not rated for '{order.cloth_type}'. Confirm to force."
            }

    # 2. Capacity check
    if order and order.quantity_kg > new_machine.max_batch_kg:
        return {
            "success": False,
            "error": f"CAPACITY EXCEEDED: Order weight {order.quantity_kg}kg exceeds max machine batch of {new_machine.max_batch_kg}kg. Order must be split."
        }

    # 3. Freeze window warning
    if sched.is_locked and not force_override:
        return {
            "success": False,
            "warning": f"FREEZE WINDOW LOCKED: This slot is in the {sched.freeze_level} window. Modifying it will disrupt locked factory floor operations."
        }

    # Apply change
    duration = sched.planned_end - sched.planned_start
    sched.machine_id = new_machine_id
    sched.planned_start = new_start_time
    sched.planned_end = new_start_time + duration
    sched.scheduling_reason = f"MANUAL OVERRIDE: Reassigned to {new_machine.name} by Production Manager."

    if order:
        order.assigned_machine_id = new_machine_id
        order.planned_start = sched.planned_start
        order.planned_completion = sched.planned_end

    db.commit()

    return {
        "success": True,
        "message": f"Successfully reassigned slot #{schedule_id} to {new_machine.name}.",
        "new_start": sched.planned_start.isoformat(),
        "new_end": sched.planned_end.isoformat()
    }

@router.post("/slots/{slot_id}/toggle-lock")
def toggle_slot_lock(slot_id: int, db: Session = Depends(get_db)):
    """Toggles freeze lock status (LOCKED vs FLEXIBLE) for a production schedule slot."""
    sched = db.query(ProductionSchedule).filter(ProductionSchedule.id == slot_id).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule slot not found")

    sched.is_locked = not sched.is_locked
    if sched.is_locked:
        sched.freeze_level = "LOCKED"
        sched.scheduling_reason = f"LOCKED: Pinned by Production Manager at {datetime.utcnow().strftime('%H:%M')}."
    else:
        sched.freeze_level = "FLEXIBLE"
        sched.scheduling_reason = "UNLOCKED: Flexible scheduling horizon."

    db.commit()
    return {
        "success": True,
        "slot_id": slot_id,
        "is_locked": sched.is_locked,
        "freeze_level": sched.freeze_level,
        "message": f"Slot #{slot_id} is now {'LOCKED (protected from dynamic shift)' if sched.is_locked else 'UNLOCKED (flexible horizon)'}."
    }

@router.post("/slots/{slot_id}/update-and-reorganize")
def update_and_reorganize_slot(
    slot_id: int,
    req: ScheduleSlotUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Dynamic Schedule Reorganization:
    1. Validates machine compatibility, capacity, maintenance windows, and locked job collisions.
    2. Updates target slot & order properties.
    3. Cascades and reorganizes downstream unlocked slots on target machine (and compacts source machine if changed).
    4. Recalculates sequence-dependent changeovers using the colour sequence matrix.
    5. Updates Drum-Buffer-Rope buffer penetration & shipping buffers.
    6. Returns a detailed diff of all shifts and metric impacts across the plant.
    """
    sched = db.query(ProductionSchedule).filter(ProductionSchedule.id == slot_id).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule slot not found")

    order = sched.order
    old_machine_id = sched.machine_id
    target_machine_id = req.machine_id if req.machine_id is not None else sched.machine_id
    target_machine = db.query(Machine).filter(Machine.id == target_machine_id).first()
    if not target_machine:
        raise HTTPException(status_code=404, detail="Target machine not found")

    # 1. Compatibility check (if machine or fabric is changed)
    cloth = req.cloth_type or (order.cloth_type if order else "Cotton")
    if (target_machine_id != old_machine_id or (req.cloth_type and order and req.cloth_type != order.cloth_type)):
        if cloth.lower() not in (target_machine.compatible_cloth_types or "").lower():
            if not req.force_override:
                return {
                    "success": False,
                    "warning": f"INCOMPATIBLE FABRIC: Machine '{target_machine.name}' is not certified for '{cloth}'. Confirm to force override."
                }

    # 2. Capacity check
    qty = req.quantity_kg if req.quantity_kg is not None else (order.quantity_kg if order else 500.0)
    if qty > target_machine.max_batch_kg:
        return {
            "success": False,
            "error": f"CAPACITY EXCEEDED: Batch weight {qty:.0f} kg exceeds max capacity of {target_machine.name} ({target_machine.max_batch_kg:.0f} kg)."
        }

    # 3. Determine proposed timing
    original_duration = sched.planned_end - sched.planned_start
    if req.planned_start:
        new_start = req.planned_start
    else:
        new_start = sched.planned_start

    if req.planned_end:
        new_end = req.planned_end
    else:
        new_end = new_start + original_duration

    # 4. Check for maintenance window collisions on target machine
    maints = db.query(MachineMaintenance).filter(
        MachineMaintenance.machine_id == target_machine_id,
        MachineMaintenance.status.in_(["SCHEDULED", "IN_PROGRESS"])
    ).all()
    for mnt in maints:
        if new_start < mnt.end_time and new_end > mnt.start_time:
            return {
                "success": False,
                "error": f"MAINTENANCE CONFLICT: Machine '{target_machine.name}' is reserved for maintenance ('{mnt.title}' from {mnt.start_time.strftime('%H:%M')} to {mnt.end_time.strftime('%H:%M')}). Please choose a different time window or machine."
            }

    # 5. Check for Locked Job collision on target machine
    locked_slots = db.query(ProductionSchedule).filter(
        ProductionSchedule.machine_id == target_machine_id,
        ProductionSchedule.id != slot_id,
        ProductionSchedule.is_locked == True
    ).all()

    for ls in locked_slots:
        if new_start < ls.planned_end and new_end > ls.planned_start:
            if not req.force_unlock_conflicts:
                ls_ord_name = ls.order.order_number if ls.order else f"ORD-{ls.order_id}"
                return {
                    "success": False,
                    "conflict": True,
                    "locked_slot_id": ls.id,
                    "locked_order": ls_ord_name,
                    "locked_start": ls.planned_start.isoformat(),
                    "locked_end": ls.planned_end.isoformat(),
                    "machine_name": target_machine.name,
                    "message": f"COLLISION WITH LOCKED TASK: The selected slot overlaps with locked job {ls_ord_name} ({ls.planned_start.strftime('%d %b %H:%M')} - {ls.planned_end.strftime('%H:%M')}) on {target_machine.name}."
                }
            else:
                # User selected "Unlock Conflicting Task & Re-Optimize"
                ls.is_locked = False
                ls.freeze_level = "FLEXIBLE"
                ls.scheduling_reason = f"UNLOCKED: Re-optimized following conflict with slot #{slot_id}."

    # Record snapshot of all schedules before reorganization for diff tracking
    pre_snapshot = {}
    for s in db.query(ProductionSchedule).all():
        pre_snapshot[s.id] = {
            "order_number": s.order.order_number if s.order else f"ORD-{s.order_id}",
            "machine_id": s.machine_id,
            "machine_name": s.machine.name if s.machine else f"Machine #{s.machine_id}",
            "planned_start": s.planned_start,
            "planned_end": s.planned_end,
            "changeover_min": s.changeover_min
        }

    # 6. Apply updates to the target slot & order
    sched.machine_id = target_machine_id
    sched.planned_start = new_start
    sched.planned_end = new_end
    sched.is_locked = True
    sched.freeze_level = "LOCKED"
    sched.scheduling_reason = f"MANUAL EDIT: Pinned by Production Manager at {datetime.utcnow().strftime('%H:%M')}."

    if req.status:
        sched.status = req.status
    if req.operator_id:
        sched.operator_id = req.operator_id
    if req.changeover_min is not None:
        sched.changeover_min = req.changeover_min

    if order:
        if req.quantity_kg is not None:
            order.quantity_kg = req.quantity_kg
        if req.cloth_type:
            order.cloth_type = req.cloth_type
        if req.colour_name:
            order.colour_name = req.colour_name
        if req.colour_code:
            order.colour_code = req.colour_code
        if req.operator_id:
            order.assigned_operator_id = req.operator_id
        if req.status:
            order.status = req.status
        order.assigned_machine_id = target_machine_id
        order.planned_start = new_start
        order.planned_completion = new_end

    # 7. Helper to reorganize and cascade a machine queue
    def reorganize_machine_queue(m_id: int):
        m_slots = db.query(ProductionSchedule).filter(
            ProductionSchedule.machine_id == m_id,
            ProductionSchedule.status.in_(["SCHEDULED", "IN_PROGRESS"])
        ).order_by(ProductionSchedule.planned_start.asc()).all()

        m_maints = db.query(MachineMaintenance).filter(
            MachineMaintenance.machine_id == m_id,
            MachineMaintenance.status.in_(["SCHEDULED", "IN_PROGRESS"])
        ).order_by(MachineMaintenance.start_time.asc()).all()

        mach = db.query(Machine).filter(Machine.id == m_id).first()
        mach_type = mach.machine_type if mach else "JET_DYEING"

        # Walk through slots sequentially and cascade downstream
        for i in range(len(m_slots)):
            curr = m_slots[i]
            if i == 0:
                continue

            prev = m_slots[i - 1]

            # Recalculate changeover penalty from prev to curr
            prev_colour = prev.order.colour_code if (prev.order and prev.order.colour_code) else "WHITE"
            prev_fabric = prev.order.cloth_type if (prev.order and prev.order.cloth_type) else "Cotton"
            curr_colour = curr.order.colour_code if (curr.order and curr.order.colour_code) else "WHITE"
            curr_fabric = curr.order.cloth_type if (curr.order and curr.order.cloth_type) else "Cotton"

            co_res = calculate_changeover_penalty(
                from_fabric=prev_fabric,
                from_colour=prev_colour,
                to_fabric=curr_fabric,
                to_colour=curr_colour,
                machine_type=mach_type
            )
            calc_co = co_res["changeover_min"]

            # If curr slot is unlocked, update its changeover and cascade if overlapping
            if not curr.is_locked:
                curr.changeover_min = calc_co
                curr.cleaning_min = co_res.get("cleaning_min", round(calc_co * 0.6))

                earliest_possible_start = prev.planned_end + timedelta(minutes=calc_co)
                duration = curr.planned_end - curr.planned_start
                if curr.planned_start < earliest_possible_start:
                    curr.planned_start = earliest_possible_start
                    curr.planned_end = earliest_possible_start + duration

                # Check against maintenance windows
                for mnt in m_maints:
                    if curr.planned_start < mnt.end_time and curr.planned_end > mnt.start_time:
                        curr.planned_start = mnt.end_time + timedelta(minutes=calc_co)
                        curr.planned_end = curr.planned_start + duration

                if curr.order:
                    curr.order.planned_start = curr.planned_start
                    curr.order.planned_completion = curr.planned_end

    reorganize_machine_queue(target_machine_id)
    if old_machine_id != target_machine_id:
        reorganize_machine_queue(old_machine_id)

    # 8. Re-evaluate buffer penetration and 7-day rule for all active orders
    all_orders = db.query(Order).filter(Order.status.in_(["PENDING", "SCHEDULED", "IN_PROGRESS"])).all()
    buffer_alerts = []
    for ord_obj in all_orders:
        if ord_obj.planned_completion and ord_obj.due_date and ord_obj.order_date:
            total_lead = max(1.0, (ord_obj.due_date - ord_obj.order_date).total_seconds() / 86400.0)
            slack_days = (ord_obj.due_date - ord_obj.planned_completion).total_seconds() / 86400.0
            penetration = max(0.0, min(100.0, ((total_lead - slack_days) / total_lead) * 100.0))
            old_status = "CRITICAL" if ord_obj.buffer_penetration_pct > 66 else ("WARNING" if ord_obj.buffer_penetration_pct > 33 else "SAFE")
            ord_obj.buffer_penetration_pct = round(penetration, 1)
            new_status = "CRITICAL" if penetration > 66 else ("WARNING" if penetration > 33 else "SAFE")

            if old_status != new_status and ord_obj.id != (order.id if order else None):
                buffer_alerts.append({
                    "order_number": ord_obj.order_number,
                    "old_status": old_status,
                    "new_status": new_status,
                    "penetration_pct": round(penetration, 1)
                })

            # 7-day rule removed
            ord_obj.seven_day_rule_violated = False
            ord_obj.seven_day_rule_diagnostic = None


    # 9. Compute Diff of what changed
    shifted_jobs = []
    total_co_delta = 0.0
    all_post = db.query(ProductionSchedule).all()
    for ps in all_post:
        pre = pre_snapshot.get(ps.id)
        if not pre:
            continue
        delta_min = round((ps.planned_start - pre["planned_start"]).total_seconds() / 60.0)
        co_diff = ps.changeover_min - pre["changeover_min"]
        total_co_delta += co_diff

        if abs(delta_min) >= 1 and ps.id != slot_id:
            shifted_jobs.append({
                "slot_id": ps.id,
                "order_number": ps.order.order_number if ps.order else f"ORD-{ps.order_id}",
                "machine_name": ps.machine.name if ps.machine else f"Machine #{ps.machine_id}",
                "old_start": pre["planned_start"].strftime("%d %b %H:%M"),
                "new_start": ps.planned_start.strftime("%d %b %H:%M"),
                "delta_min": delta_min,
                "direction": "DELAYED" if delta_min > 0 else "ADVANCED",
                "reason": "Cascaded downstream following manual schedule reorganization."
            })

    db.commit()

    # Calculate overall bottleneck & quality score update
    machines = db.query(Machine).filter(Machine.status != "BREAKDOWN").all()
    utilities = db.query(FactoryUtility).all()
    bottleneck_info = identify_system_bottleneck(machines, all_orders, utilities, horizon_days=7)

    return {
        "success": True,
        "message": f"Successfully updated slot #{slot_id} ({order.order_number if order else ''}) and reorganized plant schedule.",
        "diff": {
            "target_slot_id": slot_id,
            "target_order": order.order_number if order else f"ORD-{sched.order_id}",
            "shifted_jobs_count": len(shifted_jobs),
            "shifted_jobs": shifted_jobs,
            "changeover_delta_min": round(total_co_delta, 1),
            "bottleneck_resource": bottleneck_info.get("resource_name", "Vessel M2"),
            "bottleneck_utilization_pct": bottleneck_info.get("utilization_pct", 89.5),
            "buffer_alerts": buffer_alerts
        }
    }

@router.post("/rush-insert")
def test_rush_order_insertion(order_in: OrderCreate, db: Session = Depends(get_db)):
    """
    Smart Rush Order Insertion:
    Evaluates candidate insertion points across compatible machines to identify
    the slot with lowest Total Disruption Damage.
    """
    machines = db.query(Machine).all()
    schedules = db.query(ProductionSchedule).order_by(ProductionSchedule.planned_start.asc()).all()
    
    mach_schedules = {}
    for m in machines:
        mach_schedules[m.id] = [s for s in schedules if s.machine_id == m.id]

    analysis = evaluate_rush_order_insertion(
        emergency_order=order_in,
        existing_machine_schedules=mach_schedules,
        machines=machines,
        reference_now=datetime.utcnow()
    )
    return analysis

@router.get("/quality-score", response_model=QualityScoreResponse)
def get_schedule_quality_score(db: Session = Depends(get_db)):
    latest_log = db.query(ScheduleQualityScoreLog).order_by(ScheduleQualityScoreLog.calculated_at.desc()).first()
    
    if not latest_log:
        return QualityScoreResponse(
            overall_score=92.5,
            grade="EXCELLENT",
            sub_scores={
                "on_time_delivery": 33.5,
                "bottleneck_utilization": 18.5,
                "material_feasibility": 9.5,
                "manpower_feasibility": 5.0,
                "changeover_efficiency": 9.2,
                "machine_utilization": 8.8,
                "buffer_and_stability": 9.0
            },
            score_explanations=["Baseline schedule generated with healthy buffers and minimal changeovers."],
            recommendations_to_reach_100=["Advance 2 medium-priority orders to eliminate bottleneck idle gap on Day 3."]
        )

    grade = "EXCELLENT" if latest_log.overall_score >= 90 else ("GOOD" if latest_log.overall_score >= 78 else "MODERATE")
    explanations = latest_log.explanation_text.split("; ") if latest_log.explanation_text else ["Schedule optimized according to TOC principles."]

    return QualityScoreResponse(
        overall_score=latest_log.overall_score,
        grade=grade,
        sub_scores={
            "on_time_delivery": latest_log.on_time_delivery_score,
            "bottleneck_utilization": latest_log.bottleneck_utilization_score,
            "material_feasibility": latest_log.material_feasibility_score,
            "manpower_feasibility": latest_log.manpower_feasibility_score,
            "changeover_efficiency": latest_log.changeover_efficiency_score,
            "machine_utilization": latest_log.machine_utilization_score,
            "buffer_and_stability": latest_log.buffer_safety_score
        },
        score_explanations=explanations,
        recommendations_to_reach_100=[
            "Sequence dark shades consecutively on Jet M2 to eliminate caustic washouts.",
            "Confirm arrival of Disperse Navy dye PO-2026-889 to unlock provisional slots."
        ]
    )

@router.get("/daily-agenda")
def get_daily_agenda(
    days: int = Query(7, description="Number of days to view: 7 for 1-Week or 30 for 1-Month"),
    db: Session = Depends(get_db)
):
    """
    Returns day-by-day production agenda broken down by shifts (Morning, Afternoon, Night),
    detailing exact machine operations, changeovers, batches, and maintenance windows.
    """
    now = datetime.utcnow()
    start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_date = start_date + timedelta(days=days)

    schedules = db.query(ProductionSchedule).filter(
        ProductionSchedule.status.in_(["SCHEDULED", "IN_PROGRESS", "COMPLETED"]),
        ProductionSchedule.planned_start >= start_date - timedelta(days=1),
        ProductionSchedule.planned_start < end_date + timedelta(days=1)
    ).order_by(ProductionSchedule.planned_start.asc()).all()

    maintenances = db.query(MachineMaintenance).filter(
        MachineMaintenance.start_time >= start_date - timedelta(days=1),
        MachineMaintenance.start_time < end_date + timedelta(days=1)
    ).all()

    # Build calendar day map for the requested horizon
    agenda_days = []
    for day_offset in range(days):
        current_day_start = start_date + timedelta(days=day_offset)
        current_day_end = current_day_start + timedelta(days=1)
        date_str = current_day_start.strftime("%Y-%m-%d")
        
        # Determine relative day label
        if day_offset == 0:
            rel_label = "Today"
        elif day_offset == 1:
            rel_label = "Tomorrow"
        else:
            rel_label = f"Day +{day_offset}"

        shift_b_start = current_day_start + timedelta(hours=14)
        shift_c_start = current_day_start + timedelta(hours=22)

        shifts_data = {
            "SHIFT_A": {"name": "Shift A (Morning 06:00 - 14:00)", "tasks": []},
            "SHIFT_B": {"name": "Shift B (Afternoon 14:00 - 22:00)", "tasks": []},
            "SHIFT_C": {"name": "Shift C (Night 22:00 - 06:00)", "tasks": []}
        }

        day_total_kg = 0.0
        day_changeover_min = 0.0
        day_jobs_count = 0
        day_maint_hours = 0.0

        # Assign scheduled production slots to this day & shift
        for s in schedules:
            if current_day_start <= s.planned_start < current_day_end:
                o = s.order
                m = s.machine
                op = s.operator
                qty = o.quantity_kg if o else 0.0
                day_total_kg += qty
                day_changeover_min += s.changeover_min
                day_jobs_count += 1

                task_obj = {
                    "id": s.id,
                    "slot_id": s.id,
                    "type": "PRODUCTION",
                    "order_id": s.order_id,
                    "order_number": o.order_number if o else f"ORD-{s.order_id}",
                    "customer_name": o.customer.name if (o and o.customer) else "Customer",
                    "machine_id": s.machine_id,
                    "machine_code": m.code if m else "MACH",
                    "machine_name": m.name if m else f"Machine #{s.machine_id}",
                    "cloth_type": o.cloth_type if o else "Cotton",
                    "colour_name": o.colour_name if o else "Navy",
                    "colour_code": o.colour_code if o else "NAVY",
                    "quantity_kg": qty,
                    "planned_start": s.planned_start.isoformat(),
                    "planned_end": s.planned_end.isoformat(),
                    "start_time_str": s.planned_start.strftime("%H:%M"),
                    "end_time_str": s.planned_end.strftime("%H:%M"),
                    "duration_min": round((s.planned_end - s.planned_start).total_seconds() / 60.0),
                    "base_processing_min": s.base_processing_min,
                    "setup_min": s.setup_min,
                    "changeover_min": s.changeover_min,
                    "cleaning_min": s.cleaning_min,
                    "operator_id": s.operator_id,
                    "operator_name": op.name if op else "Rajesh Kumar",
                    "status": s.status,
                    "is_locked": s.is_locked,
                    "freeze_level": s.freeze_level,
                    "priority": o.priority if o else "MEDIUM",
                    "due_date": o.due_date.isoformat() if (o and o.due_date) else None,
                    "buffer_penetration_pct": o.buffer_penetration_pct if o else 0.0,
                    "seven_day_rule_violated": o.seven_day_rule_violated if o else False,
                    "scheduling_reason": s.scheduling_reason
                }

                if s.planned_start < shift_b_start:
                    task_obj["shift"] = "SHIFT_A"
                    task_obj["shift_label"] = "Shift A (06:00 - 14:00)"
                    shifts_data["SHIFT_A"]["tasks"].append(task_obj)
                elif s.planned_start < shift_c_start:
                    task_obj["shift"] = "SHIFT_B"
                    task_obj["shift_label"] = "Shift B (14:00 - 22:00)"
                    shifts_data["SHIFT_B"]["tasks"].append(task_obj)
                else:
                    task_obj["shift"] = "SHIFT_C"
                    task_obj["shift_label"] = "Shift C (22:00 - 06:00)"
                    shifts_data["SHIFT_C"]["tasks"].append(task_obj)

        # Assign scheduled maintenance windows to this day & shift
        for mnt in maintenances:
            if current_day_start <= mnt.start_time < current_day_end:
                m_hours = round((mnt.end_time - mnt.start_time).total_seconds() / 3600.0, 1)
                day_maint_hours += m_hours
                mach = mnt.machine

                maint_task = {
                    "id": f"maint-{mnt.id}",
                    "type": "MAINTENANCE",
                    "title": mnt.title,
                    "machine_id": mnt.machine_id,
                    "machine_code": mach.code if mach else "MACH",
                    "machine_name": mach.name if mach else f"Machine #{mnt.machine_id}",
                    "planned_start": mnt.start_time.isoformat(),
                    "planned_end": mnt.end_time.isoformat(),
                    "start_time_str": mnt.start_time.strftime("%H:%M"),
                    "end_time_str": mnt.end_time.strftime("%H:%M"),
                    "duration_hours": m_hours,
                    "duration_min": round(m_hours * 60),
                    "maintenance_type": mnt.maintenance_type,
                    "status": mnt.status,
                    "notes": mnt.notes
                }

                if mnt.start_time < shift_b_start:
                    maint_task["shift"] = "SHIFT_A"
                    maint_task["shift_label"] = "Shift A (06:00 - 14:00)"
                    shifts_data["SHIFT_A"]["tasks"].append(maint_task)
                elif mnt.start_time < shift_c_start:
                    maint_task["shift"] = "SHIFT_B"
                    maint_task["shift_label"] = "Shift B (14:00 - 22:00)"
                    shifts_data["SHIFT_B"]["tasks"].append(maint_task)
                else:
                    maint_task["shift"] = "SHIFT_C"
                    maint_task["shift_label"] = "Shift C (22:00 - 06:00)"
                    shifts_data["SHIFT_C"]["tasks"].append(maint_task)

        agenda_days.append({
            "date": date_str,
            "day_name": current_day_start.strftime("%A"),
            "formatted_date": current_day_start.strftime("%b %d, %Y"),
            "rel_label": rel_label,
            "day_offset": day_offset,
            "total_kg": round(day_total_kg, 1),
            "jobs_count": day_jobs_count,
            "changeover_min": round(day_changeover_min, 1),
            "maintenance_hours": round(day_maint_hours, 1),
            "shifts": shifts_data
        })

    return {
        "view_mode": "MONTH" if days > 14 else "WEEK",
        "horizon_days": days,
        "total_planned_kg": round(sum(d["total_kg"] for d in agenda_days), 1),
        "total_jobs": sum(d["jobs_count"] for d in agenda_days),
        "days": agenda_days
    }

@router.get("/changeover-matrix")
def get_changeover_matrix(
    fabric: str = Query("Cotton", description="Fabric type"),
    machine_type: str = Query("JET_DYEING", description="Machine type")
):
    colours = ["WHITE", "SKY_BLUE", "GOLDEN_YELLOW", "ROYAL_BLUE", "SCARLET_RED", "DEEP_NAVY", "JET_BLACK"]
    matrix = []
    
    for c_from in colours:
        row = {"from_colour": c_from, "transitions": {}}
        for c_to in colours:
            pen = calculate_changeover_penalty(fabric, c_from, fabric, c_to, machine_type)
            row["transitions"][c_to] = {
                "changeover_min": pen["changeover_min"],
                "water_litres": pen["water_litres"],
                "chem_cost": pen["chemical_cost_inr"]
            }
        matrix.append(row)
        
    return matrix

@router.post("/changeover-calculate")
def calculate_single_changeover(
    from_colour: str = Query(..., description="From colour code"),
    to_colour: str = Query(..., description="To colour code"),
    from_fabric: str = Query("Cotton", description="From fabric"),
    to_fabric: str = Query("Cotton", description="To fabric"),
    machine_type: str = Query("JET_DYEING", description="Machine type")
):
    return calculate_changeover_penalty(from_fabric, from_colour, to_fabric, to_colour, machine_type)

@router.get("/planning-matrix")
def get_production_planning_matrix(
    days: int = Query(7, description="Planning horizon in days"),
    db: Session = Depends(get_db)
):
    """
    Excel-like Production Planning Matrix:
    Provides dynamic machine columns (Cap, Load, Util %, Bottleneck indicator),
    sticky order data (Order #, Quantity, Planned Day), and machine work cells.
    """
    return get_planning_matrix_data(db, horizon_days=days)

@router.post("/matrix/edit")
def edit_production_planning_matrix(
    req: MatrixEditRequest,
    db: Session = Depends(get_db)
):
    """
    Manual Edit from Production Planning Matrix with Full TOC DBR Plant Reorganization:
    - Supports ASSIGN, MOVE, REMOVE, UPDATE_ROW, ADD_ORDER, DELETE_ORDER, TOGGLE_LOCK.
    - Validates machine capacity, maintenance windows, and locked order collisions.
    - Re-sequences colour changeover matrix penalties.
    - Recomputes dynamic bottleneck and DBR buffer penetration.
    - Synchronizes state across Matrix, Gantt, and Dashboard.
    """
    result = execute_matrix_action(db, req)
    if not result.get("success") and not result.get("conflict"):
        raise HTTPException(status_code=400, detail=result.get("error", "Failed to execute matrix edit"))
    return result

