from typing import List, Dict, Any, Tuple, Optional
import math

def evaluate_and_split_order_batches(
    order_quantity_kg: float,
    machine_max_capacity_kg: float,
    machine_min_capacity_kg: float = 50.0
) -> List[Dict[str, Any]]:
    """
    Evaluates whether an order exceeds a machine's capacity and partitions it into
    balanced batches if necessary.
    
    Example:
    Order = 700 kg, Machine max = 500 kg
    Result: 2 batches of 350 kg each (balanced load for dye liquor ratio).
    """
    if order_quantity_kg <= machine_max_capacity_kg:
        return [{
            "batch_number": 1,
            "total_batches": 1,
            "quantity_kg": order_quantity_kg,
            "is_split": False
        }]
        
    num_batches = math.ceil(order_quantity_kg / machine_max_capacity_kg)
    # Balanced load per batch maintains optimal liquor ratio and shade consistency
    batch_qty = round(order_quantity_kg / num_batches, 1)
    
    batches = []
    accumulated_qty = 0.0
    for i in range(1, num_batches + 1):
        if i == num_batches:
            curr_qty = round(order_quantity_kg - accumulated_qty, 1)
        else:
            curr_qty = batch_qty
            accumulated_qty += curr_qty
            
        batches.append({
            "batch_number": i,
            "total_batches": num_batches,
            "quantity_kg": curr_qty,
            "is_split": True
        })
        
    return batches

def split_order_into_capacity_allocations(
    order_quantity_kg: float,
    machine_max_capacity_kg: float
) -> List[float]:
    """
    CRITICAL ALLOCATION SPLITTING:
    Never accept invalid machine capacity.
    required allocations = CEILING(order quantity / machine capacity)
    e.g. 8000 kg on 4000 kg cap -> [4000.0, 4000.0]
    e.g. 9500 kg on 4000 kg cap -> [4000.0, 4000.0, 1500.0]
    Invariant: sum(allocations) == order_quantity_kg
    """
    if order_quantity_kg <= 0 or machine_max_capacity_kg <= 0:
        return []
    if order_quantity_kg <= machine_max_capacity_kg:
        return [round(order_quantity_kg, 1)]

    num_allocations = math.ceil(order_quantity_kg / machine_max_capacity_kg)
    allocations = []
    remaining = order_quantity_kg

    for i in range(num_allocations):
        if i == num_allocations - 1:
            allocations.append(round(remaining, 1))
        else:
            alloc = min(machine_max_capacity_kg, remaining)
            allocations.append(round(alloc, 1))
            remaining -= alloc

    diff = round(order_quantity_kg - sum(allocations), 2)
    if abs(diff) > 0 and len(allocations) > 0:
        allocations[-1] = round(allocations[-1] + diff, 1)

    return allocations

def is_cloth_compatible(cloth_type: str, compatible_cloth_types: Optional[str]) -> bool:
    """
    Robust textile fabric compatibility matching.
    Checks whether the order's cloth type is compatible with a machine's allowed fabrics.
    Handles composite names like 'Poly-Cotton 65/35 Blend', 'Cotton 100% Greige Knit',
    'Rayon Viscose Fabric', 'Organic Cotton GOTS Certified', etc.
    """
    if not compatible_cloth_types or compatible_cloth_types.strip().upper() in ["ALL", "*", "ANY"]:
        return True
    if not cloth_type:
        return True

    cloth_lower = cloth_type.lower().strip()
    compat_list = [c.strip().lower() for c in compatible_cloth_types.split(",") if c.strip()]

    is_poly_blend = "poly" in cloth_lower
    is_organic = "organic" in cloth_lower
    is_denim = "denim" in cloth_lower
    is_twill = "twill" in cloth_lower or "woven" in cloth_lower

    for c in compat_list:
        if is_poly_blend:
            if "poly" in c:
                return True
        elif is_organic:
            if "organic" in c or "cotton" in c:
                return True
        elif is_denim:
            if "denim" in c or "woven" in c:
                return True
        elif is_twill:
            if "twill" in c or "woven" in c or "cotton" in c:
                return True
        elif c in cloth_lower or cloth_lower in c:
            return True

    # Generic token match on significant words
    tokens = [w for w in cloth_lower.replace("/", " ").replace("-", " ").split() if len(w) > 3 and not w.isdigit()]
    for c in compat_list:
        c_tokens = [w for w in c.replace("/", " ").replace("-", " ").split() if len(w) > 3]
        if any(t in c_tokens for t in tokens if t not in ["fabric", "blend", "100%"]):
            if is_poly_blend and "poly" not in c:
                continue
            return True

    return False

