from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import math
from sqlalchemy.orm import Session

from app.models.factory_models import Machine, Colour, MachineMaintenance, FactoryUtility
from app.models.order_models import Order
from app.models.schedule_models import ProductionSchedule
from app.core.changeover import calculate_changeover_penalty
from app.core.processing_time import calculate_composite_processing_time, get_calibrated_base_time
from app.core.batch_splitter import is_cloth_compatible, get_compatible_machines
from app.core.toc_engine import identify_system_bottleneck
from app.services.scheduler_service import calculate_machine_daily_capacity


def calculate_order_time_estimate(
    db: Session,
    quantity_kg: float,
    colour_code: str,
    due_date: datetime,
    cloth_type: str = "Cotton",
    reference_now: Optional[datetime] = None
) -> Dict[str, Any]:
    """
    Non-destructive Approximate Time Calculator for New Order:
    Evaluates ALL available machines in the factory for a potential new order.
    Automatically determines the recommended machine, earliest feasible start and completion,
    changeover impact, and due-date feasibility without modifying existing database rows.
    """
    now = reference_now or datetime.utcnow()
    if getattr(due_date, 'tzinfo', None) is not None:
        due_date = due_date.replace(tzinfo=None)
    if getattr(now, 'tzinfo', None) is not None:
        now = now.replace(tzinfo=None)
    today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    due_midnight = due_date.replace(hour=0, minute=0, second=0, microsecond=0)

    # 1. Fetch all operational machines
    all_machines = db.query(Machine).order_by(Machine.id.asc()).all()
    operational_machines = [m for m in all_machines if m.status != "BREAKDOWN"]

    if not operational_machines:
        return {
            "status": "ERROR",
            "message": "No operational machines currently available in factory fleet.",
            "recommended_machine": None,
            "alternative_machines": []
        }

    # Fetch active maintenance records
    machine_maintenances: Dict[int, List[MachineMaintenance]] = {}
    for m in all_machines:
        maints = db.query(MachineMaintenance).filter(
            MachineMaintenance.machine_id == m.id,
            MachineMaintenance.status.in_(["IN_PROGRESS", "SCHEDULED"]),
            MachineMaintenance.end_time > now
        ).all()
        machine_maintenances[m.id] = maints

    # 2. Identify TOC Drum Bottleneck
    active_orders = db.query(Order).filter(Order.status.in_(["PENDING", "PROCESSING", "IN_PRODUCTION"])).all()
    utilities = db.query(FactoryUtility).all()
    bottleneck_info = identify_system_bottleneck(all_machines, active_orders, utilities, horizon_days=14)
    bottleneck_resource = bottleneck_info.get("resource_name", "")

    # Retrieve existing scheduled slots
    existing_slots = db.query(ProductionSchedule).filter(
        ProductionSchedule.status.in_(["SCHEDULED", "IN_PROGRESS"])
    ).order_by(ProductionSchedule.planned_start.asc()).all()

    slots_by_machine: Dict[int, List[ProductionSchedule]] = {m.id: [] for m in all_machines}
    for s in existing_slots:
        if s.machine_id in slots_by_machine:
            slots_by_machine[s.machine_id].append(s)

    # Color information lookup
    colour_record = db.query(Colour).filter(
        (Colour.code == colour_code) | (Colour.name.ilike(f"%{colour_code}%"))
    ).first()
    resolved_colour_name = colour_record.name if colour_record else colour_code
    resolved_colour_code = colour_record.code if colour_record else colour_code.upper()
    colour_hex = colour_record.hex_code if colour_record else "#2563EB"

    # 3. Evaluate Every Operational Machine
    machine_evaluations: List[Dict[str, Any]] = []

    for m in operational_machines:
        # Check cloth compatibility
        is_compat = is_cloth_compatible(cloth_type, m.compatible_cloth_types)
        if not is_compat and m.compatible_cloth_types:
            machine_evaluations.append({
                "machine_id": m.id,
                "machine_code": m.code,
                "machine_name": m.name,
                "machine_type": m.machine_type,
                "is_suitable": False,
                "unsuitability_reason": f"Incompatible with {cloth_type} (Supports: {m.compatible_cloth_types})",
                "estimated_start": None,
                "estimated_completion": None,
                "production_hours": None,
                "changeover_min": None,
                "is_on_time": False,
                "delay_hours": 0.0,
                "due_status": "INCOMPATIBLE",
                "is_bottleneck": (m.name == bottleneck_resource or m.code in bottleneck_resource),
                "current_workload_kg": 0.0,
                "daily_capacity_kg": float(getattr(m, "capacity_kg", None) or getattr(m, "max_batch_kg", 500.0)),
                "explanation": f"Machine {m.code} cannot process {cloth_type}."
            })
            continue

        # Inspect existing daily loads for this machine
        m_slots = slots_by_machine.get(m.id, [])
        m_daily_loads: Dict[int, float] = {}
        for s in m_slots:
            if s.planned_start:
                s_day = (s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_midnight).days + 1
                if s_day >= 1:
                    qty = (s.batch.batch_quantity_kg if s.batch else (s.order.quantity_kg if s.order else m.max_batch_kg))
                    m_daily_loads[s_day] = m_daily_loads.get(s_day, 0.0) + qty

        tot_scheduled_kg = sum(m_daily_loads.values())

        # Determine last colour and last fabric on machine before new order
        last_colour = "WHITE"
        last_fabric = "Cotton"
        last_slot_end: Optional[datetime] = None

        if m_slots:
            last_slot = m_slots[-1]
            last_slot_end = last_slot.planned_end
            if last_slot.order:
                last_colour = last_slot.order.colour_code or last_colour
                last_fabric = last_slot.order.cloth_type or last_fabric

        # Calculate changeover penalty from previous shade to new order shade
        co_penalty = calculate_changeover_penalty(
            from_fabric=last_fabric,
            from_colour=last_colour,
            to_fabric=cloth_type,
            to_colour=resolved_colour_code,
            machine_type=m.machine_type
        )
        changeover_min = co_penalty["changeover_min"]

        # Calculate composite processing time
        calibrated_base = get_calibrated_base_time(cloth_type, resolved_colour_name, db)
        proc_time_data = calculate_composite_processing_time(
            cloth_type=cloth_type,
            colour_name=resolved_colour_name,
            quantity_kg=quantity_kg,
            changeover_min=changeover_min,
            machine_efficiency=getattr(m, "efficiency", 0.92),
            historical_calibrated_base_min=calibrated_base
        )
        total_proc_min = proc_time_data["total_processing_min"]
        total_proc_hours = proc_time_data["total_processing_hours"]

        # Simulate day-by-day capacity allocation
        needed_qty = float(quantity_kg)
        current_search_day = 1
        max_horizon_days = 60
        allocated_days: List[int] = []

        while needed_qty > 0.05 and current_search_day <= max_horizon_days:
            day_cap = calculate_machine_daily_capacity(m, current_search_day, now, machine_maintenances)
            day_load = m_daily_loads.get(current_search_day, 0.0)
            avail_cap = max(0.0, day_cap - day_load)

            if avail_cap >= 10.0:  # usable capacity chunk
                take_qty = min(needed_qty, avail_cap)
                needed_qty = round(needed_qty - take_qty, 1)
                allocated_days.append(current_search_day)

            current_search_day += 1

        if not allocated_days:
            allocated_days = [1]

        first_day = allocated_days[0]
        last_day = allocated_days[-1]

        # Calculate start timestamp on first_day
        first_day_date = today_midnight + timedelta(days=first_day - 1)
        if first_day == 1:
            shift_start = max(now + timedelta(minutes=30), first_day_date.replace(hour=8, minute=0, second=0))
        else:
            shift_start = first_day_date.replace(hour=8, minute=0, second=0)

        # If there are existing slots on first_day, start after the last slot on that day
        first_day_slots = [
            s for s in m_slots
            if s.planned_start and (s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_midnight).days + 1 == first_day
        ]
        if first_day_slots and first_day_slots[-1].planned_end:
            candidate_start = max(shift_start, first_day_slots[-1].planned_end + timedelta(minutes=changeover_min))
        elif last_slot_end and last_slot_end > shift_start:
            candidate_start = last_slot_end + timedelta(minutes=changeover_min)
        else:
            candidate_start = shift_start

        # Check maintenance collision on start time
        for maint in machine_maintenances.get(m.id, []):
            if maint.start_time <= candidate_start < maint.end_time:
                candidate_start = maint.end_time + timedelta(minutes=15)

        estimated_start = candidate_start

        # Calculate completion timestamp on last_day
        last_day_date = today_midnight + timedelta(days=last_day - 1)
        if last_day == first_day:
            estimated_completion = estimated_start + timedelta(minutes=total_proc_min)
        else:
            # Order spans multiple days: last day finishes its final batch portion
            last_day_shift_start = last_day_date.replace(hour=8, minute=0, second=0)
            last_day_slots = [
                s for s in m_slots
                if s.planned_start and (s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_midnight).days + 1 == last_day
            ]
            if last_day_slots and last_day_slots[-1].planned_end:
                final_batch_start = max(last_day_shift_start, last_day_slots[-1].planned_end + timedelta(minutes=15))
            else:
                final_batch_start = last_day_shift_start

            # Fraction of processing time on the last day
            last_day_qty = quantity_kg / max(1, len(allocated_days))
            last_day_proc_data = calculate_composite_processing_time(
                cloth_type=cloth_type,
                colour_name=resolved_colour_name,
                quantity_kg=last_day_qty,
                changeover_min=10.0,
                machine_efficiency=getattr(m, "efficiency", 0.92)
            )
            estimated_completion = final_batch_start + timedelta(minutes=last_day_proc_data["total_processing_min"])

        # Check maintenance collision on completion
        for maint in machine_maintenances.get(m.id, []):
            if estimated_start < maint.end_time and estimated_completion > maint.start_time:
                maint_overlap = (min(estimated_completion, maint.end_time) - max(estimated_start, maint.start_time)).total_seconds() / 60.0
                estimated_completion += timedelta(minutes=maint_overlap + 15)

        # Check Due Date feasibility
        slack_seconds = (due_date - estimated_completion).total_seconds()
        is_on_time = (slack_seconds >= 0)
        delay_hours = round(max(0.0, -slack_seconds / 3600.0), 1)
        slack_hours = round(slack_seconds / 3600.0, 1)

        is_bottleneck_m = (m.name == bottleneck_resource or m.code in bottleneck_resource)
        daily_cap_kg = float(getattr(m, "capacity_kg", None) or getattr(m, "max_batch_kg", 500.0))

        # Dynamic explanation for this machine
        reasons_list = []
        if is_on_time:
            reasons_list.append(f"Completes {abs(slack_hours):.1f}h before requested due date")
        else:
            reasons_list.append(f"Delayed by {delay_hours:.1f}h past requested due date")

        if changeover_min <= 15.0:
            reasons_list.append(f"Low changeover transition ({changeover_min:.0f}m from {last_colour})")
        elif changeover_min > 45.0:
            reasons_list.append(f"Severe caustic strip changeover ({changeover_min:.0f}m from dark {last_colour})")
        else:
            reasons_list.append(f"Moderate changeover ({changeover_min:.0f}m)")

        if is_bottleneck_m:
            reasons_list.append("Active plant Drum bottleneck machine")
        else:
            reasons_list.append("Non-bottleneck vessel (safe buffer)")

        if tot_scheduled_kg > 0:
            reasons_list.append(f"Existing queue: {tot_scheduled_kg:.0f} kg")
        else:
            reasons_list.append("Zero current queue (immediately available)")

        machine_evaluations.append({
            "machine_id": m.id,
            "machine_code": m.code,
            "machine_name": m.name,
            "machine_type": m.machine_type.replace("_", " "),
            "is_suitable": True,
            "unsuitability_reason": None,
            "estimated_start": estimated_start,
            "estimated_completion": estimated_completion,
            "production_hours": total_proc_hours,
            "changeover_min": round(changeover_min, 1),
            "is_on_time": is_on_time,
            "delay_hours": delay_hours,
            "slack_hours": slack_hours,
            "due_status": "ON_TIME" if is_on_time else "LATE",
            "is_bottleneck": is_bottleneck_m,
            "current_workload_kg": round(tot_scheduled_kg, 1),
            "daily_capacity_kg": daily_cap_kg,
            "allocated_days_count": len(allocated_days),
            "preceding_colour": last_colour,
            "explanation": " • ".join(reasons_list)
        })

    # 4. Filter suitable candidates & rank them
    suitable_candidates = [me for me in machine_evaluations if me["is_suitable"]]

    if not suitable_candidates:
        return {
            "status": "NO_SUITABLE_MACHINE",
            "message": "No machine in the fleet is capable of processing this order specification.",
            "recommended_machine": None,
            "alternative_machines": machine_evaluations
        }

    # Partition into On-Time vs Late candidates
    on_time_candidates = [c for c in suitable_candidates if c["is_on_time"]]
    late_candidates = [c for c in suitable_candidates if not c["is_on_time"]]

    def candidate_score(c: Dict[str, Any]) -> float:
        score = 0.0
        # Earliest completion is best
        completion_diff_hours = (c["estimated_completion"] - now).total_seconds() / 3600.0
        score -= completion_diff_hours * 2.0

        # High slack before due date is great
        if c["is_on_time"]:
            score += 1000.0 + min(500.0, c["slack_hours"] * 10.0)
        else:
            score -= 2000.0 + (c["delay_hours"] * 50.0)

        # Changeover efficiency
        score -= c["changeover_min"] * 1.5

        # Protect TOC Drum bottleneck
        if c["is_bottleneck"]:
            score -= 250.0

        # Favor machines that fit in fewer days
        score -= (c["allocated_days_count"] - 1) * 40.0

        return score

    if on_time_candidates:
        # Pick best among on-time machines
        on_time_candidates.sort(key=candidate_score, reverse=True)
        recommended = on_time_candidates[0]
    else:
        # All machines late: pick machine with minimum delay
        late_candidates.sort(key=lambda c: (c["delay_hours"], c["changeover_min"]))
        recommended = late_candidates[0]

    # Dynamic explanation of why recommended was chosen
    why_parts = []
    if recommended["is_on_time"]:
        why_parts.append(
            f"Machine {recommended['machine_name']} ({recommended['machine_code']}) is recommended because it comfortably completes the order on {recommended['estimated_completion'].strftime('%d %b %Y at %I:%M %p')}, "
            f"providing a safety buffer of {recommended['slack_hours']:.1f} hours before your required due date."
        )
    else:
        why_parts.append(
            f"Machine {recommended['machine_name']} ({recommended['machine_code']}) provides the earliest possible delivery across the entire plant fleet, "
            f"minimizing overall delay to {recommended['delay_hours']:.1f} hours."
        )

    if recommended["changeover_min"] <= 15.0:
        why_parts.append(f"It incurs negligible changeover cleaning time ({recommended['changeover_min']:.0f} min) from the preceding {recommended['preceding_colour']} job.")
    else:
        why_parts.append(f"Its sequence transition requires {recommended['changeover_min']:.0f} min for shade wash/cleaning.")

    if not recommended["is_bottleneck"] and any(c["is_bottleneck"] for c in suitable_candidates):
        why_parts.append("Selecting this machine protects the plant's active bottleneck vessel, keeping primary throughput unconstrained.")

    why_explanation = " ".join(why_parts)

    # Compile Due Date Risk warning if all late or recommended is late
    due_date_risk_warning = None
    risk_factors = []
    earliest_overall = min(c["estimated_completion"] for c in suitable_candidates) if suitable_candidates else None

    if not on_time_candidates:
        due_date_risk_warning = (
            f"No available machine can currently complete this order before the requested due date ({due_date.strftime('%d %B %Y')}). "
            f"The earliest feasible completion across all machines is {earliest_overall.strftime('%d %B %Y at %I:%M %p')}, resulting in an expected delay of {recommended['delay_hours']:.1f} hours."
        )
        risk_factors = [
            f"Order size ({quantity_kg:.0f} kg) exceeds single-shift throughput, requiring {recommended['allocated_days_count']} production day(s).",
            f"Existing commitments: {recommended['current_workload_kg']:.0f} kg already scheduled on {recommended['machine_code']}.",
            f"Sequence cleaning penalty: {recommended['changeover_min']:.0f} minutes allocated for {recommended['preceding_colour']} -> {resolved_colour_name} wash cycle.",
            "Factory operating hours: Daily production operates under standard 8:00 AM - 10:00 PM shift windows."
        ]

    # Sort alternatives so the recommended machine is followed by other candidates ordered by completion
    alternatives = [c for c in machine_evaluations if c["machine_id"] != recommended["machine_id"]]
    alternatives.sort(key=lambda c: (
        not c["is_suitable"],
        not c.get("is_on_time", False),
        c.get("estimated_completion", datetime.max)
    ))

    return {
        "status": "SUCCESS",
        "recommended_machine": recommended,
        "order_quantity_kg": quantity_kg,
        "colour_name": resolved_colour_name,
        "colour_code": resolved_colour_code,
        "colour_hex": colour_hex,
        "due_date": due_date,
        "is_any_machine_on_time": bool(on_time_candidates),
        "earliest_completion": earliest_overall,
        "total_delay_hours": recommended["delay_hours"] if not recommended["is_on_time"] else 0.0,
        "why_recommended": why_explanation,
        "due_date_risk_warning": due_date_risk_warning,
        "risk_factors": risk_factors,
        "alternative_machines": alternatives
    }
