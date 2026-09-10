from typing import List, Dict, Any

def analyze_infeasible_capacity_shortage(
    total_demand_kg: float,
    available_capacity_kg: float,
    bottleneck_resource_name: str,
    days_horizon: int = 7
) -> Dict[str, Any]:
    """
    Analyzes an infeasible demand condition and generates actionable TOC Step 4 (Elevate) recommendations.
    Never produces an invalid schedule silently; provides clear executive countermeasures.
    """
    deficit_kg = max(0.0, total_demand_kg - available_capacity_kg)
    deficit_pct = (deficit_kg / max(1.0, available_capacity_kg)) * 100.0

    recommendations = []

    # 1. Authorize Overtime on the Bottleneck
    ot_gain_kg = min(deficit_kg, round(available_capacity_kg * 0.18, 0))
    recommendations.append({
        "action": "Authorize Bottleneck Overtime",
        "detail": f"Add 4 hours daily overtime on {bottleneck_resource_name} across the next {days_horizon} days.",
        "capacity_gain_kg": ot_gain_kg,
        "est_cost_inr": round(ot_gain_kg * 12.0, 0),
        "impact": "High feasibility; immediate shop-floor rollout"
    })

    # 2. Activate Auxiliary / Reserve Machines
    aux_gain_kg = min(deficit_kg, round(available_capacity_kg * 0.25, 0))
    recommendations.append({
        "action": "Bring Standby Machine Online",
        "detail": "Activate standby Soft-Flow vessel M4 and reassign non-critical medium shades.",
        "capacity_gain_kg": aux_gain_kg,
        "est_cost_inr": round(aux_gain_kg * 16.0, 0),
        "impact": "Relieves primary Jet dyeing bottleneck"
    })

    # 3. Subcontract / Outsource Pre-treatment or Finishing
    outsource_gain_kg = min(deficit_kg, round(available_capacity_kg * 0.35, 0))
    recommendations.append({
        "action": "Outsource Pre-Treatment / Scouring",
        "detail": "Subcontract fabric scouring to pre-approved external processing mill to free upstream capacity.",
        "capacity_gain_kg": outsource_gain_kg,
        "est_cost_inr": round(outsource_gain_kg * 22.0, 0),
        "impact": "Unlocks downstream dyeing throughput"
    })

    # 4. Negotiate Customer Delivery Extensions
    recommendations.append({
        "action": "Customer Delivery Date Extension",
        "detail": "Negotiate a 3-day extension on Tier-3 Low-Priority orders to spread peak load.",
        "capacity_gain_kg": deficit_kg,
        "est_cost_inr": 0.0,
        "impact": "Eliminates overtime cost; preserves high-margin orders"
    })

    return {
        "is_feasible": deficit_kg <= 0.0,
        "total_demand_kg": round(total_demand_kg, 1),
        "available_capacity_kg": round(available_capacity_kg, 1),
        "deficit_kg": round(deficit_kg, 1),
        "deficit_pct": round(deficit_pct, 1),
        "primary_constraint": bottleneck_resource_name,
        "diagnostic_message": f"CAPACITY SHORTAGE: Factory capacity of {available_capacity_kg:.0f}kg cannot absorb demand of {total_demand_kg:.0f}kg (Deficit: {deficit_kg:.0f}kg / {deficit_pct:.1f}%).",
        "elevate_recommendations": recommendations
    }
