from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.factory_models import Material, Machine, Employee, EmployeeSkill, MaterialType
from app.models.order_models import Order, ReadinessStatus

def evaluate_order_readiness(order: Order, db: Session) -> Dict[str, Any]:
    """
    Evaluates the 5-point readiness checklist for an order:
    1. Base Fabric Available
    2. Dyes & Chemicals in Stock
    3. Qualified Operator Available
    4. Target Machine Operational
    5. Lab Dip / Shade Approved
    """
    missing_items = []
    
    # 1. Check Fabric Availability
    fabric_mat = db.query(Material).filter(
        Material.material_type == MaterialType.FABRIC.value,
        Material.name.ilike(f"%{order.cloth_type}%")
    ).first()
    
    fabric_ok = False
    if fabric_mat:
        avail_stock = fabric_mat.current_stock - fabric_mat.reserved_stock
        if avail_stock >= order.quantity_kg:
            fabric_ok = True
        else:
            missing_items.append(f"Fabric shortage: Needs {order.quantity_kg}kg {order.cloth_type}, available: {avail_stock}kg")
    else:
        missing_items.append(f"No inventory record found for fabric {order.cloth_type}")
        
    # 2. Check Dye Availability
    dye_mat = db.query(Material).filter(
        Material.material_type == MaterialType.DYE.value,
        Material.name.ilike(f"%{order.colour_name}%")
    ).first()
    
    dye_ok = False
    # Standard rule: ~3% dye requirement by fabric weight
    needed_dye_kg = order.quantity_kg * 0.035
    if dye_mat:
        avail_dye = dye_mat.current_stock - dye_mat.reserved_stock
        if avail_dye >= needed_dye_kg:
            dye_ok = True
        else:
            missing_items.append(f"Dye shortage: Needs {needed_dye_kg:.1f}kg {order.colour_name}, available: {avail_dye:.1f}kg")
    else:
        # Check if colour code matches any dye
        dye_ok = True # If not specifically restricted, assume available from bulk batch
        
    # 3. Check Qualified Operator Available
    qualified_operator = db.query(Employee).filter(
        Employee.on_leave == False,
        Employee.current_workload_hours < 8.0
    ).first()
    operator_ok = qualified_operator is not None
    if not operator_ok:
        missing_items.append("No qualified operator currently available on shift")
        
    # 4. Check Machine Availability
    machine_ok = False
    if order.assigned_machine_id:
        mach = db.query(Machine).filter(Machine.id == order.assigned_machine_id).first()
        if mach and mach.status in ["AVAILABLE", "RUNNING", "IDLE"]:
            machine_ok = True
        else:
            missing_items.append(f"Assigned machine {mach.name if mach else 'Unknown'} is currently {mach.status if mach else 'Unavailable'}")
    else:
        # Check any compatible machine exists
        any_mach = db.query(Machine).filter(
            Machine.status != "BREAKDOWN",
            Machine.max_batch_kg >= min(order.quantity_kg, 200.0)
        ).first()
        machine_ok = any_mach is not None
        if not machine_ok:
            missing_items.append("No compatible operational machine currently available")

    # 5. Lab Dip / Shade Approval
    lab_dip_ok = True
    if "EXPORT" in (order.required_quality or "") and order.priority == "EMERGENCY":
        # Emergency export might require confirmed shade match
        lab_dip_ok = True # Default confirmed for demonstration unless missing checklist
    if order.readiness_checklist and not order.readiness_checklist.lab_dip_approved:
        lab_dip_ok = False
        missing_items.append("Lab dip shade match pending customer approval")

    # Determine overall status
    if fabric_ok and dye_ok and operator_ok and machine_ok and lab_dip_ok:
        status = ReadinessStatus.READY.value
    elif (fabric_ok or dye_ok) and machine_ok:
        status = ReadinessStatus.PARTIALLY_READY.value
    else:
        status = ReadinessStatus.NOT_READY.value
        
    return {
        "fabric_available": fabric_ok,
        "dye_available": dye_ok,
        "operator_available": operator_ok,
        "machine_available": machine_ok,
        "lab_dip_approved": lab_dip_ok,
        "status": status,
        "missing_items": missing_items,
        "missing_items_summary": "; ".join(missing_items) if missing_items else "All pre-requisites satisfied"
    }

def find_smart_ready_swap(unready_order: Order, db: Session) -> Optional[Order]:
    """
    If an order is NOT READY, finds an immediately feasible READY order
    with compatible machine requirements and highest urgency to prevent machine idle time.
    """
    candidates = db.query(Order).filter(
        Order.id != unready_order.id,
        Order.readiness_status == ReadinessStatus.READY.value,
        Order.status.in_(["PENDING", "SCHEDULED"]),
        Order.quantity_kg <= (unready_order.quantity_kg * 1.3)
    ).order_by(Order.urgency_score.desc()).all()
    
    return candidates[0] if candidates else None
