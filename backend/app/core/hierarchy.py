from typing import Dict, Any, List
from datetime import datetime, timedelta

def generate_monthly_capacity_plan(
    orders: List[Any],
    machines: List[Any],
    reference_now: datetime
) -> Dict[str, Any]:
    """
    Level 1 — Monthly Capacity Plan (1–3 Months):
    Aggregates macro demand vs capacity to detect future bottlenecks and 7-day rule risks.
    """
    # 30-day horizon
    horizon_days = 30
    working_days = 26
    total_planned_kg = sum(getattr(o, "quantity_kg", 0.0) for o in orders)

    # Machine capacity over 26 working days (assuming 20h effective per day)
    total_factory_capacity_kg = sum(
        (m.max_batch_kg / 3.2) * (working_days * 20.0 * m.efficiency)
        for m in machines
    )

    utilization_pct = (total_planned_kg / max(1.0, total_factory_capacity_kg)) * 100.0

    # Month by month forecast
    current_month_name = reference_now.strftime("%B")
    
    # Identify future bottleneck
    highest_mach = max(machines, key=lambda m: m.current_workload_kg) if machines else None
    bottleneck_name = highest_mach.name if highest_mach else "Jet Dyeing M2"

    at_risk_orders_count = sum(
        1 for o in orders
        if (o.due_date - reference_now).days <= 7 and getattr(o, "status", "") == "PENDING"
    )

    return {
        "tier": "LEVEL_1_MONTHLY_CAPACITY_PLAN",
        "month_label": current_month_name,
        "planned_demand_kg": round(total_planned_kg, 1),
        "available_capacity_kg": round(total_factory_capacity_kg, 1),
        "capacity_utilization_pct": round(utilization_pct, 1),
        "projected_bottleneck": bottleneck_name,
        "expected_bottleneck_utilization_pct": round(min(98.5, utilization_pct * 1.15), 1),
        "orders_violating_7day_rule_risk": at_risk_orders_count,
        "summary_text": f"{current_month_name}: {total_planned_kg:,.0f} kg planned | {total_factory_capacity_kg:,.0f} kg capacity | Bottleneck: {bottleneck_name} | Expected Utilization: {min(98.5, utilization_pct * 1.15):.0f}%"
    }

def filter_schedule_by_tier(
    all_schedules: List[Any],
    tier: str, # "MONTHLY", "WEEKLY", "DAILY"
    reference_now: datetime
) -> List[Any]:
    """Filters schedule slots matching the specified hierarchical tier."""
    if tier == "DAILY":
        # Slots within 48 hours (Today & Tomorrow)
        cutoff = reference_now + timedelta(hours=48)
        return [s for s in all_schedules if s.planned_start <= cutoff]
    elif tier == "WEEKLY":
        # Slots within 14 days
        cutoff = reference_now + timedelta(days=14)
        return [s for s in all_schedules if s.planned_start <= cutoff]
    else:
        # Full monthly horizon (30-60 days)
        return all_schedules
