from typing import Dict, Tuple, List, Any
import numpy as np

# Shade depth rankings: Light (1) -> Medium (2) -> Dark (3)
SHADE_DEPTH_MAP = {
    "WHITE": 1, "OFF_WHITE": 1, "CREAM": 1, "PASTEL_PINK": 1, "PASTEL_YELLOW": 1, "SKY_BLUE": 1,
    "GOLDEN_YELLOW": 2, "ROYAL_BLUE": 2, "SCARLET_RED": 2, "EMERALD_GREEN": 2, "ORANGE": 2,
    "DEEP_NAVY": 3, "JET_BLACK": 3, "DARK_BROWN": 3, "CHARCOAL": 3, "MAROON": 3
}

def get_shade_rank(colour_code: str) -> int:
    clean_code = colour_code.upper().replace(" ", "_").replace("-", "_")
    for k, v in SHADE_DEPTH_MAP.items():
        if k in clean_code:
            return v
    return 2 # Default medium

def calculate_changeover_penalty(
    from_fabric: str,
    from_colour: str,
    to_fabric: str,
    to_colour: str,
    machine_type: str = "JET_DYEING"
) -> Dict[str, float]:
    """
    Multi-dimensional sequence-dependent changeover calculator:
    Considers Fabric transition + Colour transition (Dark-to-Light vs Light-to-Dark).
    """
    from_rank = get_shade_rank(from_colour)
    to_rank = get_shade_rank(to_colour)
    
    # 1. Base colour transition time & water
    if from_colour.upper() == to_colour.upper():
        # Same shade: quick rinse only
        base_changeover_min = 5.0
        cleaning_min = 5.0
        water_litres = 300.0
        chem_cost = 50.0
    elif from_rank <= to_rank:
        # Light to Dark (e.g. White -> Blue, or Blue -> Black): minimal scouring
        step_diff = to_rank - from_rank
        base_changeover_min = 15.0 + (step_diff * 10.0)
        cleaning_min = 10.0 + (step_diff * 8.0)
        water_litres = 800.0 + (step_diff * 400.0)
        chem_cost = 150.0 + (step_diff * 80.0)
    else:
        # Dark to Light (e.g. Black -> White, Navy -> Yellow): severe caustic strip required!
        step_diff = from_rank - to_rank
        base_changeover_min = 45.0 + (step_diff * 25.0) # Up to 95 minutes!
        cleaning_min = 35.0 + (step_diff * 20.0)
        water_litres = 2500.0 + (step_diff * 1200.0) # Up to 4,900 Litres of water!
        chem_cost = 600.0 + (step_diff * 350.0)

    # 2. Fabric transition adjustment
    fabric_penalty_min = 0.0
    if from_fabric.lower() != to_fabric.lower():
        # Switching between Cotton (Reactive dye) and Polyester (Disperse dye) requires full vessel boil-out
        if ("polyester" in from_fabric.lower() and "cotton" in to_fabric.lower()) or \
           ("cotton" in from_fabric.lower() and "polyester" in to_fabric.lower()):
            fabric_penalty_min = 25.0
            water_litres += 1000.0
            chem_cost += 300.0
        else:
            fabric_penalty_min = 10.0
            water_litres += 400.0

    total_changeover_min = base_changeover_min + fabric_penalty_min
    energy_kwh = (total_changeover_min / 60.0) * 35.0 # ~35kW boiler/pump consumption

    return {
        "changeover_min": round(total_changeover_min, 1),
        "cleaning_min": round(cleaning_min, 1),
        "water_litres": round(water_litres, 1),
        "chemical_cost_inr": round(chem_cost, 1),
        "energy_kwh": round(energy_kwh, 1)
    }

def optimize_order_sequence_for_machine(orders_list: List[Any], current_colour: str = "WHITE", current_fabric: str = "Cotton") -> List[Any]:
    """
    Sequences orders on a machine to minimize sequence-dependent changeover time
    using a greedy heuristic with due date protection.
    """
    if len(orders_list) <= 1:
        return orders_list

    remaining = list(orders_list)
    optimized_seq = []
    
    last_col = current_colour
    last_fab = current_fabric
    
    while remaining:
        # Pick candidate that balances minimal changeover penalty with due date urgency
        best_candidate = None
        best_score = float('inf')
        
        for cand in remaining:
            penalty = calculate_changeover_penalty(
                from_fabric=last_fab,
                from_colour=last_col,
                to_fabric=cand.cloth_type,
                to_colour=cand.colour_code
            )
            
            # Weighted score: Changeover minutes (weight 1.0) - Urgency penalty (weight 0.4)
            # High urgency orders get priority even if changeover is higher
            urgency = getattr(cand, "urgency_score", 50.0)
            score = penalty["changeover_min"] - (urgency * 0.35)
            
            if score < best_score:
                best_score = score
                best_candidate = cand
                
        optimized_seq.append(best_candidate)
        last_col = best_candidate.colour_code
        last_fab = best_candidate.cloth_type
        remaining.remove(best_candidate)
        
    return optimized_seq
