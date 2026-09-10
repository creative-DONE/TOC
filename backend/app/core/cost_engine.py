from typing import Dict, Any, List
from app.config import settings

def calculate_schedule_costs(
    schedules: List[Any],
    overtime_hours: float = 0.0,
    late_orders_hours: float = 0.0
) -> Dict[str, Any]:
    """
    Computes total manufacturing cost for a schedule:
    Total Cost = Machine Operating + Labour + Overtime + Energy + Water + Steam + Changeovers + Delay Penalties
    """
    total_machine_hours = 0.0
    total_water_m3 = 0.0
    total_steam_kg = 0.0
    total_power_kwh = 0.0
    total_changeover_cost = 0.0
    
    for s in schedules:
        dur_hrs = getattr(s, "base_processing_min", 120.0) / 60.0
        total_machine_hours += dur_hrs
        total_water_m3 += getattr(s, "water_consumption_m3", 4.0)
        total_steam_kg += getattr(s, "steam_consumption_kg", 600.0)
        total_power_kwh += getattr(s, "electricity_kwh", 45.0)
        total_changeover_cost += (getattr(s, "changeover_min", 20.0) / 60.0) * settings.COST_CHANGEOVER_WATER_PENALTY
        
    machine_cost = total_machine_hours * settings.COST_MACHINE_OPERATING_HR
    labour_reg_cost = total_machine_hours * settings.COST_LABOUR_REGULAR_HR
    labour_ot_cost = overtime_hours * settings.COST_LABOUR_OVERTIME_HR
    water_cost = total_water_m3 * settings.COST_WATER_PER_M3
    steam_cost = total_steam_kg * settings.COST_STEAM_PER_KG
    power_cost = total_power_kwh * settings.COST_POWER_PER_KWH
    delay_penalty = late_orders_hours * settings.COST_LATE_DELIVERY_PENALTY_PER_HR
    
    grand_total = (
        machine_cost + labour_reg_cost + labour_ot_cost +
        water_cost + steam_cost + power_cost +
        total_changeover_cost + delay_penalty
    )
    
    return {
        "grand_total_inr": round(grand_total, 2),
        "machine_operating_cost": round(machine_cost, 2),
        "labour_regular_cost": round(labour_reg_cost, 2),
        "labour_overtime_cost": round(labour_ot_cost, 2),
        "water_cost": round(water_cost, 2),
        "steam_cost": round(steam_cost, 2),
        "electricity_cost": round(power_cost, 2),
        "changeover_cost": round(total_changeover_cost, 2),
        "delay_penalty_cost": round(delay_penalty, 2),
        "total_water_m3": round(total_water_m3, 1),
        "total_steam_kg": round(total_steam_kg, 1),
        "total_power_kwh": round(total_power_kwh, 1),
        "total_machine_hours": round(total_machine_hours, 1)
    }
