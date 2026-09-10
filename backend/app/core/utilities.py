from typing import List, Dict, Any, Tuple, Optional
from app.config import settings

def check_utility_constraints(
    concurrent_schedules: List[Any],
    candidate_slot_addition: Dict[str, float]
) -> Tuple[bool, Optional[str], Dict[str, float]]:
    """
    Checks if adding a proposed slot would breach hourly factory utility capacity:
    - Water treatment & supply (m3/hr)
    - Steam boiler capacity (kg steam/hr)
    - Electric peak load (kW)
    - Effluent discharge (m3/hr)
    """
    total_water = sum(getattr(s, "water_consumption_m3", 3.5) for s in concurrent_schedules)
    total_steam = sum(getattr(s, "steam_consumption_kg", 600.0) for s in concurrent_schedules)
    total_power = sum(getattr(s, "electricity_kwh", 45.0) for s in concurrent_schedules)
    
    proposed_water = total_water + candidate_slot_addition.get("water_m3_hr", 3.5)
    proposed_steam = total_steam + candidate_slot_addition.get("steam_kg_hr", 600.0)
    proposed_power = total_power + candidate_slot_addition.get("power_kw", 45.0)
    proposed_effluent = proposed_water * 0.88 # ~88% of process water discharged as effluent
    
    usage = {
        "water_m3_hr": round(proposed_water, 2),
        "water_limit": settings.MAX_WATER_CAPACITY_M3_HR,
        "steam_kg_hr": round(proposed_steam, 2),
        "steam_limit": settings.MAX_STEAM_CAPACITY_KG_HR,
        "power_kw": round(proposed_power, 2),
        "power_limit": settings.MAX_ELECTRICITY_KW,
        "effluent_m3_hr": round(proposed_effluent, 2),
        "effluent_limit": settings.MAX_EFFLUENT_M3_HR,
    }
    
    if proposed_water > settings.MAX_WATER_CAPACITY_M3_HR:
        return False, f"Water supply constraint exceeded: {proposed_water:.1f} m3/hr > {settings.MAX_WATER_CAPACITY_M3_HR} limit", usage
    if proposed_steam > settings.MAX_STEAM_CAPACITY_KG_HR:
        return False, f"Steam boiler capacity exceeded: {proposed_steam:.0f} kg/hr > {settings.MAX_STEAM_CAPACITY_KG_HR} limit", usage
    if proposed_power > settings.MAX_ELECTRICITY_KW:
        return False, f"Electric substation peak power cap exceeded: {proposed_power:.0f} kW > {settings.MAX_ELECTRICITY_KW} limit", usage
    if proposed_effluent > settings.MAX_EFFLUENT_M3_HR:
        return False, f"Effluent treatment plant (ETP) capacity exceeded: {proposed_effluent:.1f} m3/hr > {settings.MAX_EFFLUENT_M3_HR} limit", usage

    return True, None, usage
