from typing import List, Dict, Any, Tuple
from app.config import settings

def check_wip_rope_control(
    current_upstream_wip_kg: float,
    candidate_release_kg: float,
    max_allowed_wip_kg: float = settings.MAX_WIP_KG_PRE_DYEING
) -> Tuple[bool, str, float]:
    """
    TOC Drum-Buffer-Rope (DBR) Control:
    The 'Rope' releases materials upstream only at the rate consumed by the bottleneck (The Drum).
    If upstream inventory reaches the WIP threshold, the rope holds release.
    """
    projected_wip = current_upstream_wip_kg + candidate_release_kg
    
    if projected_wip > max_allowed_wip_kg:
        excess_kg = projected_wip - max_allowed_wip_kg
        msg = f"ROPE WIP LIMIT BREACHED: Current + Proposed WIP = {projected_wip:.0f}kg exceeds ceiling of {max_allowed_wip_kg:.0f}kg (Excess: {excess_kg:.0f}kg). Upstream release held."
        return False, msg, projected_wip
        
    msg = f"ROPE WIP STATUS OK: Projected WIP is {projected_wip:.0f}kg / {max_allowed_wip_kg:.0f}kg (Safe margin: {max_allowed_wip_kg - projected_wip:.0f}kg)."
    return True, msg, projected_wip
