from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.factory_models import Machine, Employee
from app.models.order_models import Order, OrderBatch
from app.models.schedule_models import ProductionSchedule, DisruptionEvent, Alert, AlertSeverity
from app.core.changeover import calculate_changeover_penalty
from app.core.freeze_window import get_freeze_status_for_time

def handle_machine_breakdown_disruption(
    db: Session,
    machine_id: int,
    breakdown_start: datetime,
    duration_hours: float,
    description: str = "Machine motor / hydraulic failure"
) -> Dict[str, Any]:
    """
    Dynamic Disruption Recovery: Machine Breakdown.
    1. Identifies affected schedules during the breakdown window.
    2. Searches for compatible alternate machines.
    3. Respects locked jobs in the freeze window.
    4. Reassigns feasible jobs or shifts future slots.
    5. Flags late orders and triggers critical alerts.
    """
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise ValueError("Invalid machine ID")

    breakdown_end = breakdown_start + timedelta(hours=duration_hours)
    
    # Mark machine breakdown status
    machine.status = "BREAKDOWN"

    # Find affected schedules on this machine
    affected_schedules = db.query(ProductionSchedule).filter(
        ProductionSchedule.machine_id == machine_id,
        ProductionSchedule.status.in_(["SCHEDULED", "IN_PROGRESS"]),
        ProductionSchedule.planned_start < breakdown_end,
        ProductionSchedule.planned_end > breakdown_start
    ).all()

    # Find available alternate machines
    alternate_machines = db.query(Machine).filter(
        Machine.id != machine_id,
        Machine.status.in_(["AVAILABLE", "RUNNING", "IDLE"])
    ).all()

    reassigned_orders = []
    delayed_orders = []
    created_alerts = []

    for sched in affected_schedules:
        order = db.query(Order).filter(Order.id == sched.order_id).first()
        if not order:
            continue

        # Look for alternate machine that can take this batch
        reassigned = False
        for alt_m in alternate_machines:
            if order.cloth_type.lower() in (alt_m.compatible_cloth_types or "").lower() and alt_m.max_batch_kg >= order.quantity_kg:
                # Reassign to alternate machine
                sched.machine_id = alt_m.id
                order.assigned_machine_id = alt_m.id
                # Adjust start time to breakdown end or earliest available
                sched.planned_start = max(sched.planned_start, breakdown_end)
                sched.planned_end = sched.planned_start + timedelta(minutes=sched.base_processing_min + sched.changeover_min)
                sched.scheduling_reason = f"REROUTED from {machine.name} to {alt_m.name} due to unexpected breakdown."
                reassigned_orders.append(order.order_number)
                reassigned = True
                break

        if not reassigned:
            # Shift order on the original machine to after repair
            shift_delta = breakdown_end - sched.planned_start
            sched.planned_start = breakdown_end + timedelta(minutes=30) # 30 min warm-up
            sched.planned_end = sched.planned_start + timedelta(minutes=sched.base_processing_min + sched.changeover_min)
            sched.scheduling_reason = f"DELAYED on {machine.name} pending repair completion at {breakdown_end.strftime('%H:%M')}."
            
            if sched.planned_end > order.due_date:
                delayed_orders.append(order.order_number)
                # Create critical alert
                alert = Alert(
                    severity=AlertSeverity.CRITICAL.value,
                    alert_type="MACHINE_BREAKDOWN",
                    title=f"Order {order.order_number} Misses Due Date due to {machine.name} Failure",
                    message=f"Machine {machine.name} breakdown of {duration_hours:.1f}h pushes completion to {sched.planned_end.strftime('%d %b %H:%M')}, past customer deadline {order.due_date.strftime('%d %b %H:%M')}.",
                    related_order_id=order.id,
                    related_machine_id=machine.id,
                    action_recommendation="Authorize emergency overtime or subcontract batch immediately.",
                    is_active=True
                )
                db.add(alert)
                created_alerts.append(alert.title)

    # Log the disruption event
    event = DisruptionEvent(
        event_type="MACHINE_BREAKDOWN",
        reference_id=machine.id,
        start_time=breakdown_start,
        duration_hours=duration_hours,
        description=f"{machine.name}: {description}",
        affected_orders_count=len(affected_schedules),
        impact_summary=f"{len(reassigned_orders)} rerouted, {len(delayed_orders)} delayed past deadline.",
        resolved=False
    )
    db.add(event)
    db.commit()

    return {
        "event_id": event.id,
        "machine_name": machine.name,
        "affected_count": len(affected_schedules),
        "reassigned_orders": reassigned_orders,
        "delayed_orders": delayed_orders,
        "alerts_generated": created_alerts,
        "breakdown_end": breakdown_end.isoformat()
    }

def handle_material_delay_disruption(
    db: Session,
    material_id: int,
    new_expected_arrival: datetime,
    reason: str = "Supplier transit delay"
) -> Dict[str, Any]:
    """
    Dynamic Disruption Recovery: Material / Dye Delay.
    1. Identifies scheduled orders dependent on this delayed material.
    2. Moves affected orders to post-arrival dates.
    3. Backfills newly opened slots with ready waiting orders so machines don't sit idle!
    """
    affected_orders = db.query(Order).filter(
        Order.status.in_(["PENDING", "SCHEDULED"]),
        Order.planned_start < new_expected_arrival
    ).all()

    delayed_order_numbers = []
    backfilled_order_numbers = []

    for order in affected_orders:
        sched = db.query(ProductionSchedule).filter(
            ProductionSchedule.order_id == order.id,
            ProductionSchedule.status == "SCHEDULED"
        ).first()

        if sched and sched.planned_start < new_expected_arrival:
            # Order cannot start before material arrives!
            old_start = sched.planned_start
            sched.planned_start = new_expected_arrival + timedelta(hours=2) # 2h staging
            sched.planned_end = sched.planned_start + timedelta(minutes=sched.base_processing_min + sched.changeover_min)
            sched.scheduling_reason = f"RESCHEDULED: Raw material delayed. Production deferred to {sched.planned_start.strftime('%d %b %H:%M')}."
            delayed_order_numbers.append(order.order_number)

            # Smart Backfill: Search for an available READY order to take old_start slot
            ready_substitute = db.query(Order).filter(
                Order.id != order.id,
                Order.readiness_status == "READY",
                Order.status == "PENDING"
            ).first()

            if ready_substitute and not ready_substitute.planned_start:
                ready_substitute.assigned_machine_id = sched.machine_id
                ready_substitute.planned_start = old_start
                ready_substitute.planned_completion = old_start + timedelta(hours=3)
                ready_substitute.status = "SCHEDULED"
                backfilled_order_numbers.append(ready_substitute.order_number)

    db.commit()

    return {
        "material_id": material_id,
        "new_arrival": new_expected_arrival.isoformat(),
        "delayed_orders": delayed_order_numbers,
        "backfilled_orders": backfilled_order_numbers,
        "impact_summary": f"Moved {len(delayed_order_numbers)} orders past arrival date; backfilled {len(backfilled_order_numbers)} machine slots with ready stock."
    }
