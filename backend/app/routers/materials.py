from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.models.factory_models import Material, MaterialPurchase
from app.models.order_models import Order
from app.schemas.schemas import MaterialResponse

router = APIRouter(prefix="/api/materials", tags=["Materials & Inventory"])

@router.get("", response_model=List[MaterialResponse])
def get_materials(db: Session = Depends(get_db)):
    materials = db.query(Material).all()
    result = []
    
    for m in materials:
        avail = m.current_stock - m.reserved_stock
        is_shortage = avail < m.reorder_level
        latest_po = db.query(MaterialPurchase).filter(MaterialPurchase.material_id == m.id).order_by(MaterialPurchase.expected_arrival.desc()).first()

        result.append(MaterialResponse(
            id=m.id,
            code=m.code,
            name=m.name,
            material_type=m.material_type,
            current_stock=m.current_stock,
            reserved_stock=m.reserved_stock,
            available_stock=round(avail, 1),
            min_stock_level=m.min_stock_level,
            reorder_level=m.reorder_level,
            unit=m.unit,
            supplier=m.supplier,
            lead_time_days=m.lead_time_days,
            cost_per_unit=m.cost_per_unit,
            is_shortage=is_shortage,
            expected_arrival=latest_po.expected_arrival if latest_po else None,
            supplier_confidence_pct=latest_po.supplier_confidence_pct if latest_po else 80.0
        ))
    return result

@router.get("/forecast")
def get_inventory_forecast(db: Session = Depends(get_db)):
    """
    Inventory Forecasting Calculation:
    Required Material = Planned Requirement + Safety Stock - Available Inventory
    """
    materials = db.query(Material).all()
    orders = db.query(Order).filter(Order.status.in_(["PENDING", "SCHEDULED"])).all()
    
    forecasts = []
    for m in materials:
        avail = m.current_stock - m.reserved_stock
        safety_stock = m.min_stock_level
        
        # Estimate usage from pending orders
        planned_req = 0.0
        if m.material_type == "FABRIC":
            planned_req = sum(o.quantity_kg for o in orders if m.name.lower() in o.cloth_type.lower())
        elif m.material_type == "DYE":
            planned_req = sum(o.quantity_kg * 0.035 for o in orders if m.name.lower() in o.colour_name.lower())
            
        shortage = max(0.0, (planned_req + safety_stock) - avail)
        
        forecasts.append({
            "material_code": m.code,
            "material_name": m.name,
            "unit": m.unit,
            "available_stock": round(avail, 1),
            "safety_stock": round(safety_stock, 1),
            "planned_requirement": round(planned_req, 1),
            "projected_shortage": round(shortage, 1),
            "status": "CRITICAL_SHORTAGE" if shortage > 0 else ("REORDER_WARNING" if avail < m.reorder_level else "HEALTHY"),
            "lead_time_days": m.lead_time_days,
            "suggested_reorder_qty": round(max(shortage * 1.5, m.reorder_level), 1) if shortage > 0 else 0.0
        })
        
    return forecasts
