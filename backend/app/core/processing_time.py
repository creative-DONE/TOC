from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.history_models import HistoricalProduction

def calculate_composite_processing_time(
    cloth_type: str,
    colour_name: str,
    quantity_kg: float,
    changeover_min: float = 20.0,
    machine_efficiency: float = 0.92,
    historical_calibrated_base_min: Optional[float] = None
) -> Dict[str, float]:
    """
    Computes realistic composite processing time for textile colouring:
    Processing Time = Base Processing + Setup + Changeover + Cleaning + Loading + Unloading + Inspection
    """
    # 1. Base Dyeing Time
    if historical_calibrated_base_min is not None:
        base_dye_min = historical_calibrated_base_min
    else:
        # Standard base: 120 min for Cotton, 160 min for Polyester/Blend (HTHP cycle)
        if "polyester" in cloth_type.lower():
            base_dye_min = 160.0
        elif "rayon" in cloth_type.lower():
            base_dye_min = 140.0
        else:
            base_dye_min = 120.0 # Standard reactive cotton cycle
            
        # Scaling by batch volume
        volume_factor = (quantity_kg / 500.0) ** 0.35
        base_dye_min = base_dye_min * volume_factor

    # 2. Setup & Preparation
    setup_min = 15.0
    
    # 3. Cleaning & Changeover
    cleaning_min = max(10.0, changeover_min * 0.6)
    
    # 4. Loading & Unloading (proportional to weight)
    loading_min = max(10.0, (quantity_kg / 100.0) * 2.5)
    unloading_min = max(10.0, (quantity_kg / 100.0) * 2.0)
    
    # 5. Quality Inspection & Shade Verification
    inspection_min = 20.0
    
    # Raw processing subtotal
    subtotal_min = base_dye_min + setup_min + changeover_min + cleaning_min + loading_min + unloading_min + inspection_min
    
    # Adjust for machine efficiency
    effective_min = subtotal_min / max(0.5, machine_efficiency)
    
    return {
        "base_dye_min": round(base_dye_min, 1),
        "setup_min": round(setup_min, 1),
        "changeover_min": round(changeover_min, 1),
        "cleaning_min": round(cleaning_min, 1),
        "loading_min": round(loading_min, 1),
        "unloading_min": round(unloading_min, 1),
        "inspection_min": round(inspection_min, 1),
        "total_processing_min": round(effective_min, 1),
        "total_processing_hours": round(effective_min / 60.0, 2)
    }

def get_calibrated_base_time(cloth_type: str, colour_name: str, db: Session) -> Optional[float]:
    """
    Historical Learning:
    Retrieves historical records for identical/similar fabric and colour combinations
    and computes the calibrated moving average duration.
    """
    history_records = db.query(HistoricalProduction).filter(
        HistoricalProduction.cloth_type == cloth_type,
        HistoricalProduction.colour_name.ilike(f"%{colour_name}%")
    ).all()
    
    if len(history_records) >= 3:
        # Calculate moving average of actual duration minus known setup/changeover
        actual_bases = [r.actual_duration_min - r.changeover_time_min for r in history_records]
        calibrated_avg = sum(actual_bases) / len(actual_bases)
        return round(calibrated_avg, 1)
        
    return None
