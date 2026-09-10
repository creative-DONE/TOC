from typing import List, Dict, Any, Tuple
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

def find_best_machine_for_batch(
    order_quantity_kg: float,
    cloth_type: str,
    available_machines: List[Any]
) -> Tuple[Any, List[Dict[str, Any]]]:
    """
    Finds either:
    1. A single machine that can accommodate the entire order without splitting, or
    2. The most efficient machine paired with balanced split batches.
    """
    # Filter compatible machines
    compatible = [
        m for m in available_machines
        if cloth_type.lower() in (m.compatible_cloth_types or "").lower()
        and m.status != "BREAKDOWN"
    ]
    if not compatible:
        compatible = available_machines # fallback

    # Check for direct fit without splitting
    direct_fits = [m for m in compatible if m.max_batch_kg >= order_quantity_kg >= m.min_batch_kg]
    if direct_fits:
        # Choose the machine whose capacity is closest to minimize liquor ratio waste
        direct_fits.sort(key=lambda m: m.max_batch_kg - order_quantity_kg)
        best_m = direct_fits[0]
        batches = evaluate_and_split_order_batches(order_quantity_kg, best_m.max_batch_kg, best_m.min_batch_kg)
        return best_m, batches
        
    # If no single machine fits, pick largest capacity machine and split
    compatible.sort(key=lambda m: m.max_batch_kg, reverse=True)
    best_m = compatible[0]
    batches = evaluate_and_split_order_batches(order_quantity_kg, best_m.max_batch_kg, best_m.min_batch_kg)
    return best_m, batches
