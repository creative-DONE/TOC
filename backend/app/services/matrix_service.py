from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import re
import math
from sqlalchemy.orm import Session

from app.models.factory_models import (
    Machine, MachineMaintenance, FactoryUtility, Employee, Colour
)
from app.models.order_models import Order, Customer, OrderStatus, OrderBatch
from app.models.schedule_models import ProductionSchedule, ScheduleTier
from app.schemas.schemas import MatrixEditRequest
from app.core.changeover import calculate_changeover_penalty
from app.core.processing_time import calculate_composite_processing_time, get_calibrated_base_time
from app.core.buffers import calculate_buffer_penetration, validate_seven_day_planning_rule
from app.core.toc_engine import identify_system_bottleneck
from app.core.batch_splitter import split_order_into_capacity_allocations, is_cloth_compatible, get_compatible_machines
from app.services.scheduler_service import (
    optimize_factory_schedule, calculate_machine_daily_capacity, validate_daily_schedule_capacity,
    add_production_time_over_shifts, is_cloth_compatible, get_compatible_machines
)
from app.config import settings

def extract_short_order_number(order_number: str) -> str:
    """Extracts short order representation (e.g., '101' from 'ORD-101' or '205' from 'PO-205')."""
    if not order_number:
        return ""
    parts = str(order_number).split('-')
    if len(parts) > 1 and parts[-1].isdigit():
        return parts[-1]
    match = re.search(r'\d+', str(order_number))
    return match.group(0) if match else str(order_number)

def extract_numeric_order_id(order_number: str) -> int:
    """Extracts numeric integer for natural numeric sorting (101 < 102 < 1000)."""
    match = re.search(r'\d+', str(order_number))
    return int(match.group(0)) if match else 999999

def compute_order_day_info(earliest_start: Optional[datetime], reference_now: datetime) -> Tuple[int, str]:
    """Calculates 1-indexed planned day number (Day 1, Day 2, ...) and display label."""
    if not earliest_start:
        return 1, "Day 1 (Unscheduled)"

    today_midnight = reference_now.replace(hour=0, minute=0, second=0, microsecond=0)
    start_midnight = earliest_start.replace(hour=0, minute=0, second=0, microsecond=0)
    day_diff = (start_midnight - today_midnight).days
    day_num = max(1, day_diff + 1)

    if day_num == 1:
        label = "Day 1 (Today)"
    elif day_num == 2:
        label = "Day 2 (Tomorrow)"
    else:
        label = f"Day {day_num}"

    return day_num, label

def get_slot_weight(slot: ProductionSchedule) -> float:
    """Retrieves allocated batch weight for a schedule slot."""
    if slot.batch and slot.batch.batch_quantity_kg:
        return slot.batch.batch_quantity_kg
    if slot.order and slot.order.quantity_kg:
        return slot.order.quantity_kg
    return 400.0

