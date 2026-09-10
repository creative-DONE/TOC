from typing import Dict, Any, List

def calculate_schedule_quality_score(
    on_time_delivery_pct: float,
    bottleneck_utilization_pct: float,
    machine_utilization_pct: float,
    changeover_efficiency_pct: float,
    material_feasibility_pct: float,
    manpower_feasibility_pct: float,
    buffer_safety_pct: float,
    stability_score: float = 100.0
) -> Dict[str, Any]:
    """
    Evaluates the complete Schedule Quality Score (0 - 100):
    
    Strict Hierarchy Weights:
    - Priority 1 & 2: On-Time Delivery (35 pts)
    - Priority 3: Bottleneck Utilization & Protection (20 pts)
    - Priority 4: Material Feasibility (10 pts) & Manpower Feasibility (5 pts)
    - Priority 5: Changeover Efficiency (10 pts)
    - Priority 6: Machine Utilization (10 pts)
    - Priority 7: Buffer Safety & Stability (10 pts)
    """
    otd_score = (min(100.0, on_time_delivery_pct) / 100.0) * 35.0
    bottleneck_score = (min(100.0, bottleneck_utilization_pct) / 100.0) * 20.0
    material_score = (min(100.0, material_feasibility_pct) / 100.0) * 10.0
    manpower_score = (min(100.0, manpower_feasibility_pct) / 100.0) * 5.0
    changeover_score = (min(100.0, changeover_efficiency_pct) / 100.0) * 10.0
    machine_score = (min(100.0, machine_utilization_pct) / 100.0) * 10.0
    buffer_stability_score = ((buffer_safety_pct * 0.5 + stability_score * 0.5) / 100.0) * 10.0

    total_score = (
        otd_score + bottleneck_score + material_score +
        manpower_score + changeover_score + machine_score + buffer_stability_score
    )
    total_score = round(max(0.0, min(100.0, total_score)), 1)

    # Qualitative Grade
    if total_score >= 90.0:
        grade = "EXCELLENT"
    elif total_score >= 78.0:
        grade = "GOOD"
    elif total_score >= 65.0:
        grade = "MODERATE"
    else:
        grade = "CRITICAL"

    explanations = []
    recommendations = []

    if on_time_delivery_pct < 98.0:
        lost_otd = round(35.0 - otd_score, 1)
        explanations.append(f"Deducted {lost_otd} pts: On-time delivery is at {on_time_delivery_pct:.1f}%. Customer deadlines must be protected.")
        recommendations.append("Advance scheduled slots for at-risk orders by utilizing available buffers.")

    if bottleneck_utilization_pct < 85.0:
        lost_btn = round(20.0 - bottleneck_score, 1)
        explanations.append(f"Deducted {lost_btn} pts: Bottleneck utilization is only {bottleneck_utilization_pct:.1f}%. TOC requires maximizing Drum productivity.")
        recommendations.append("Feed ready jobs into the Drum queue to eliminate idle gaps.")

    if changeover_efficiency_pct < 85.0:
        lost_co = round(10.0 - changeover_score, 1)
        explanations.append(f"Deducted {lost_co} pts: Sub-optimal colour transitions detected ({changeover_efficiency_pct:.1f}% efficiency).")
        recommendations.append("Group similar shades and avoid dark-to-light sequencing on high-capacity vessels.")

    if stability_score < 90.0:
        explanations.append(f"Schedule nervousness: Stability score is {stability_score:.1f}% due to recent revisions in the near-term window.")

    if not explanations:
        explanations.append("Outstanding schedule: All customer deadlines met, bottleneck fully protected, minimal changeovers.")

    return {
        "overall_score": total_score,
        "grade": grade,
        "sub_scores": {
            "on_time_delivery": round(otd_score, 1),
            "bottleneck_utilization": round(bottleneck_score, 1),
            "material_feasibility": round(material_score, 1),
            "manpower_feasibility": round(manpower_score, 1),
            "changeover_efficiency": round(changeover_score, 1),
            "machine_utilization": round(machine_score, 1),
            "buffer_and_stability": round(buffer_stability_score, 1)
        },
        "score_explanations": explanations,
        "recommendations_to_reach_100": recommendations
    }
