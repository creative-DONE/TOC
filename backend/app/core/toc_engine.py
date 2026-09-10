from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.factory_models import Machine, FactoryUtility, Employee, Material
from app.models.order_models import Order, OrderBatch
from app.config import settings
from app.core.changeover import optimize_order_sequence_for_machine, calculate_changeover_penalty
from app.core.processing_time import calculate_composite_processing_time

def identify_system_bottleneck(
    machines: List[Machine],
    orders: List[Order],
    utilities: List[FactoryUtility],
    horizon_days: int = 7
) -> Dict[str, Any]:
    """
    TOC Step 1: Identify the Constraint.
    Calculates Workload / AvailableCapacity across:
    1. Dyeing Machines
    2. Factory Utilities (Water, Steam, Power)
    3. Production Stages
    """
    total_horizon_hours = horizon_days * 24.0
    machine_loads = {}

    # Calculate aggregate workload per machine
    for m in machines:
        # Usable capacity accounting for efficiency and maintenance
        eff_capacity_hours = total_horizon_hours * m.efficiency
        # Nominal kg capacity = (eff_capacity_hours / avg_batch_hours) * max_batch_kg
        avg_batch_hours = 3.2
        nominal_kg_capacity = (eff_capacity_hours / avg_batch_hours) * m.max_batch_kg

        # Sum allocated order kg
        allocated_kg = sum(
            o.quantity_kg for o in orders
            if o.assigned_machine_id == m.id and o.status not in ["COMPLETED", "CANCELLED"]
        )
        
        # If unassigned orders exist, estimate distribution based on compatibility
        unassigned_kg = sum(
            o.quantity_kg for o in orders
            if o.assigned_machine_id is None and o.status not in ["COMPLETED", "CANCELLED"]
            and (m.compatible_cloth_types and o.cloth_type.lower() in m.compatible_cloth_types.lower())
        )
        total_workload_kg = allocated_kg + (unassigned_kg / max(1, len(machines)))

        utilization_pct = (total_workload_kg / max(1.0, nominal_kg_capacity)) * 100.0
        overload_hours = max(0.0, (total_workload_kg - nominal_kg_capacity) / (m.max_batch_kg / avg_batch_hours))

        machine_loads[m.id] = {
            "machine": m,
            "workload_kg": round(total_workload_kg, 1),
            "capacity_kg": round(nominal_kg_capacity, 1),
            "utilization_pct": round(utilization_pct, 1),
            "overload_hours": round(overload_hours, 1)
        }

    # Sort to find the highest utilization machine (The Drum)
    sorted_machines = sorted(machine_loads.values(), key=lambda x: x["utilization_pct"], reverse=True)
    primary_drum = sorted_machines[0] if sorted_machines else None

    # Check Utility Saturation (e.g. Water Treatment Effluent or Steam)
    utility_bottleneck = None
    for u in utilities:
        if u.current_load_per_hour > (u.capacity_per_hour * 0.90):
            utility_bottleneck = {
                "type": "UTILITY",
                "name": u.name,
                "utilization_pct": round((u.current_load_per_hour / u.capacity_per_hour) * 100.0, 1),
                "overload": round(u.current_load_per_hour - u.capacity_per_hour, 1)
            }
            break

    # Determine Active Constraint
    if utility_bottleneck and utility_bottleneck["utilization_pct"] > (primary_drum["utilization_pct"] if primary_drum else 0):
        bottleneck_info = {
            "current_bottleneck_type": "UTILITY",
            "resource_id": None,
            "resource_code": utility_bottleneck["name"].upper(),
            "resource_name": f"Factory Utility: {utility_bottleneck['name']}",
            "workload_kg": 0.0,
            "capacity_kg": 0.0,
            "utilization_pct": utility_bottleneck["utilization_pct"],
            "overload_hours": utility_bottleneck["overload"],
            "buffer_status": "CRITICAL" if utility_bottleneck["utilization_pct"] > 95 else "WARNING",
            "buffer_penetration_pct": min(100.0, utility_bottleneck["utilization_pct"]),
            "recommendation": f"Utility {utility_bottleneck['name']} has saturated factory capacity! Throttle simultaneous washing cycles or activate auxiliary reservoir.",
            "five_focusing_steps": generate_five_focusing_steps(utility_bottleneck["name"], "UTILITY")
        }
    elif primary_drum:
        m = primary_drum["machine"]
        u_pct = primary_drum["utilization_pct"]
        buffer_status = "CRITICAL" if u_pct >= 95.0 else ("WARNING" if u_pct >= 85.0 else "SAFE")
        
        recom = (
            f"Machine '{m.name}' is the active system Drum ({u_pct:.1f}% utilization, {primary_drum['overload_hours']:.1f}h overload). "
            f"Protect its input buffer, sequence light-to-dark to avoid caustic stripping, and consider shifting overflow to alternate machines."
        )

        bottleneck_info = {
            "current_bottleneck_type": "MACHINE",
            "resource_id": m.id,
            "resource_code": m.code,
            "resource_name": m.name,
            "workload_kg": primary_drum["workload_kg"],
            "capacity_kg": primary_drum["capacity_kg"],
            "utilization_pct": u_pct,
            "overload_hours": primary_drum["overload_hours"],
            "buffer_status": buffer_status,
            "buffer_penetration_pct": round(min(100.0, u_pct), 1),
            "recommendation": recom,
            "five_focusing_steps": generate_five_focusing_steps(m.name, "MACHINE")
        }
    else:
        bottleneck_info = {
            "current_bottleneck_type": "NONE",
            "resource_id": None,
            "resource_code": "BALANCED",
            "resource_name": "No active constraint",
            "workload_kg": 0.0,
            "capacity_kg": 10000.0,
            "utilization_pct": 50.0,
            "overload_hours": 0.0,
            "buffer_status": "SAFE",
            "buffer_penetration_pct": 20.0,
            "recommendation": "System load is well balanced within current capacity limits.",
            "five_focusing_steps": generate_five_focusing_steps("Factory", "BALANCED")
        }

    return bottleneck_info

def generate_five_focusing_steps(resource_name: str, resource_type: str) -> Dict[str, str]:
    """Generates explicit instructions for the 5 TOC Focusing Steps."""
    return {
        "step_1_identify": f"IDENTIFIED CONSTRAINT: {resource_name} ({resource_type}) is the primary throughput throttle.",
        "step_2_exploit": f"EXPLOIT THE DRUM: Maintain 100% uptime on {resource_name}. Eliminate unnecessary cleaning changeovers by sequencing shades light-to-dark. Ensure materials are pre-staged.",
        "step_3_subordinate": f"SUBORDINATE NON-BOTTLENECK STAGES: Upstream fabric scouring and lab dips must produce strictly to {resource_name}'s beat. Hold releases when upstream WIP reaches 1500kg limit.",
        "step_4_elevate": f"ELEVATE THE CONSTRAINT: If overloaded, schedule 4 hours overtime on {resource_name}, split oversized batches onto secondary vessels, or bring auxiliary capacity online.",
        "step_5_repeat": "REPEAT: Continuously re-evaluate system loads. Once this constraint is relieved, monitor for the next emerging constraint."
    }
