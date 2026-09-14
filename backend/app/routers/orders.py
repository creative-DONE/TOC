from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from app.db.database import get_db
from app.models.order_models import Order, Customer, OrderStatus, ReadinessStatus, OrderReadinessChecklist, OrderProcessStage
from app.models.factory_models import Machine, Employee
from app.models.schedule_models import ProductionSchedule
from app.schemas.schemas import OrderCreate, OrderResponse, OrderUpdate
from app.services.scheduler_service import SchedulerService, optimize_factory_schedule
from app.services.excel_import_service import import_excel_orders_to_db
from app.core.readiness import evaluate_order_readiness

router = APIRouter(prefix="/api/orders", tags=["Orders"])

@router.get("", response_model=List[OrderResponse])
def get_orders(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    if priority:
        query = query.filter(Order.priority == priority)
        
    orders = query.order_by(Order.urgency_score.desc()).all()
    
    result = []
    for o in orders:
        cust_name = o.customer.name if o.customer else "Unknown"
        mach_name = o.assigned_machine.name if o.assigned_machine else None
        op_name = o.assigned_operator.name if o.assigned_operator else None
        
        result.append(OrderResponse(
            id=o.id,
            order_number=o.order_number,
            customer_name=cust_name,
            customer_priority_tier=o.customer.priority_tier if o.customer else "TIER_1",
            cloth_type=o.cloth_type,
            quantity_kg=o.quantity_kg,
            colour_name=o.colour_name,
            colour_code=o.colour_code,
            due_date=o.due_date,
            order_date=o.order_date,
            priority=o.priority,
            urgency_score=o.urgency_score,
            readiness_status=o.readiness_status,
            status=o.status,
            assigned_machine_id=o.assigned_machine_id,
            assigned_machine_name=mach_name,
            assigned_operator_id=o.assigned_operator_id,
            assigned_operator_name=op_name,
            planned_start=o.planned_start,
            planned_completion=o.planned_completion,
            seven_day_rule_violated=o.seven_day_rule_violated,
            seven_day_rule_diagnostic=o.seven_day_rule_diagnostic,
            drum_buffer_hours=o.drum_buffer_hours,
            shipping_buffer_hours=o.shipping_buffer_hours,
            buffer_penetration_pct=o.buffer_penetration_pct,
            freeze_level=o.freeze_level,
            scheduling_reason=o.scheduling_reason,
            batches_count=len(o.batches) if o.batches else 1
        ))
    return result

@router.post("", response_model=OrderResponse)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    # Find or assign default customer
    customer = None
    if order_in.customer_id:
        customer = db.query(Customer).filter(Customer.id == order_in.customer_id).first()
    if not customer:
        customer = db.query(Customer).filter(Customer.name.ilike(f"%{order_in.customer_name}%")).first()
    if not customer:
        customer = Customer(
            code=f"CUST-{datetime.utcnow().strftime('%M%S')}",
            name=order_in.customer_name,
            priority_tier="TIER_2",
            importance_weight=1.1
        )
        db.add(customer)
        db.flush()

    new_order = Order(
        order_number=order_in.order_number,
        customer_id=customer.id,
        order_date=datetime.utcnow(),
        due_date=order_in.due_date,
        cloth_type=order_in.cloth_type,
        quantity_kg=order_in.quantity_kg,
        colour_name=order_in.colour_name,
        colour_code=order_in.colour_code,
        priority=order_in.priority,
        required_quality=order_in.required_quality,
        required_finishing=order_in.required_finishing,
        delivery_location=order_in.delivery_location,
        status=OrderStatus.PENDING.value,
        readiness_status=ReadinessStatus.NOT_READY.value
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)

    # Trigger scheduler service to recalculate urgency and readiness
    scheduler = SchedulerService(db)
    scheduler.calculate_urgency_scores()
    scheduler.update_all_readiness()

    # Re-optimize complete factory schedule
    optimize_factory_schedule(db, reference_now=datetime.utcnow(), force_reschedule_all=False, preserve_locked=True)
    db.commit()
    db.refresh(new_order)

    return OrderResponse(
        id=new_order.id,
        order_number=new_order.order_number,
        customer_name=customer.name,
        customer_priority_tier=customer.priority_tier,
        cloth_type=new_order.cloth_type,
        quantity_kg=new_order.quantity_kg,
        colour_name=new_order.colour_name,
        colour_code=new_order.colour_code,
        due_date=new_order.due_date,
        order_date=new_order.order_date,
        priority=new_order.priority,
        urgency_score=new_order.urgency_score,
        readiness_status=new_order.readiness_status,
        status=new_order.status,
        assigned_machine_id=new_order.assigned_machine_id,
        assigned_machine_name=None,
        assigned_operator_id=new_order.assigned_operator_id,
        assigned_operator_name=None,
        planned_start=new_order.planned_start,
        planned_completion=new_order.planned_completion,
        seven_day_rule_violated=new_order.seven_day_rule_violated,
        seven_day_rule_diagnostic=new_order.seven_day_rule_diagnostic,
        drum_buffer_hours=new_order.drum_buffer_hours,
        shipping_buffer_hours=new_order.shipping_buffer_hours,
        buffer_penetration_pct=new_order.buffer_penetration_pct,
        freeze_level=new_order.freeze_level,
        scheduling_reason=new_order.scheduling_reason,
        batches_count=1
    )

@router.get("/{order_id}/readiness")
def get_order_readiness_checklist(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    checklist = db.query(OrderReadinessChecklist).filter(OrderReadinessChecklist.order_id == order_id).first()
    return {
        "order_number": order.order_number,
        "readiness_status": order.readiness_status,
        "fabric_available": checklist.fabric_available if checklist else False,
        "dye_available": checklist.dye_available if checklist else False,
        "operator_available": checklist.operator_available if checklist else False,
        "machine_available": checklist.machine_available if checklist else False,
        "lab_dip_approved": checklist.lab_dip_approved if checklist else True,
        "missing_items_summary": checklist.missing_items_summary if checklist else "Pending evaluation"
    }

@router.get("/{order_id}")
def get_order_detail(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    cust_name = order.customer.name if order.customer else "Unknown"
    mach_name = order.assigned_machine.name if order.assigned_machine else None
    op_name = order.assigned_operator.name if order.assigned_operator else None

    # Readiness checklist
    checklist = db.query(OrderReadinessChecklist).filter(OrderReadinessChecklist.order_id == order_id).first()
    if not checklist:
        readiness_info = evaluate_order_readiness(order, db)
    else:
        readiness_info = {
            "fabric_available": checklist.fabric_available,
            "dye_available": checklist.dye_available,
            "operator_available": checklist.operator_available,
            "machine_available": checklist.machine_available,
            "lab_dip_approved": checklist.lab_dip_approved,
            "status": order.readiness_status,
            "missing_items_summary": checklist.missing_items_summary or "All prerequisites satisfied"
        }

    # Associated Schedule Slot
    sched_slot = db.query(ProductionSchedule).filter(
        ProductionSchedule.order_id == order_id
    ).order_by(ProductionSchedule.planned_start.asc()).first()

    # Process stages
    stages = db.query(OrderProcessStage).filter(OrderProcessStage.order_id == order_id).order_by(OrderProcessStage.sequence_order.asc()).all()

    return {
        "id": order.id,
        "order_number": order.order_number,
        "customer_name": cust_name,
        "customer_priority_tier": order.customer.priority_tier if order.customer else "TIER_1",
        "cloth_type": order.cloth_type,
        "quantity_kg": order.quantity_kg,
        "colour_name": order.colour_name,
        "colour_code": order.colour_code,
        "due_date": order.due_date.isoformat(),
        "order_date": order.order_date.isoformat(),
        "priority": order.priority,
        "urgency_score": order.urgency_score,
        "readiness_status": order.readiness_status,
        "status": order.status,
        "assigned_machine_id": order.assigned_machine_id,
        "assigned_machine_name": mach_name,
        "assigned_operator_id": order.assigned_operator_id,
        "assigned_operator_name": op_name,
        "planned_start": order.planned_start.isoformat() if order.planned_start else None,
        "planned_completion": order.planned_completion.isoformat() if order.planned_completion else None,
        "seven_day_rule_violated": order.seven_day_rule_violated,
        "seven_day_rule_diagnostic": order.seven_day_rule_diagnostic,
        "drum_buffer_hours": order.drum_buffer_hours,
        "shipping_buffer_hours": order.shipping_buffer_hours,
        "buffer_penetration_pct": order.buffer_penetration_pct,
        "freeze_level": order.freeze_level,
        "scheduling_reason": order.scheduling_reason,
        "notes": order.notes,
        "readiness_checklist": readiness_info,
        "schedule": {
            "id": sched_slot.id if sched_slot else None,
            "machine_name": sched_slot.machine.name if (sched_slot and sched_slot.machine) else mach_name,
            "operator_name": sched_slot.operator.name if (sched_slot and sched_slot.operator) else op_name,
            "planned_start": sched_slot.planned_start.isoformat() if sched_slot else None,
            "planned_end": sched_slot.planned_end.isoformat() if sched_slot else None,
            "base_processing_min": sched_slot.base_processing_min if sched_slot else 120.0,
            "setup_min": sched_slot.setup_min if sched_slot else 15.0,
            "changeover_min": sched_slot.changeover_min if sched_slot else 20.0,
            "cleaning_min": sched_slot.cleaning_min if sched_slot else 15.0,
            "operating_cost_inr": sched_slot.operating_cost_inr if sched_slot else 3500.0,
            "is_locked": sched_slot.is_locked if sched_slot else False,
            "status": sched_slot.status if sched_slot else order.status
        } if sched_slot else None,
        "process_stages": [
            {
                "stage_name": st.stage_name,
                "sequence_order": st.sequence_order,
                "duration_minutes": st.duration_minutes,
                "status": st.status,
                "assigned_resource": st.assigned_resource
            }
            for st in stages
        ]
    }

@router.put("/{order_id}")
def update_order(order_id: int, order_in: OrderUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status == OrderStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Cannot edit an order that is already completed.")
    if order.status == OrderStatus.CANCELLED.value:
        raise HTTPException(status_code=400, detail="Cannot edit a cancelled order.")

    # If in production, restrict editing core process parameters
    is_in_prod = order.status in [OrderStatus.IN_PROGRESS.value, "IN_PRODUCTION"]
    if is_in_prod:
        if order_in.quantity_kg is not None and order_in.quantity_kg != order.quantity_kg:
            raise HTTPException(status_code=400, detail="Cannot alter fabric quantity while batch is actively in production.")
        if order_in.cloth_type is not None and order_in.cloth_type != order.cloth_type:
            raise HTTPException(status_code=400, detail="Cannot alter fabric type while batch is actively in production.")
        if order_in.colour_name is not None and order_in.colour_name != order.colour_name:
            raise HTTPException(status_code=400, detail="Cannot alter dye shade while batch is actively in production.")

    # Update editable fields
    if order_in.priority:
        order.priority = order_in.priority
    if order_in.due_date:
        order.due_date = order_in.due_date
    if order_in.quantity_kg and not is_in_prod:
        order.quantity_kg = order_in.quantity_kg
    if order_in.cloth_type and not is_in_prod:
        order.cloth_type = order_in.cloth_type
    if order_in.colour_name and not is_in_prod:
        order.colour_name = order_in.colour_name
    if order_in.colour_code and not is_in_prod:
        order.colour_code = order_in.colour_code
    if order_in.notes is not None:
        order.notes = order_in.notes

    db.commit()

    # Recalculate urgency and readiness
    scheduler = SchedulerService(db)
    scheduler.calculate_urgency_scores()
    scheduler.update_all_readiness()
    
    # If not in production, recheck scheduling alignment
    if not is_in_prod:
        scheduler.generate_full_schedule()

    db.refresh(order)
    return {
        "success": True,
        "message": f"Order #{order.order_number} updated successfully. Constraints & schedule verified.",
        "order": {
            "id": order.id,
            "order_number": order.order_number,
            "quantity_kg": order.quantity_kg,
            "due_date": order.due_date.isoformat(),
            "priority": order.priority,
            "status": order.status,
            "urgency_score": order.urgency_score
        }
    }

@router.post("/{order_id}/start-production")
def start_order_production(order_id: int, db: Session = Depends(get_db)):
    """
    Start Production Button with REAL FACTORY LOGIC:
    Checks readiness conditions:
    - Order exists and is not already in production, completed, or cancelled
    - Scheduled slot exists
    - Compatible machine available and not in breakdown/maintenance
    - Fabric & dye availability
    - Qualified operator assigned
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    blocking_reasons = []

    if order.status in [OrderStatus.IN_PROGRESS.value, "IN_PRODUCTION"]:
        return {"success": False, "message": "Order is already actively in production."}
    if order.status == OrderStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Cannot start production: Order is already completed.")
    if order.status == OrderStatus.CANCELLED.value:
        raise HTTPException(status_code=400, detail="Cannot start production: Order has been cancelled.")

    # Check scheduling
    if not order.planned_start or not order.assigned_machine_id:
        blocking_reasons.append("Order has not yet been assigned a planned machine schedule slot.")

    # Check machine status
    mach = db.query(Machine).filter(Machine.id == order.assigned_machine_id).first() if order.assigned_machine_id else None
    if mach:
        if mach.status == "BREAKDOWN":
            blocking_reasons.append(f"Assigned machine '{mach.name}' is currently in BREAKDOWN. Reassign to alternate vessel first.")
        elif mach.status == "MAINTENANCE":
            blocking_reasons.append(f"Assigned machine '{mach.name}' is currently undergoind SCHEDULED MAINTENANCE.")
    else:
        blocking_reasons.append("No valid machine assigned for this production order.")

    # Evaluate 5-point readiness checklist
    readiness = evaluate_order_readiness(order, db)
    if not readiness["fabric_available"]:
        blocking_reasons.append(f"Fabric shortage: {order.quantity_kg}kg of {order.cloth_type} is not yet available in inventory.")
    if not readiness["dye_available"]:
        blocking_reasons.append(f"Dye material shortage: Required dye recipe for '{order.colour_name}' is not in stock.")
    if not readiness["operator_available"]:
        blocking_reasons.append("No certified operator is currently available on the active shift.")
    if not readiness["lab_dip_approved"]:
        blocking_reasons.append("Customer lab dip shade match approval is still pending.")

    if blocking_reasons:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Cannot start production: Factory prerequisites not satisfied.",
                "blocking_reasons": blocking_reasons
            }
        )

    # All checks passed: Start production!
    now = datetime.utcnow()
    order.status = OrderStatus.IN_PROGRESS.value
    order.readiness_status = ReadinessStatus.IN_PRODUCTION.value

    # Update associated schedule slot
    sched = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == order_id).first()
    if sched:
        sched.status = "IN_PROGRESS"
        sched.actual_start = now
        sched.is_locked = True
        sched.freeze_level = "LOCKED"

    # Update machine status to running
    if mach:
        mach.status = "RUNNING"

    db.commit()

    return {
        "success": True,
        "message": f"✓ Production started successfully for Order #{order.order_number} on {mach.name if mach else 'Machine'}.",
        "started_at": now.isoformat(),
        "assigned_machine": mach.name if mach else "Assigned Machine",
        "assigned_operator": order.assigned_operator.name if order.assigned_operator else "Master Dyer"
    }

@router.post("/{order_id}/cancel")
def cancel_order(order_id: int, db: Session = Depends(get_db)):
    """
    Cancel Order Button with Confirmation and Resource Release Logic:
    - Cannot cancel orders already in production or completed.
    - Frees machine capacity, releases schedule slots, recalculates TOC schedule.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status in [OrderStatus.IN_PROGRESS.value, "IN_PRODUCTION"]:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled because production has already started.")
    if order.status == OrderStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Completed orders cannot be cancelled.")
    if order.status == OrderStatus.CANCELLED.value:
        raise HTTPException(status_code=400, detail="Order is already cancelled.")

    # Cancel order
    order.status = OrderStatus.CANCELLED.value
    order.readiness_status = "CANCELLED"
    order.scheduling_reason = f"ORDER CANCELLED by Production Manager at {datetime.utcnow().strftime('%d %b %H:%M')}."

    # Remove or mark associated schedules
    schedules = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == order_id).all()
    for s in schedules:
        s.status = "CANCELLED"

    db.commit()

    # Re-run schedule to re-optimize remaining orders into freed capacity
    scheduler = SchedulerService(db)
    scheduler.generate_full_schedule()

    return {
        "success": True,
        "message": f"✓ Order #{order.order_number} cancelled successfully. Machine capacity and materials have been released to other orders."
    }

@router.get("/{order_id}/schedule-detail")
def get_order_schedule_detail(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    sched = db.query(ProductionSchedule).filter(ProductionSchedule.order_id == order_id).first()
    if not sched:
        return {
            "has_schedule": False,
            "message": f"Order #{order.order_number} is currently pending and has not been allocated a confirmed slot."
        }

    return {
        "has_schedule": True,
        "order_id": order.id,
        "order_number": order.order_number,
        "customer": order.customer.name if order.customer else "Direct Customer",
        "cloth_type": order.cloth_type,
        "quantity_kg": order.quantity_kg,
        "colour_name": order.colour_name,
        "colour_code": order.colour_code,
        "machine_name": sched.machine.name if sched.machine else "Machine",
        "machine_code": sched.machine.code if sched.machine else "M",
        "operator_name": sched.operator.name if sched.operator else "Assigned Operator",
        "planned_start": sched.planned_start.isoformat(),
        "planned_end": sched.planned_end.isoformat(),
        "processing_time_min": sched.base_processing_min,
        "changeover_min": sched.changeover_min,
        "cleaning_min": sched.cleaning_min,
        "status": sched.status,
        "due_date": order.due_date.isoformat(),
        "buffer_status": "SAFE" if order.buffer_penetration_pct < 33 else ("WARNING" if order.buffer_penetration_pct < 66 else "CRITICAL"),
        "buffer_penetration_pct": order.buffer_penetration_pct,
        "operating_cost_inr": sched.operating_cost_inr,
        "is_locked": sched.is_locked,
        "freeze_level": sched.freeze_level,
        "reasons": (order.scheduling_reason or "").split(" | ")
    }

@router.post("/import-excel")
async def import_orders_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Import production orders from an Excel file (.xlsx, .xls) with Due Date support.
    """
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are accepted.")
    content = await file.read()
    res = import_excel_orders_to_db(db, content)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Excel import failed"))
    return res