def get_compatible_machines(
    cloth_type: str,
    available_machines: List[Any],
    exclude_breakdown: bool = True
) -> List[Any]:
    """
    Returns list of machines compatible with the cloth type, strictly excluding BREAKDOWN machines.
    """
    compat = []
    for m in available_machines:
        if exclude_breakdown and getattr(m, "status", None) == "BREAKDOWN":
            continue
        if is_cloth_compatible(cloth_type, getattr(m, "compatible_cloth_types", None)):
            compat.append(m)

    if not compat:
        # Fallback to non-breakdown machines if none matched explicitly
        compat = [m for m in available_machines if getattr(m, "status", None) != "BREAKDOWN"]
    return compat if compat else available_machines

def find_best_machine_for_batch(
    order_quantity_kg: float,
    cloth_type: str,
    available_machines: List[Any],
    machine_current_loads: Optional[Dict[int, float]] = None,
    current_bottleneck_id: Optional[int] = None
) -> Tuple[Any, List[Dict[str, Any]]]:
    """
    Finds the optimal machine for an order considering:
    1. Cloth type compatibility (strictly non-breakdown).
    2. Factory load balancing & current utilization across the fleet.
    3. TOC Bottleneck Protection (penalizes overloading the current Drum constraint).
    4. Batch capacity fit and split batch efficiency.
    """
    compatible = get_compatible_machines(cloth_type, available_machines, exclude_breakdown=True)

    if not compatible:
        compatible = available_machines

    # Filter out machines in maintenance if alternatives exist
    avail_now = [m for m in compatible if getattr(m, "status", None) not in ["BREAKDOWN", "MAINTENANCE"]]
    candidate_machines = avail_now if avail_now else compatible

    current_loads = machine_current_loads or {}

    # Score each candidate machine (lower score = better choice)
    best_m = None
    best_score = float("inf")
    best_batches = None

    for m in candidate_machines:
        batches = evaluate_and_split_order_batches(order_quantity_kg, m.max_batch_kg, m.min_batch_kg)
        num_batches = len(batches)

        # 1. Capacity fit penalty
        if order_quantity_kg <= m.max_batch_kg:
            cap_fit_penalty = (m.max_batch_kg - order_quantity_kg) * 0.05
        else:
            cap_fit_penalty = (num_batches - 1) * 25.0

        # 2. Fleet load balancing / utilization penalty
        curr_load = current_loads.get(m.id, 0.0)
        nominal_7d = max(100.0, (7.0 * 24.0 * getattr(m, "efficiency", 0.9) / 3.2) * m.max_batch_kg)
        util_pct = (curr_load / nominal_7d) * 100.0
        load_penalty = util_pct * 1.5

        # 3. TOC Bottleneck Protection:
        # If this machine is the current TOC constraint / bottleneck, heavily penalize adding more work
        # to it when other compatible machines are available with lower load.
        drum_penalty = 0.0
        if current_bottleneck_id is not None and m.id == current_bottleneck_id:
            other_candidates = [other for other in candidate_machines if other.id != m.id]
            if other_candidates:
                drum_penalty = 200.0 + (util_pct * 2.0)

        # 4. Machine operating efficiency bonus
        eff_bonus = (getattr(m, "efficiency", 0.9) - 0.8) * 50.0

        # Total cost score
        total_score = cap_fit_penalty + load_penalty + drum_penalty - eff_bonus

        if total_score < best_score:
            best_score = total_score
            best_m = m
            best_batches = batches

    if not best_m:
        best_m = candidate_machines[0]
        best_batches = evaluate_and_split_order_batches(order_quantity_kg, best_m.max_batch_kg, best_m.min_batch_kg)

    return best_m, best_batches
