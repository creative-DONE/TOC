from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from app.core.changeover import calculate_changeover_penalty

def evaluate_rush_order_insertion(
    emergency_order: Any,
    existing_machine_schedules: Dict[int, List[Any]], # machine_id -> sorted list of schedules
    machines: List[Any],
    reference_now: datetime
) -> Dict[str, Any]:
    """
    Intelligent Rush Order Insertion:
    Evaluates candidate insertion points across compatible machines to identify
    the slot with the lowest Total Damage Score:
    Damage = Δ Changeover + (Delayed Orders * 60) + Overtime Cost + Delivery Slippage
    """
    best_option = None
    min_damage = float('inf')
    candidate_options = []

    compatible_machines = [
        m for m in machines
        if emergency_order.cloth_type.lower() in (m.compatible_cloth_types or "").lower()
        and m.status != "BREAKDOWN"
        and m.max_batch_kg >= emergency_order.quantity_kg
    ]
    if not compatible_machines:
        compatible_machines = [m for m in machines if m.status != "BREAKDOWN"]

    for machine in compatible_machines:
        sched_list = existing_machine_schedules.get(machine.id, [])
        
        # Test candidate insertion positions: index 0 up to len(sched_list)
        # Note: Jobs in Day 0 (Locked) cannot be pushed backwards
        for insert_idx in range(len(sched_list) + 1):
            # Check if pushing downstream jobs violates freeze window
            violates_freeze = False
            if insert_idx < len(sched_list):
                target_job = sched_list[insert_idx]
                if getattr(target_job, "is_locked", False):
                    violates_freeze = True
                    
            if violates_freeze:
                continue

            # Calculate changeover impact at insertion point
            prev_order = sched_list[insert_idx - 1] if insert_idx > 0 else None
            next_order = sched_list[insert_idx] if insert_idx < len(sched_list) else None

            prev_col = getattr(prev_order, "colour_code", "WHITE") if prev_order else "WHITE"
            prev_fab = getattr(prev_order, "cloth_type", "Cotton") if prev_order else "Cotton"
            next_col = getattr(next_order, "colour_code", "WHITE") if next_order else None
            next_fab = getattr(next_order, "cloth_type", "Cotton") if next_order else None

            # Changeover to insert order
            pen_in = calculate_changeover_penalty(prev_fab, prev_col, emergency_order.cloth_type, emergency_order.colour_code)
            changeover_addition_min = pen_in["changeover_min"]

            # Changeover from emergency order to next order
            if next_col and next_fab:
                pen_out = calculate_changeover_penalty(emergency_order.cloth_type, emergency_order.colour_code, next_fab, next_col)
                changeover_addition_min += pen_out["changeover_min"]

            # Estimate duration for the emergency order
            rush_dur_hours = 2.5 * (emergency_order.quantity_kg / 500.0) ** 0.5

            # Count downstream jobs delayed past their due dates
            delayed_orders = []
            cumulative_push_hours = rush_dur_hours + (changeover_addition_min / 60.0)
            
            for downstream in sched_list[insert_idx:]:
                est_new_end = downstream.planned_end + timedelta(hours=cumulative_push_hours)
                order_due = getattr(downstream, "order_due_date", est_new_end + timedelta(hours=5))
                if est_new_end > order_due:
                    delayed_orders.append(getattr(downstream, "order_number", f"Order-{downstream.order_id}"))

            # Damage function
            damage_score = (
                (changeover_addition_min * 1.0) +
                (len(delayed_orders) * 100.0) +
                (cumulative_push_hours * 15.0)
            )

            option_record = {
                "machine_id": machine.id,
                "machine_name": machine.name,
                "insert_index": insert_idx,
                "delayed_orders_count": len(delayed_orders),
                "delayed_orders": delayed_orders,
                "changeover_penalty_min": changeover_addition_min,
                "total_damage_score": round(damage_score, 1),
                "recommended": False
            }
            candidate_options.append(option_record)

            if damage_score < min_damage:
                min_damage = damage_score
                best_option = option_record

    if best_option:
        best_option["recommended"] = True

    return {
        "best_option": best_option,
        "all_candidates": candidate_options,
        "total_options_evaluated": len(candidate_options)
    }
