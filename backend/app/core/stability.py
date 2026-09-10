from typing import Dict, Any

def calculate_schedule_stability_score(
    day0_modifications: int,
    day1_modifications: int,
    days2_3_modifications: int
) -> Dict[str, Any]:
    """
    Computes Schedule Stability Score (0 - 100):
    Penalizes shop-floor nervousness caused by changing near-term commitments.
    
    Weights:
    - Modifying Day 0 (Locked): -12 pts each
    - Modifying Day 1 (Mostly locked): -6 pts each
    - Modifying Days 2-3 (Limited): -2 pts each
    """
    deductions = (day0_modifications * 12.0) + (day1_modifications * 6.0) + (days2_3_modifications * 2.0)
    score = max(0.0, 100.0 - deductions)
    
    if score >= 90.0:
        evaluation = "EXCELLENT — Highly stable schedule; shop floor operations undisturbed"
    elif score >= 75.0:
        evaluation = "MODERATE — Minor changes to upcoming slots; acceptable disruption"
    else:
        evaluation = "LOW STABILITY — High schedule nervousness; frequent near-term changes detected"
        
    return {
        "stability_score": round(score, 1),
        "day0_modifications": day0_modifications,
        "day1_modifications": day1_modifications,
        "days2_3_modifications": days2_3_modifications,
        "evaluation": evaluation
    }
