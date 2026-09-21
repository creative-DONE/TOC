from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import math
from sqlalchemy.orm import Session

from app.models.factory_models import Machine, Colour, MachineMaintenance, FactoryUtility
from app.models.order_models import Order
from app.models.schedule_models import ProductionSchedule
from app.core.changeover import calculate_changeover_penalty
from app.core.batch_splitter import is_cloth_compatible
from app.core.toc_engine import identify_system_bottleneck


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
    Evaluates ALL available machines in the factory fleet for a potential new order.
    
    Formulas strictly applied per machine:
      1. Number of Batches = ceil(Order Quantity / Machine Capacity)
      2. Total Processing Time = Number of Batches * Processing Time per Batch (hours/batch)
      3. Shift Schedule: Default 8 working hours/day (08:00 AM - 04:00 PM) + sequence changeover time
         + existing machine workload + maintenance windows + TOC Drum bottleneck protection.
      4. Dynamic: Changing machine capacity or processing time immediately recalculates all estimates.
    """
    now = reference_now or datetime.utcnow()
    if getattr(due_date, 'tzinfo', None) is not None:
        due_date = due_date.replace(tzinfo=None)
    if getattr(now, 'tzinfo', None) is not None:
        now = now.replace(tzinfo=None)
    today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)

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
        mach_capacity_kg = float(getattr(m, "capacity_kg", None) or getattr(m, "max_batch_kg", 500.0) or 500.0)
        proc_time_per_batch = float(getattr(m, "processing_time_hours", None) or 3.0)
        working_hours_day = float(getattr(m, "working_hours_per_day", None) or 8.0)

        if not is_compat and m.compatible_cloth_types:
            machine_evaluations.append({
                "machine_id": m.id,
                "machine_code": m.code,
                "machine_name": m.name,
                "machine_type": m.machine_type.replace("_", " "),
                "is_suitable": False,
                "unsuitability_reason": f"Incompatible with {cloth_type} (Supports: {m.compatible_cloth_types})",
                "estimated_start": None,
                "estimated_completion": None,
                "production_hours": None,
                "changeover_min": None,
                "is_on_time": False,
                "delay_hours": 0.0,
                "slack_hours": 0.0,
                "due_status": "INCOMPATIBLE",
                "is_bottleneck": (m.name == bottleneck_resource or m.code in bottleneck_resource),
                "current_workload_kg": 0.0,
                "daily_capacity_kg": mach_capacity_kg,
                "batches_count": 0,
                "processing_time_per_batch_hours": proc_time_per_batch,
                "working_hours_per_day": working_hours_day,
                "total_processing_hours": 0.0,
                "allocated_days_count": 0,
                "preceding_colour": None,
                "explanation": f"Machine {m.code} cannot process {cloth_type} fabric."
            })
            continue

        # Existing slots on this machine
        m_slots = slots_by_machine.get(m.id, [])
        tot_scheduled_kg = 0.0
        for s in m_slots:
            qty = (s.batch.batch_quantity_kg if s.batch else (s.order.quantity_kg if s.order else mach_capacity_kg))
            tot_scheduled_kg += qty

        # Determine last colour and last fabric on machine before new order
        last_colour = "WHITE"
        last_fabric = "Cotton"
        if m_slots:
            last_slot = m_slots[-1]
            if last_slot.order:
                last_colour = last_slot.order.colour_code or last_colour
                last_fabric = last_slot.order.cloth_type or last_fabric

        # Calculate changeover penalty from previous shade
        co_penalty = calculate_changeover_penalty(
            from_fabric=last_fabric,
            from_colour=last_colour,
            to_fabric=cloth_type,
            to_colour=resolved_colour_code,
            machine_type=m.machine_type
        )
        changeover_min = float(co_penalty["changeover_min"])
        changeover_hours = changeover_min / 60.0

        # ---------------------------------------------------------------------
        # USER SPECIFIED FORMULAS:
        # 1. Number of Batches = ceil(Order Quantity / Machine Capacity)
        # 2. Total Processing Time = Number of Batches * Processing Time per Batch
        # ---------------------------------------------------------------------
        num_batches = int(math.ceil(quantity_kg / max(1.0, mach_capacity_kg)))
        total_proc_hours = round(num_batches * proc_time_per_batch, 2)
        total_required_hours = round(total_proc_hours + changeover_hours, 2)

        # ---------------------------------------------------------------------
        # 3. SCHEDULE PROCESSING TIME ACCORDING TO 8 WORKING HOURS/DAY SHIFT:
        # Shift runs 08:00 AM to (08:00 AM + working_hours_day), default 08:00 - 16:00
        # ---------------------------------------------------------------------
        shift_start_hour = 8
        shift_duration_hours = working_hours_day

        curr_day = 1
        max_horizon_days = 90
        remaining_hours = total_required_hours
        estimated_start: Optional[datetime] = None
        estimated_completion: Optional[datetime] = None
        allocated_days_count = 1

        while remaining_hours > 0.001 and curr_day <= max_horizon_days:
            day_midnight = today_midnight + timedelta(days=curr_day - 1)
            shift_start = day_midnight.replace(hour=shift_start_hour, minute=0, second=0)
            shift_end = shift_start + timedelta(hours=shift_duration_hours)

            # Determine earliest availability on this day
            if curr_day == 1:
                earliest_possible = max(now + timedelta(minutes=30), shift_start)
            else:
                earliest_possible = shift_start

            # Check existing slots ending on or overlapping this day
            day_slots = [
                s for s in m_slots
                if s.planned_start and s.planned_end and s.planned_end > earliest_possible and s.planned_start < shift_end
            ]
            if day_slots:
                day_busy_end = max(s.planned_end for s in day_slots)
                # If first batch starts here, add changeover
                if estimated_start is None:
                    earliest_possible = max(earliest_possible, day_busy_end + timedelta(minutes=changeover_min))
                else:
                    earliest_possible = max(earliest_possible, day_busy_end)

            # Check maintenance collision
            maints_on_day = machine_maintenances.get(m.id, [])
            for maint in maints_on_day:
                if maint.start_time < shift_end and maint.end_time > earliest_possible:
                    if maint.start_time <= earliest_possible:
                        earliest_possible = max(earliest_possible, maint.end_time + timedelta(minutes=15))

            # Check if any productive time remains within today's shift
            if earliest_possible >= shift_end:
                # No time left on this day, advance to next day
                curr_day += 1
                continue

            # Record estimated start if not yet recorded
            if estimated_start is None:
                estimated_start = earliest_possible

            avail_today_hours = (shift_end - earliest_possible).total_seconds() / 3600.0

            # Subtract any mid-shift maintenance interval during [earliest_possible, shift_end]
            for maint in maints_on_day:
                if maint.start_time >= earliest_possible and maint.start_time < shift_end:
                    m_overlap = min(shift_end, maint.end_time) - maint.start_time
                    avail_today_hours = max(0.0, avail_today_hours - (m_overlap.total_seconds() / 3600.0))

            if avail_today_hours >= remaining_hours:
                # Can finish on this day!
                estimated_completion = earliest_possible + timedelta(hours=remaining_hours)
                remaining_hours = 0.0
                allocated_days_count = curr_day
                break
            else:
                # Partial day utilization; remaining hours spill into next day's shift
                remaining_hours = round(remaining_hours - avail_today_hours, 3)
                curr_day += 1

        if estimated_start is None:
            estimated_start = today_midnight.replace(hour=8, minute=0, second=0) + timedelta(days=1)
        if estimated_completion is None:
            estimated_completion = estimated_start + timedelta(hours=total_required_hours)

        # Check Due Date feasibility
        slack_seconds = (due_date - estimated_completion).total_seconds()
        is_on_time = (slack_seconds >= 0)
        delay_hours = round(max(0.0, -slack_seconds / 3600.0), 1)
        slack_hours = round(slack_seconds / 3600.0, 1)

        is_bottleneck_m = (m.name == bottleneck_resource or m.code in bottleneck_resource)

        batch_suffix = 'es' if num_batches > 1 else ''
        reasons_list = [
            f"{num_batches} batch{batch_suffix} ({proc_time_per_batch:.1f}h/batch, total {total_proc_hours:.1f}h)"
        ]
        if is_on_time:
            reasons_list.append(f"Completes {abs(slack_hours):.1f}h before due date")
        else:
            reasons_list.append(f"Delayed by {delay_hours:.1f}h past due date")

        if changeover_min <= 15.0:
            reasons_list.append(f"Low changeover ({changeover_min:.0f}m from {last_colour})")
        else:
            reasons_list.append(f"Changeover penalty: {changeover_min:.0f}m ({last_colour} -> {resolved_colour_name})")

        reasons_list.append(f"Shift: {working_hours_day:.0f}h/day")

        if is_bottleneck_m:
            reasons_list.append("Active plant Drum bottleneck")
        else:
            reasons_list.append("Non-bottleneck vessel")

        if tot_scheduled_kg > 0:
            reasons_list.append(f"Current queue: {tot_scheduled_kg:.0f} kg")
        else:
            reasons_list.append("Zero current queue")

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
            "daily_capacity_kg": mach_capacity_kg,
            "batches_count": num_batches,
            "processing_time_per_batch_hours": proc_time_per_batch,
            "working_hours_per_day": working_hours_day,
            "total_processing_hours": total_proc_hours,
            "allocated_days_count": allocated_days_count,
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
        # Earliest completion is prioritized
        completion_diff_hours = (c["estimated_completion"] - now).total_seconds() / 3600.0
        score -= completion_diff_hours * 3.0

        # Positive buffer before due date
        if c["is_on_time"]:
            score += 1000.0 + min(500.0, c["slack_hours"] * 10.0)
        else:
            score -= 2000.0 + (c["delay_hours"] * 50.0)

        # Minimize changeover cleaning penalty
        score -= c["changeover_min"] * 1.5

        # Protect TOC Drum bottleneck
        if c["is_bottleneck"]:
            score -= 250.0

        # Fewer production days needed is better
        score -= (c["allocated_days_count"] - 1) * 30.0

        return score

    if on_time_candidates:
        on_time_candidates.sort(key=candidate_score, reverse=True)
        recommended = on_time_candidates[0]
    else:
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
            f"Machine {recommended['machine_name']} ({recommended['machine_code']}) provides the earliest possible completion across the fleet, "
            f"minimizing delay to {recommended['delay_hours']:.1f} hours."
        )

    why_parts.append(
        f"Requires {recommended['batches_count']} batch(es) at {recommended['processing_time_per_batch_hours']:.1f}h/batch "
        f"({recommended['total_processing_hours']:.1f}h total processing) under an {recommended['working_hours_per_day']:.0f}h/day working schedule."
    )

    if recommended["changeover_min"] <= 15.0:
        why_parts.append(f"Incurs minimal changeover cleaning time ({recommended['changeover_min']:.0f} min) from the preceding {recommended['preceding_colour']} job.")
    else:
        why_parts.append(f"Sequence transition requires {recommended['changeover_min']:.0f} min for shade wash/cleaning.")

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
            f"Order size ({quantity_kg:.0f} kg) requires {recommended['batches_count']} batch(es) totaling {recommended['total_processing_hours']:.1f} hours of machine time.",
            f"Operating shift constraint: Daily production operates under standard {recommended['working_hours_per_day']:.0f}-hour shift windows (08:00 AM - {int(8 + recommended['working_hours_per_day']):02d}:00), spanning {recommended['allocated_days_count']} working day(s).",
            f"Existing commitments: {recommended['current_workload_kg']:.0f} kg already scheduled on {recommended['machine_code']}.",
            f"Sequence cleaning penalty: {recommended['changeover_min']:.0f} minutes allocated for {recommended['preceding_colour']} -> {resolved_colour_name} wash cycle."
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