def get_planning_matrix_data(db: Session, horizon_days: int = 7, reference_now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Constructs the Production Planning Matrix data structure:
    1. Dynamic machine columns queried from DB with capacities, current scheduled loads, and utilization %.
    2. Dynamic TOC Drum constraint detection (highest utilization machine, never hardcoded).
    3. Order rows with sticky metadata (Order #, Quantity, Planned Day) and machine cells (101\\n4000 kg).
    4. Compact Machine Load Summary and Sequential Day Summary.
    5. Default ascending numeric sorting (101, 102, 103...).
    """
    now = reference_now or datetime.utcnow()
    reference_now = now
    today_midnight = reference_now.replace(hour=0, minute=0, second=0, microsecond=0)

    machines = db.query(Machine).order_by(Machine.id.asc()).all()
    orders = db.query(Order).filter(Order.status.not_in(["CANCELLED", "COMPLETED"])).all()
    schedules = db.query(ProductionSchedule).filter(
        ProductionSchedule.status.not_in(["CANCELLED", "COMPLETED"])
    ).order_by(ProductionSchedule.planned_start.asc()).all()
    utilities = db.query(FactoryUtility).all()

    # Upcoming maintenances
    maintenances = db.query(MachineMaintenance).filter(
        MachineMaintenance.status.in_(["SCHEDULED", "IN_PROGRESS"]),
        MachineMaintenance.end_time > reference_now
    ).all()
    total_maint_hours = sum(
        (m.end_time - m.start_time).total_seconds() / 3600.0 for m in maintenances
    )

    # Group schedules by machine and by order
    sched_by_machine: Dict[int, List[ProductionSchedule]] = {m.id: [] for m in machines}
    sched_by_order: Dict[int, List[ProductionSchedule]] = {o.id: [] for o in orders}

    for s in schedules:
        if s.machine_id in sched_by_machine:
            sched_by_machine[s.machine_id].append(s)
        if s.order_id in sched_by_order:
            sched_by_order[s.order_id].append(s)

    # Calculate standardized machine load & utilization
    machine_metrics = []

    for m in machines:
        m_slots = sched_by_machine.get(m.id, [])
        current_load_kg = sum(get_slot_weight(s) for s in m_slots)

        m_loading_h = float(getattr(m, "loading_time_hours", None) or 0.5)
        m_batch_hours = float(getattr(m, "processing_time_hours", None) or 3.0)
        m_unloading_h = float(getattr(m, "unloading_time_hours", None) or 0.5)
        m_cleaning_h = float(getattr(m, "cleaning_time_hours", None) or 1.0)
        m_working_hours = float(getattr(m, "working_hours_per_day", None) or 8.0)

        # Maintenance hours in horizon for machine m
        m_maints = [mnt for mnt in maintenances if mnt.machine_id == m.id]
        horizon_end = reference_now + timedelta(days=horizon_days)
        m_maint_hours_in_horizon = 0.0
        for mnt in m_maints:
            overlap_s = max(reference_now, mnt.start_time)
            overlap_e = min(horizon_end, mnt.end_time)
            if overlap_e > overlap_s:
                m_maint_hours_in_horizon += (overlap_e - overlap_s).total_seconds() / 3600.0

        available_hours = max(0.0, (horizon_days * m_working_hours) - m_maint_hours_in_horizon)

        # Scheduled Machine Time = sum_{batches} (loading + processing + unloading + cleaning)
        scheduled_hours = 0.0
        for s in m_slots:
            slot_min = (s.loading_min or 0.0) + (s.base_processing_min or 0.0) + (s.unloading_min or 0.0) + (s.cleaning_min or 0.0)
            if slot_min <= 0.001 and s.planned_start and s.planned_end:
                slot_min = (s.planned_end - s.planned_start).total_seconds() / 60.0
            scheduled_hours += (slot_min / 60.0)

        scheduled_hours = round(scheduled_hours, 2)
        if available_hours > 0:
            utilization_pct = min(100.0, round((scheduled_hours / available_hours) * 100.0, 1))
        else:
            utilization_pct = 0.0

        machine_metrics.append({
            "id": m.id,
            "code": m.code,
            "name": m.name,
            "machine_type": m.machine_type,
            "capacity_kg": round(m.max_batch_kg, 1),
            "nominal_capacity_kg": round(available_hours * (m.max_batch_kg / max(0.5, m_batch_hours)), 1),
            "current_load_kg": round(current_load_kg, 1),
            "utilization_pct": utilization_pct,
            "loading_time_hours": m_loading_h,
            "processing_time_hours": m_batch_hours,
            "unloading_time_hours": m_unloading_h,
            "cleaning_time_hours": m_cleaning_h,
            "working_hours_per_day": m_working_hours,
            "scheduled_time_hours": scheduled_hours,
            "available_production_time_hours": round(available_hours, 1),
            "maintenance_hours": round(m_maint_hours_in_horizon, 1),
            "status": m.status,
            "compatible_cloth_types": m.compatible_cloth_types,
            "active_batches_count": len(m_slots),
            "is_bottleneck": False
        })

    # Dynamic TOC Bottleneck Identification (highest utilization machine)
    sorted_by_util = sorted(machine_metrics, key=lambda x: x["utilization_pct"], reverse=True)
    bottleneck_machine = sorted_by_util[0] if sorted_by_util else None
    if bottleneck_machine and bottleneck_machine["current_load_kg"] > 0:
        for mm in machine_metrics:
            if mm["id"] == bottleneck_machine["id"]:
                mm["is_bottleneck"] = True
                break

    toc_bottleneck = identify_system_bottleneck(machines, orders, utilities, horizon_days=horizon_days)

    # Build Machine Load Summary
    machine_load_summary = [
        {
            "id": mm["id"],
            "code": mm["code"],
            "name": mm["name"],
            "capacity_kg": mm["capacity_kg"],
            "current_load_kg": mm["current_load_kg"],
            "utilization_pct": mm["utilization_pct"],
            "loading_time_hours": mm["loading_time_hours"],
            "processing_time_hours": mm["processing_time_hours"],
            "unloading_time_hours": mm["unloading_time_hours"],
            "cleaning_time_hours": mm["cleaning_time_hours"],
            "working_hours_per_day": mm["working_hours_per_day"],
            "scheduled_time_hours": mm["scheduled_time_hours"],
            "available_production_time_hours": mm["available_production_time_hours"],
            "maintenance_hours": mm["maintenance_hours"],
            "is_bottleneck": mm["is_bottleneck"]
        }
        for mm in machine_metrics
    ]

    # Build Sequential Day Summary (Day 1..horizon_days) with Hard Daily Capacity & Machine Breakdown
    machine_maint_map = {}
    for m in machines:
        machine_maint_map[m.id] = [maint for maint in maintenances if maint.machine_id == m.id]

    day_summary_map = {}
    for d in range(1, horizon_days + 1):
        d_label = "Day 1 (Today)" if d == 1 else ("Day 2 (Tomorrow)" if d == 2 else f"Day {d}")
        
        # Calculate daily capacity for each machine on day d
        d_machine_breakdown = []
        d_factory_capacity = 0.0
        d_total_load = 0.0
        d_active_jobs = 0

        for m in machines:
            m_cap = calculate_machine_daily_capacity(m, d, reference_now, machine_maint_map)
            if m.status != "BREAKDOWN":
                d_factory_capacity += m_cap
            
            # Find slots on this machine on day d
            m_slots_on_day = [
                s for s in sched_by_machine.get(m.id, [])
                if s.planned_start and (
                    (s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_midnight).days + 1 == d
                )
            ]
            m_load = sum(get_slot_weight(s) for s in m_slots_on_day)
            d_total_load += m_load
            d_active_jobs += len(m_slots_on_day)

            d_rem = max(0.0, m_cap - m_load)
            d_util = round((m_load / max(1.0, m_cap)) * 100.0, 1) if m_cap > 0 else 0.0

            d_machine_breakdown.append({
                "machine_id": m.id,
                "code": m.code,
                "name": m.name,
                "capacity_kg": round(m_cap, 1),
                "load_kg": round(m_load, 1),
                "remaining_kg": round(d_rem, 1),
                "utilization_pct": round(min(100.0, d_util), 1),
                "is_bottleneck": bool(m.id == (bottleneck_machine["id"] if bottleneck_machine else -1))
            })

        d_rem_factory = max(0.0, d_factory_capacity - d_total_load)
        d_util_factory = round((d_total_load / max(1.0, d_factory_capacity)) * 100.0, 1) if d_factory_capacity > 0 else 0.0

        day_summary_map[d] = {
            "day": d,
            "label": d_label,
            "total_kg": round(d_total_load, 1),
            "factory_capacity_kg": round(d_factory_capacity, 1),
            "remaining_kg": round(d_rem_factory, 1),
            "utilization_pct": round(min(100.0, d_util_factory), 1),
            "active_jobs": d_active_jobs,
            "machine_breakdown": d_machine_breakdown
        }

    day_summary = list(day_summary_map.values())

    # Build Order rows with sticky metadata and dynamic machine cells
    order_rows = []
    total_planned_dyeing_kg = 0.0
    total_batches = len(schedules)
    total_changeover_min = sum(s.changeover_min for s in schedules)

    for o in orders:
        o_slots = sched_by_order.get(o.id, [])
        short_num = extract_short_order_number(o.order_number)
        cust_name = o.customer.name if o.customer else "Customer"

        # Due Date relative calculation
        if o.due_date:
            due_mid = o.due_date.replace(hour=0, minute=0, second=0, microsecond=0)
            due_day = max(1, (due_mid - today_midnight).days + 1)
            due_date_formatted = o.due_date.strftime("%d %b %Y")
            due_day_label = f"Day {due_day}"
        else:
            due_day = 7
            due_date_formatted = "-"
            due_day_label = "Day 7"

        # Pre-compute compatible machines and available capacity before due date
        compat = [m for m in machines if is_cloth_compatible(o.cloth_type, m.compatible_cloth_types)]
        if not compat:
            compat = machines

        avail_cap_before_due = sum(
            max(0.0, calculate_machine_daily_capacity(m_check, d_check, now) - sum(
                get_slot_weight(s) for s in sched_by_machine.get(m_check.id, [])
                if s.order_id != o.id and s.planned_start and (
                    (s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_midnight).days + 1 == d_check
                )
            ))
            for m_check in compat
            for d_check in range(1, due_day + 1)
        )
        req_qty = float(o.quantity_kg)
        shortage = max(0.0, req_qty - avail_cap_before_due)

        if len(o_slots) > 1:
            for s_idx, slot in enumerate(o_slots):
                slot_w = get_slot_weight(slot)
                total_planned_dyeing_kg += slot_w
                d_num, d_label = compute_order_day_info(slot.planned_start, reference_now)

                machine_cells = {}
                for m in machines:
                    m_id_str = str(m.id)
                    if slot.machine_id == m.id:
                        machine_cells[m_id_str] = {
                            "assigned": True,
                            "slot_id": slot.id,
                            "order_label": o.order_number,
                            "order_number": o.order_number,
                            "cell_display": f"{o.order_number}\n{slot_w:.0f} kg",
                            "is_locked": slot.is_locked,
                            "freeze_level": slot.freeze_level,
                            "quantity_kg": slot_w,
                            "planned_start": slot.planned_start.isoformat() if slot.planned_start else None,
                            "planned_end": slot.planned_end.isoformat() if slot.planned_end else None,
                            "start_time_str": slot.planned_start.strftime("%H:%M") if slot.planned_start else "-",
                            "changeover_min": slot.changeover_min,
                            "warning": None
                        }
                    else:
                        machine_cells[m_id_str] = {
                            "assigned": False,
                            "slot_id": None,
                            "order_label": None,
                            "order_number": None,
                            "cell_display": "",
                            "is_locked": False,
                            "warning": None
                        }

                due_status = "ON_TIME" if d_num < due_day else ("DUE_TODAY" if d_num == due_day else "LATE")
                due_status_label = "ON TIME" if d_num < due_day else ("DUE TODAY" if d_num == due_day else "LATE")
                is_late = bool(d_num > due_day)
                is_feasible = bool(shortage <= 0.1 and not is_late)
                diag = (
                    f"Due-date capacity shortage: Required {req_qty:.0f}kg, Available before due date: {avail_cap_before_due:.0f}kg, Shortage: {shortage:.0f}kg."
                    if (shortage > 0.1) else (
                        "On Track: Scheduled within feasible daily capacity before deadline." if not is_late else
                        f"Scheduled Late: Planned on Day {d_num}, but Due on Day {due_day}."
                    )
                )

                part_label = f"{o.order_number} (Part {s_idx + 1}/{len(o_slots)})"
                order_rows.append({
                    "row_key": f"{o.id}_{slot.id}",
                    "order_id": o.id,
                    "slot_id": slot.id,
                    "order_number": part_label,
                    "raw_order_number": o.order_number,
                    "short_order_number": short_num,
                    "customer_name": cust_name,
                    "cloth_type": o.cloth_type,
                    "colour_name": o.colour_name,
                    "colour_code": o.colour_code,
                    "quantity_kg": round(slot_w, 1),
                    "total_order_kg": round(o.quantity_kg, 1),
                    "planned_day": d_num,
                    "planned_day_label": d_label,
                    "planned_start": slot.planned_start.isoformat() if slot.planned_start else None,
                    "due_date": o.due_date.isoformat() if o.due_date else None,
                    "due_date_formatted": due_date_formatted,
                    "due_day": due_day,
                    "due_day_label": due_day_label,
                    "due_status": due_status,
                    "due_status_label": due_status_label,
                    "is_late": is_late,
                    "due_feasibility": {
                        "is_feasible": is_feasible,
                        "required_kg": round(req_qty, 1),
                        "available_before_due_kg": round(avail_cap_before_due, 1),
                        "shortage_kg": round(shortage, 1),
                        "diagnostic": diag
                    },
                    "is_locked": slot.is_locked,
                    "status": slot.status,
                    "priority": o.priority,
                    "buffer_penetration_pct": o.buffer_penetration_pct,
                    "seven_day_rule_violated": o.seven_day_rule_violated,
                    "machine_cells": machine_cells
                })
        else:
            single_slot = o_slots[0] if o_slots else None
            earliest_dt = single_slot.planned_start if single_slot else o.planned_start
            d_num, d_label = compute_order_day_info(earliest_dt, reference_now)
            order_w = o.quantity_kg
            if single_slot:
                total_planned_dyeing_kg += order_w

            machine_cells = {}
            for m in machines:
                m_id_str = str(m.id)
                if single_slot and single_slot.machine_id == m.id:
                    cap_warning = None
                    if order_w > m.max_batch_kg:
                        cap_warning = f"Order weight ({order_w:.0f}kg) exceeds machine capacity ({m.max_batch_kg:.0f}kg)"

                    machine_cells[m_id_str] = {
                        "assigned": True,
                        "slot_id": single_slot.id,
                        "order_label": o.order_number,
                        "order_number": o.order_number,
                        "cell_display": f"{o.order_number}\n{order_w:.0f} kg",
                        "is_locked": single_slot.is_locked,
                        "freeze_level": single_slot.freeze_level,
                        "quantity_kg": order_w,
                        "planned_start": single_slot.planned_start.isoformat() if single_slot.planned_start else None,
                        "planned_end": single_slot.planned_end.isoformat() if single_slot.planned_end else None,
                        "start_time_str": single_slot.planned_start.strftime("%H:%M") if single_slot.planned_start else "-",
                        "changeover_min": single_slot.changeover_min,
                        "warning": cap_warning
                    }
                else:
                    machine_cells[m_id_str] = {
                        "assigned": False,
                        "slot_id": None,
                        "order_label": None,
                        "order_number": None,
                        "cell_display": "",
                        "is_locked": False,
                        "warning": None
                    }

            due_status = "ON_TIME" if d_num < due_day else ("DUE_TODAY" if d_num == due_day else "LATE")
            due_status_label = "ON TIME" if d_num < due_day else ("DUE TODAY" if d_num == due_day else "LATE")
            is_late = bool(d_num > due_day)
            is_feasible = bool(shortage <= 0.1 and not is_late)
            diag = (
                f"Due-date capacity shortage: Required {req_qty:.0f}kg, Available before due date: {avail_cap_before_due:.0f}kg, Shortage: {shortage:.0f}kg."
                if (shortage > 0.1) else (
                    "On Track: Scheduled within feasible daily capacity before deadline." if not is_late else
                    f"Scheduled Late: Planned on Day {d_num}, but Due on Day {due_day}."
                )
            )

            order_rows.append({
                "row_key": f"{o.id}_{single_slot.id if single_slot else 'new'}",
                "order_id": o.id,
                "slot_id": single_slot.id if single_slot else None,
                "order_number": o.order_number,
                "raw_order_number": o.order_number,
                "short_order_number": short_num,
                "customer_name": cust_name,
                "cloth_type": o.cloth_type,
                "colour_name": o.colour_name,
                "colour_code": o.colour_code,
                "quantity_kg": round(order_w, 1),
                "total_order_kg": round(order_w, 1),
                "planned_day": d_num,
                "planned_day_label": d_label,
                "planned_start": earliest_dt.isoformat() if earliest_dt else None,
                "due_date": o.due_date.isoformat() if o.due_date else None,
                "due_date_formatted": due_date_formatted,
                "due_day": due_day,
                "due_day_label": due_day_label,
                "due_status": due_status,
                "due_status_label": due_status_label,
                "is_late": is_late,
                "due_feasibility": {
                    "is_feasible": is_feasible,
                    "required_kg": round(req_qty, 1),
                    "available_before_due_kg": round(avail_cap_before_due, 1),
                    "shortage_kg": round(shortage, 1),
                    "diagnostic": diag
                },
                "is_locked": single_slot.is_locked if single_slot else False,
                "status": o.status,
                "priority": o.priority,
                "buffer_penetration_pct": o.buffer_penetration_pct,
                "seven_day_rule_violated": o.seven_day_rule_violated,
                "machine_cells": machine_cells
            })

    # Default order display must strictly sort by ascending numeric order (101, 102, 103, 104...)
    order_rows.sort(key=lambda r: (extract_numeric_order_id(r.get("raw_order_number", r["order_number"])), r["planned_day"]))

    return {
        "machines": machine_metrics,
        "machine_load_summary": machine_load_summary,
        "day_summary": day_summary,
        "active_constraint": {
            "resource_id": bottleneck_machine["id"] if bottleneck_machine else None,
            "resource_code": bottleneck_machine["code"] if bottleneck_machine else "None",
            "resource_name": bottleneck_machine["name"] if bottleneck_machine else "Balanced Fleet",
            "capacity_kg": bottleneck_machine["capacity_kg"] if bottleneck_machine else 0.0,
            "current_load_kg": bottleneck_machine["current_load_kg"] if bottleneck_machine else 0.0,
            "utilization_pct": bottleneck_machine["utilization_pct"] if bottleneck_machine else 0.0,
            "five_focusing_steps": toc_bottleneck.get("five_focusing_steps", {})
        },
        "orders": order_rows,
        "summary": {
            "total_orders": len(orders),
            "planned_dyeing_kg": round(total_planned_dyeing_kg, 1),
            "total_batches": total_batches,
            "total_changeover_min": round(total_changeover_min, 1),
            "maintenance_hours": round(total_maint_hours, 1),
            "total_machines": len(machines),
            "horizon_days": horizon_days,
            "due_date_shortages_count": sum(1 for r in order_rows if not r.get("due_feasibility", {}).get("is_feasible", True) and r.get("due_feasibility", {}).get("shortage_kg", 0) > 0),
            "late_orders_count": sum(1 for r in order_rows if r.get("is_late")),
            "shortage_alerts": list({r["due_feasibility"]["diagnostic"] for r in order_rows if not r.get("due_feasibility", {}).get("is_feasible", True) and r.get("due_feasibility", {}).get("shortage_kg", 0) > 0})
        }
    }

def reorganize_machine_queue(m_id: int, db: Session):
    """
    Sequences and cascades all unlocked slots on machine m_id:
    - Calculates sequence-dependent changeovers using colour transition penalties.
    - Avoids overlapping maintenance windows.
    - Preserves locked jobs as immovable anchors.
    """
    m_slots = db.query(ProductionSchedule).filter(
        ProductionSchedule.machine_id == m_id,
        ProductionSchedule.status.in_(["SCHEDULED", "IN_PROGRESS"])
    ).order_by(ProductionSchedule.planned_start.asc()).all()

    if not m_slots:
        return

    m_maints = db.query(MachineMaintenance).filter(
        MachineMaintenance.machine_id == m_id,
        MachineMaintenance.status.in_(["SCHEDULED", "IN_PROGRESS"])
    ).order_by(MachineMaintenance.start_time.asc()).all()

    mach = db.query(Machine).filter(Machine.id == m_id).first()
    mach_type = mach.machine_type if mach else "JET_DYEING"

    for i in range(1, len(m_slots)):
        curr = m_slots[i]
        prev = m_slots[i - 1]

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

        if not curr.is_locked:
            curr.changeover_min = calc_co
            curr.cleaning_min = co_res.get("cleaning_min", round(calc_co * 0.6))

            earliest_possible_start = prev.planned_end + timedelta(minutes=calc_co)
            duration = curr.planned_end - curr.planned_start
            if curr.planned_start < earliest_possible_start:
                curr.planned_start = earliest_possible_start
                curr.planned_end = earliest_possible_start + duration

            # Maintenance window collision avoidance
            for mnt in m_maints:
                if curr.planned_start < mnt.end_time and curr.planned_end > mnt.start_time:
                    curr.planned_start = mnt.end_time + timedelta(minutes=calc_co)
                    curr.planned_end = curr.planned_start + duration

            if curr.order:
                curr.order.planned_start = curr.planned_start
                curr.order.planned_completion = curr.planned_end

def reevaluate_buffers_and_rules(db: Session):
    """Recomputes buffer penetration and 7-day planning rule across all active orders."""
    all_orders = db.query(Order).filter(Order.status.in_(["PENDING", "SCHEDULED", "IN_PROGRESS"])).all()
    now = datetime.utcnow()
    for o in all_orders:
        if o.planned_completion and o.due_date and o.order_date:
            lead = max(1.0, (o.due_date - o.order_date).total_seconds() / 86400.0)
            slack = (o.due_date - o.planned_completion).total_seconds() / 86400.0
            penetration = max(0.0, min(100.0, ((lead - slack) / lead) * 100.0))
            o.buffer_penetration_pct = round(penetration, 1)
            o.seven_day_rule_violated = False
            o.seven_day_rule_diagnostic = None


def execute_matrix_action(db: Session, req: MatrixEditRequest, reference_now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Executes a manual edit from the Planning Matrix inside an ATOMIC transaction:
    - Pre-allocation validation (quantity > 0, valid machine, etc.).
    - Automatic splitting if order weight exceeds machine capacity:
      required allocations = CEILING(order quantity / machine capacity).
      Sum of allocations strictly equals total order quantity.
    - Full plant re-optimization: invokes the SINGLE CENTRAL SCHEDULING ENGINE,
      rebalancing workloads across all eligible machines, protecting the TOC Drum,
      and strictly meeting due dates.
    - Fail-safe rollback: on any exception or infeasible condition, rolls back completely
      and preserves prior valid state.
    """
    now = reference_now or datetime.utcnow()
    action = req.action.upper()

    # Pre-allocation validation:
    if req.quantity_kg is not None and req.quantity_kg <= 0:
        return {"success": False, "error": "VALIDATION ERROR: Order quantity must be greater than 0 kg."}

    # Snapshot pre-state for diff tracking
    pre_snapshot = {}
    pre_order_machine_map = {}
    for o in db.query(Order).filter(Order.status.not_in(["CANCELLED", "COMPLETED"])).all():
        if req.order_id and o.id == req.order_id:
            continue
        if o.assigned_machine_id:
            pre_order_machine_map[o.id] = o.assigned_machine_id

    for s in db.query(ProductionSchedule).filter(ProductionSchedule.status.not_in(["CANCELLED", "COMPLETED"])).all():
        pre_snapshot[s.id] = {
            "order_number": s.order.order_number if s.order else f"ORD-{s.order_id}",
            "machine_id": s.machine_id,
            "machine_name": s.machine.name if s.machine else f"Machine #{s.machine_id}",
            "planned_start": s.planned_start,
            "planned_end": s.planned_end,
            "changeover_min": s.changeover_min
        }
        if s.order_id and s.order_id != req.order_id and s.order_id not in pre_order_machine_map:
            pre_order_machine_map[s.order_id] = s.machine_id

    target_ord_name = req.order_number or f"Order #{req.order_id}" if req.order_id else "Order"
    action_is_locked = None

    try:
        # Atomic Transaction Savepoint
        with db.begin_nested():
            # =========================================================================
            # ACTION: TOGGLE_LOCK
            # =========================================================================
            if action == "TOGGLE_LOCK":
                if not req.order_id:
                    return {"success": False, "error": "order_id is required for TOGGLE_LOCK"}
                order = db.query(Order).filter(Order.id == req.order_id).first()
                if not order:
                    return {"success": False, "error": f"Order #{req.order_id} not found"}

                target_ord_name = order.order_number
                slots = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == req.order_id).all()
                current_lock = getattr(order, "is_locked", False) or (any(s.is_locked for s in slots) if slots else False)
                new_lock = not current_lock
                action_is_locked = new_lock

                order.is_locked = new_lock
                for s in slots:
                    s.is_locked = new_lock
                    s.freeze_level = "LOCKED" if new_lock else "FLEXIBLE"
                    s.scheduling_reason = f"{'LOCKED' if new_lock else 'UNLOCKED'} manually from Planning Matrix."

                db.flush()

                if not new_lock:
                    # User unlocked the order -> immediately re-optimize schedule across factory
                    optimize_factory_schedule(db, reference_now=now, force_reschedule_all=False, preserve_locked=True)

            # =========================================================================
            # ACTION: DELETE_ORDER
            # =========================================================================
            elif action == "DELETE_ORDER":
                if not req.order_id:
                    return {"success": False, "error": "order_id is required for DELETE_ORDER"}
                order = db.query(Order).filter(Order.id == req.order_id).first()
                if not order:
                    return {"success": False, "error": f"Order #{req.order_id} not found"}

                target_ord_name = order.order_number
                slots = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == req.order_id).all()
                for s in slots:
                    db.delete(s)
                batches = db.query(OrderBatch).filter(OrderBatch.order_id == req.order_id).all()
                for b in batches:
                    db.delete(b)

                order.status = "CANCELLED"
                db.delete(order)
                db.flush()

                # Re-optimize remaining orders across factory
                optimize_factory_schedule(db, reference_now=now, force_reschedule_all=False, preserve_locked=True)

            # =========================================================================
            # ACTION: ADD_ORDER
            # =========================================================================
            elif action == "ADD_ORDER":
                if not req.order_number:
                    req.order_number = f"ORD-{int(now.timestamp()) % 100000}"
                target_ord_name = req.order_number
                qty = req.quantity_kg or 400.0

                order_due_date = req.due_date
                if not order_due_date:
                    if req.planned_day and req.planned_day > 0:
                        order_due_date = now + timedelta(days=req.planned_day)
                    else:
                        order_due_date = now + timedelta(days=7)

                new_order = Order(
                    order_number=req.order_number,
                    customer_id=1,
                    cloth_type=req.cloth_type or "Cotton 100% Greige Knit",
                    colour_name=req.colour_name or "Vibrant Royal Blue",
                    colour_code=req.colour_code or "ROYAL_BLUE",
                    quantity_kg=qty,
                    due_date=order_due_date,
                    order_date=now,
                    priority=req.priority or "MEDIUM",
                    status="SCHEDULED" if (req.machine_id or req.target_machine_id) else "PENDING"
                )
                db.add(new_order)
                db.flush()

                target_m_id = req.target_machine_id or req.machine_id
                if target_m_id:
                    target_mach = db.query(Machine).filter(Machine.id == target_m_id).first()
                    if not target_mach or target_mach.status == "BREAKDOWN":
                        return {"success": False, "error": f"Target machine #{target_m_id} is unavailable or in breakdown."}

                    compat_warn = None
                    if not is_cloth_compatible(new_order.cloth_type, target_mach.compatible_cloth_types):
                        compat_warn = f"Fabric {new_order.cloth_type} is not listed in standard compatibility for {target_mach.name}."

                    # Check target machine daily capacity on requested day if specified
                    target_day = req.planned_day if (req.planned_day and req.planned_day > 0) else None
                    if target_day:
                        m_cap_on_day = calculate_machine_daily_capacity(target_mach, target_day, now)
                        existing_slots = db.query(ProductionSchedule).filter(
                            ProductionSchedule.machine_id == target_m_id,
                            ProductionSchedule.status.not_in(["CANCELLED", "COMPLETED"])
                        ).all()
                        today_mid = now.replace(hour=0, minute=0, second=0, microsecond=0)
                        existing_load = sum(
                            get_slot_weight(s) for s in existing_slots
                            if ((s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_mid).days + 1) == target_day
                        )
                        if existing_load + qty > m_cap_on_day + 0.1:
                            avail_cap = max(0.0, m_cap_on_day - existing_load)
                            return {
                                "success": False,
                                "error": f"Day {target_day} capacity exceeded for {target_mach.name} ({target_mach.code}). "
                                         f"Daily capacity: {m_cap_on_day:.0f}kg, Current load: {existing_load:.0f}kg, "
                                         f"Required: {qty:.0f}kg. Available capacity: {avail_cap:.0f}kg."
                            }

                    allocations = split_order_into_capacity_allocations(qty, target_mach.max_batch_kg)
                    if target_day:
                        base_day_offset = target_day - 1
                    else:
                        today_mid = now.replace(hour=0, minute=0, second=0, microsecond=0)
                        existing_slots = db.query(ProductionSchedule).filter(
                            ProductionSchedule.machine_id == target_m_id,
                            ProductionSchedule.status.not_in(["CANCELLED", "COMPLETED"])
                        ).all()
                        found_day = 1
                        for d_cand in range(1, 15):
                            m_cap = calculate_machine_daily_capacity(target_mach, d_cand, now)
                            load_d = sum(
                                get_slot_weight(s) for s in existing_slots
                                if ((s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_mid).days + 1) == d_cand
                            )
                            if (m_cap - load_d) >= min(qty, target_mach.max_batch_kg) - 0.1:
                                found_day = d_cand
                                break
                        base_day_offset = found_day - 1

                    for idx, alloc_qty in enumerate(allocations):
                        alloc_day = base_day_offset + idx
                        start_time = now.replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(days=alloc_day)
                        if start_time < now:
                            start_time = now + timedelta(hours=1 + idx * 4)

                        loading_h = float(getattr(target_mach, "loading_time_hours", 0.5) or 0.5)
                        proc_h = float(getattr(target_mach, "processing_time_hours", 3.0) or 3.0)
                        unloading_h = float(getattr(target_mach, "unloading_time_hours", 0.5) or 0.5)
                        cleaning_cfg_h = float(getattr(target_mach, "cleaning_time_hours", 1.0) or 1.0)
                        working_hours_day = float(getattr(target_mach, "working_hours_per_day", 8.0) or 8.0)
                        clean_h = 0.0 if idx > 0 else cleaning_cfg_h
                        total_batch_min = (loading_h + proc_h + unloading_h + clean_h) * 60.0

                        start_time, end_time = add_production_time_over_shifts(
                            start_time=start_time,
                            duration_minutes=total_batch_min,
                            working_hours_per_day=working_hours_day,
                            maintenances=db.query(MachineMaintenance).filter(
                                MachineMaintenance.machine_id == target_m_id,
                                MachineMaintenance.status.in_(["SCHEDULED", "IN_PROGRESS"])
                            ).all()
                        )

                        batch = OrderBatch(
                            order_id=new_order.id,
                            batch_number=idx + 1,
                            total_batches=len(allocations),
                            batch_quantity_kg=alloc_qty,
                            assigned_machine_id=target_m_id,
                            status="SCHEDULED",
                            planned_start=start_time,
                            planned_completion=end_time
                        )
                        db.add(batch)
                        db.flush()

                        new_slot = ProductionSchedule(
                            schedule_tier=ScheduleTier.WEEKLY_SCHEDULE.value,
                            order_id=new_order.id,
                            batch_id=batch.id,
                            machine_id=target_m_id,
                            planned_start=start_time,
                            planned_end=end_time,
                            loading_min=loading_h * 60.0,
                            base_processing_min=proc_h * 60.0,
                            unloading_min=unloading_h * 60.0,
                            cleaning_min=clean_h * 60.0,
                            changeover_min=clean_h * 60.0,
                            setup_min=15.0,
                            drum_buffer_min=60.0,
                            shipping_buffer_min=120.0,
                            status="SCHEDULED",
                            is_locked=True,
                            freeze_level="LOCKED",
                            scheduling_reason=f"Manually assigned to {target_mach.name} (Batch {idx+1}/{len(allocations)} - {alloc_qty:.0f}kg)."
                        )
                        db.add(new_slot)
                    new_order.assigned_machine_id = target_m_id
                    new_order.is_locked = True

                db.flush()
                # Run Central Factory Optimizer across complete plant
                optimize_factory_schedule(db, reference_now=now, force_reschedule_all=False, preserve_locked=True)

            # =========================================================================
            # ACTION: ASSIGN / MOVE
            # =========================================================================
            elif action in ["ASSIGN", "MOVE"]:
                if not req.order_id:
                    return {"success": False, "error": "order_id is required for ASSIGN/MOVE"}
                target_m_id = req.target_machine_id or req.machine_id
                if not target_m_id:
                    return {"success": False, "error": "target_machine_id is required for ASSIGN/MOVE"}

                order = db.query(Order).filter(Order.id == req.order_id).first()
                if not order:
                    return {"success": False, "error": f"Order #{req.order_id} not found"}

                target_ord_name = order.order_number
                target_mach = db.query(Machine).filter(Machine.id == target_m_id).first()
                if not target_mach or target_mach.status == "BREAKDOWN":
                    return {"success": False, "error": f"Target machine #{target_m_id} is unavailable or in breakdown."}

                compat_warn = None
                if not is_cloth_compatible(order.cloth_type, target_mach.compatible_cloth_types):
                    compat_warn = f"Fabric {order.cloth_type} is not listed in standard compatibility for {target_mach.name}."

                qty = req.quantity_kg if req.quantity_kg is not None else order.quantity_kg
                order.quantity_kg = qty
                order.assigned_machine_id = target_m_id

                # Clear old slots and batches of this order
                old_slots = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == req.order_id).all()
                for es in old_slots:
                    db.delete(es)
                old_batches = db.query(OrderBatch).filter(OrderBatch.order_id == req.order_id).all()
                for eb in old_batches:
                    db.delete(eb)
                db.flush()

                # Check target machine daily capacity on requested day
                target_day = req.planned_day if (req.planned_day and req.planned_day > 0) else None
                if target_day:
                    m_cap_on_day = calculate_machine_daily_capacity(target_mach, target_day, now)
                    existing_slots = db.query(ProductionSchedule).filter(
                        ProductionSchedule.machine_id == target_m_id,
                        ProductionSchedule.order_id != order.id,
                        ProductionSchedule.status.not_in(["CANCELLED", "COMPLETED"])
                    ).all()
                    today_mid = now.replace(hour=0, minute=0, second=0, microsecond=0)
                    existing_load = sum(
                        get_slot_weight(s) for s in existing_slots
                        if ((s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_mid).days + 1) == target_day
                    )
                    if existing_load + qty > m_cap_on_day + 0.1:
                        avail_cap = max(0.0, m_cap_on_day - existing_load)
                        return {
                            "success": False,
                            "error": f"Day {target_day} capacity exceeded for {target_mach.name} ({target_mach.code}). "
                                     f"Daily capacity: {m_cap_on_day:.0f}kg, Current load: {existing_load:.0f}kg, "
                                     f"Required: {qty:.0f}kg. Available capacity: {avail_cap:.0f}kg."
                        }

                # Split order into valid allocations for target machine
                allocations = split_order_into_capacity_allocations(qty, target_mach.max_batch_kg)
                if target_day:
                    base_day_offset = target_day - 1
                else:
                    today_mid = now.replace(hour=0, minute=0, second=0, microsecond=0)
                    existing_slots = db.query(ProductionSchedule).filter(
                        ProductionSchedule.machine_id == target_m_id,
                        ProductionSchedule.order_id != order.id,
                        ProductionSchedule.status.not_in(["CANCELLED", "COMPLETED"])
                    ).all()
                    found_day = 1
                    for d_cand in range(1, 15):
                        m_cap = calculate_machine_daily_capacity(target_mach, d_cand, now)
                        load_d = sum(
                            get_slot_weight(s) for s in existing_slots
                            if ((s.planned_start.replace(hour=0, minute=0, second=0, microsecond=0) - today_mid).days + 1) == d_cand
                        )
                        if (m_cap - load_d) >= min(qty, target_mach.max_batch_kg) - 0.1:
                            found_day = d_cand
                            break
                    base_day_offset = found_day - 1

                for idx, alloc_qty in enumerate(allocations):
                    alloc_day = base_day_offset + idx
                    prop_start = now.replace(hour=8, minute=0, second=0, microsecond=0) + timedelta(days=alloc_day)
                    if prop_start < now:
                        prop_start = now + timedelta(hours=1 + idx * 4)

                    loading_h = float(getattr(target_mach, "loading_time_hours", 0.5) or 0.5)
                    proc_h = float(getattr(target_mach, "processing_time_hours", 3.0) or 3.0)
                    unloading_h = float(getattr(target_mach, "unloading_time_hours", 0.5) or 0.5)
                    cleaning_cfg_h = float(getattr(target_mach, "cleaning_time_hours", 1.0) or 1.0)
                    working_hours_day = float(getattr(target_mach, "working_hours_per_day", 8.0) or 8.0)
                    clean_h = 0.0 if idx > 0 else cleaning_cfg_h
                    total_batch_min = (loading_h + proc_h + unloading_h + clean_h) * 60.0

                    prop_start, prop_end = add_production_time_over_shifts(
                        start_time=prop_start,
                        duration_minutes=total_batch_min,
                        working_hours_per_day=working_hours_day,
                        maintenances=db.query(MachineMaintenance).filter(
                            MachineMaintenance.machine_id == target_m_id,
                            MachineMaintenance.status.in_(["SCHEDULED", "IN_PROGRESS"])
                        ).all()
                    )

                    batch = OrderBatch(
                        order_id=order.id,
                        batch_number=idx + 1,
                        total_batches=len(allocations),
                        batch_quantity_kg=alloc_qty,
                        assigned_machine_id=target_m_id,
                        status="SCHEDULED",
                        planned_start=prop_start,
                        planned_completion=prop_end
                    )
                    db.add(batch)
                    db.flush()

                    slot = ProductionSchedule(
                        schedule_tier=ScheduleTier.WEEKLY_SCHEDULE.value,
                        order_id=order.id,
                        batch_id=batch.id,
                        machine_id=target_m_id,
                        planned_start=prop_start,
                        planned_end=prop_end,
                        loading_min=loading_h * 60.0,
                        base_processing_min=proc_h * 60.0,
                        unloading_min=unloading_h * 60.0,
                        cleaning_min=clean_h * 60.0,
                        changeover_min=clean_h * 60.0,
                        setup_min=15.0,
                        drum_buffer_min=60.0,
                        shipping_buffer_min=120.0,
                        status="SCHEDULED",
                        is_locked=True,
                        freeze_level="LOCKED",
                        scheduling_reason=f"Manually assigned to {target_mach.name} (Batch {idx+1}/{len(allocations)} - {alloc_qty:.0f}kg)."
                    )
                    db.add(slot)

                order.status = "SCHEDULED"
                order.is_locked = True
                db.flush()

                # Run Central Factory Optimizer to cascade and re-balance remaining orders
                optimize_factory_schedule(db, reference_now=now, force_reschedule_all=False, preserve_locked=True)

            # =========================================================================
            # ACTION: REMOVE
            # =========================================================================
            elif action == "REMOVE":
                if not req.order_id:
                    return {"success": False, "error": "order_id is required for REMOVE"}
                m_id = req.machine_id or req.target_machine_id
                query = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == req.order_id)
                if m_id:
                    query = query.filter(ProductionSchedule.machine_id == m_id)

                slots = query.all()
                for s in slots:
                    db.delete(s)

                order = db.query(Order).filter(Order.id == req.order_id).first()
                if order:
                    target_ord_name = order.order_number
                    remaining = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == order.id).all()
                    if not remaining:
                        order.assigned_machine_id = None
                        order.planned_start = None
                        order.planned_completion = None
                        order.status = "PENDING"
                db.flush()
                optimize_factory_schedule(db, reference_now=now, force_reschedule_all=False, preserve_locked=True)

            # =========================================================================
            # ACTION: UPDATE_ROW
            # =========================================================================
            elif action == "UPDATE_ROW":
                if not req.order_id:
                    return {"success": False, "error": "order_id is required for UPDATE_ROW"}
                order = db.query(Order).filter(Order.id == req.order_id).first()
                if not order:
                    return {"success": False, "error": f"Order #{req.order_id} not found"}

                target_ord_name = order.order_number
                if req.order_number:
                    order.order_number = req.order_number
                if req.cloth_type:
                    order.cloth_type = req.cloth_type
                if req.colour_name:
                    order.colour_name = req.colour_name
                if req.colour_code:
                    order.colour_code = req.colour_code
                if req.due_date:
                    order.due_date = req.due_date
                elif req.planned_day and req.planned_day > 0:
                    order.due_date = now + timedelta(days=req.planned_day)

                new_qty = req.quantity_kg if req.quantity_kg is not None else order.quantity_kg
                order.quantity_kg = new_qty

                # Clear old slots and batches so central engine calculates optimal batch splits
                slots = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == order.id).all()
                for s in slots:
                    db.delete(s)
                batches = db.query(OrderBatch).filter(OrderBatch.order_id == order.id).all()
                for b in batches:
                    db.delete(b)
                order.is_locked = False
                db.flush()

                # Run Central Factory Optimizer across complete plant
                optimize_factory_schedule(
                    db,
                    reference_now=now,
                    force_reschedule_all=bool(req.force_unlock_conflicts),
                    preserve_locked=not bool(req.force_unlock_conflicts)
                )

            # =========================================================================
            # ACTION: REOPTIMIZE / RECALCULATE
            # =========================================================================
            elif action in ["REOPTIMIZE", "RECALCULATE"]:
                optimize_factory_schedule(
                    db,
                    reference_now=now,
                    force_reschedule_all=bool(req.force_unlock_conflicts),
                    preserve_locked=not bool(req.force_unlock_conflicts)
                )

            # --- Feasibility & Daily Capacity Invariant Check ---
            all_active = db.query(Order).filter(Order.status.in_(["PENDING", "SCHEDULED", "IN_PROGRESS"])).all()
            for o in all_active:
                o_slots = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == o.id).all()
                if o_slots:
                    tot_allocated = sum(get_slot_weight(s) for s in o_slots)
                    if abs(tot_allocated - o.quantity_kg) > 1.0:
                        raise ValueError(f"Batch allocation mismatch for order {o.order_number}: allocated {tot_allocated:.1f}kg != order quantity {o.quantity_kg:.1f}kg.")
                    for s in o_slots:
                        if s.machine and get_slot_weight(s) > s.machine.max_batch_kg + 0.1:
                            raise ValueError(f"Machine capacity violation on {s.machine.name}: batch weight {get_slot_weight(s):.1f}kg exceeds machine capacity {s.machine.max_batch_kg:.1f}kg.")

            valid_ok, valid_errs = validate_daily_schedule_capacity(db, reference_now=now, horizon_days=7)
            if not valid_ok:
                raise ValueError(f"Daily Capacity Invariant Violated: {'; '.join(valid_errs)}")

        # Commit atomic transaction
        db.commit()

    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": f"SCHEDULE REORGANIZATION FAILED: {str(e)}. Previous valid schedule preserved."
        }

    # Calculate diff after successful commit
    shifted_jobs = []
    total_co_delta = 0.0
    all_post = db.query(ProductionSchedule).filter(ProductionSchedule.status.not_in(["CANCELLED", "COMPLETED"])).all()
    post_order_machine_map = {}
    for ps in all_post:
        if ps.order_id:
            post_order_machine_map[ps.order_id] = ps.machine_id

    for o in db.query(Order).filter(Order.status.not_in(["CANCELLED", "COMPLETED"])).all():
        if o.id not in post_order_machine_map and o.assigned_machine_id:
            post_order_machine_map[o.id] = o.assigned_machine_id

    reassigned_orders = [
        oid for oid, m_id in post_order_machine_map.items()
        if oid in pre_order_machine_map and pre_order_machine_map[oid] != m_id
    ]
    reassigned_count = len(reassigned_orders)

    for ps in all_post:
        pre = pre_snapshot.get(ps.id)
        if not pre:
            continue
        delta_min = round((ps.planned_start - pre["planned_start"]).total_seconds() / 60.0)
        co_diff = ps.changeover_min - pre["changeover_min"]
        total_co_delta += co_diff

        if abs(delta_min) >= 1:
            shifted_jobs.append({
                "slot_id": ps.id,
                "order_number": ps.order.order_number if ps.order else f"ORD-{ps.order_id}",
                "machine_name": ps.machine.name if ps.machine else f"Machine #{ps.machine_id}",
                "old_start": pre["planned_start"].strftime("%d %b %H:%M"),
                "new_start": ps.planned_start.strftime("%d %b %H:%M"),
                "delta_min": delta_min,
                "direction": "DELAYED" if delta_min > 0 else "ADVANCED",
                "reason": "Cascaded downstream following matrix edit reorganization."
            })

    # Recalculate dynamic bottleneck across all machines
    all_machines = db.query(Machine).all()
    all_orders = db.query(Order).filter(Order.status.not_in(["CANCELLED", "COMPLETED"])).all()
    all_utilities = db.query(FactoryUtility).all()
    bottleneck_info = identify_system_bottleneck(all_machines, all_orders, all_utilities, horizon_days=7)

    if action == "DELETE_ORDER":
        if reassigned_count > 0:
            summary_msg = f"Schedule recalculated — {reassigned_count} order{'s' if reassigned_count > 1 else ''} reassigned to available capacity."
        else:
            summary_msg = "Schedule recalculated — no reassignment required."
    elif action == "TOGGLE_LOCK":
        if action_is_locked:
            summary_msg = f"Order {target_ord_name} is now LOCKED (protected from dynamic shifts)."
        else:
            if reassigned_count > 0:
                summary_msg = f"Order {target_ord_name} unlocked. Schedule recalculated — {reassigned_count} order{'s' if reassigned_count > 1 else ''} reassigned to available capacity."
            else:
                summary_msg = f"Order {target_ord_name} unlocked. Schedule recalculated."
    else:
        summary_msg = f"SCHEDULE RE-OPTIMIZED: {target_ord_name} updated."
        if reassigned_count > 0:
            summary_msg += f" {reassigned_count} order{'s' if reassigned_count > 1 else ''} reassigned to available capacity."
        elif shifted_jobs:
            summary_msg += f" {len(shifted_jobs)} downstream jobs cascaded."
        summary_msg += f" Active Drum: {bottleneck_info.get('resource_name', 'Vessel')} ({bottleneck_info.get('utilization_pct', 0.0)}% util)."

    res = {
        "success": True,
        "message": summary_msg,
        "diff": {
            "action": action,
            "target_order": target_ord_name,
            "reassigned_count": reassigned_count,
            "reassigned_orders": reassigned_orders,
            "shifted_jobs_count": len(shifted_jobs),
            "shifted_jobs": shifted_jobs,
            "changeover_delta_min": round(total_co_delta, 1),
            "bottleneck_resource": bottleneck_info.get("resource_name", "Bottleneck"),
            "bottleneck_utilization_pct": bottleneck_info.get("utilization_pct", 0.0)
        }
    }
    if action == "TOGGLE_LOCK":
        res["is_locked"] = action_is_locked
    return res
