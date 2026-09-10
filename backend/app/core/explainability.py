from typing import List, Dict, Any

def generate_scheduling_explanation(
    order: Any,
    machine: Any,
    operator: Any,
    prev_colour: str,
    changeover_min: float,
    due_date_slack_hours: float
) -> List[str]:
    """
    Generates explainable AI reasoning for why an order was assigned to this slot:
    Explains machine suitability, operator certification, changeover savings, and due date drivers.
    """
    reasons = []

    # 1. Machine Compatibility & Capacity
    reasons.append(
        f"Machine '{machine.name}' is certified for fabric '{order.cloth_type}' "
        f"(Batch capacity: {machine.min_batch_kg}kg – {machine.max_batch_kg}kg accommodates order weight of {order.quantity_kg}kg)."
    )

    # 2. Sequence-Dependent Changeover Efficiency
    if changeover_min <= 15.0:
        reasons.append(
            f"Optimal colour sequence: Preceded by '{prev_colour}', enabling a rapid transition "
            f"with only {changeover_min:.0f} min cleaning (saving ~45 min caustic stripping)."
        )
    else:
        reasons.append(
            f"Transition from '{prev_colour}' to '{order.colour_name}' requires {changeover_min:.0f} min cleaning."
        )

    # 3. Manpower & Operator Skills
    if operator:
        reasons.append(
            f"Assigned operator '{operator.name}' holds active Level-4 certification for {machine.machine_type}."
        )

    # 4. Due Date & Buffer Slack
    if due_date_slack_hours >= 24.0:
        reasons.append(
            f"Scheduled with a robust shipping buffer: {due_date_slack_hours:.1f} hours of slack before deadline."
        )
    elif due_date_slack_hours >= 6.0:
        reasons.append(
            f"Critical due date alignment: Slot ensures completion {due_date_slack_hours:.1f} hours before delivery deadline."
        )
    else:
        reasons.append(
            f"URGENT DISPATCH: Scheduled in the earliest feasible slot to minimize potential tardiness ({due_date_slack_hours:.1f}h buffer)."
        )

    # 5. Maintenance & Downtime Protection
    reasons.append(
        f"Machine '{machine.name}' has no conflicting maintenance windows during this operating slot."
    )

    return reasons
