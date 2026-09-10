from enum import Enum
from typing import List, Dict, Any

class ProductionStageType(str, Enum):
    FABRIC_INSPECTION = "FABRIC_INSPECTION"
    PRE_TREATMENT = "PRE_TREATMENT"         # Scouring & Bleaching
    DYE_PREP = "DYE_PREP"                   # Lab dip & recipe dispensing
    DYEING = "DYEING"                       # Primary Drum / Machine dyeing
    WASHING = "WASHING"                     # Post-dye wash-off & neutralization
    DRYING = "DRYING"                       # Hydro-extraction & relax drying
    FINISHING = "FINISHING"                 # Stenter heat setting & softening
    QUALITY_INSPECTION = "QUALITY_INSPECTION"# Spectrophotometer & GSM check
    REWORK = "REWORK"                       # Conditional strip & re-dye
    PACKING_DISPATCH = "PACKING_DISPATCH"   # Inspection, roll packing & dispatch

# Sequence and standard durations in minutes per 500kg batch
STANDARD_STAGE_PIPELINE = [
    {"stage": ProductionStageType.FABRIC_INSPECTION, "order": 1, "duration_min": 30.0, "resource_type": "INSPECTION_LINE"},
    {"stage": ProductionStageType.PRE_TREATMENT, "order": 2, "duration_min": 60.0, "resource_type": "PRE_TREATMENT_BATH"},
    {"stage": ProductionStageType.DYE_PREP, "order": 3, "duration_min": 25.0, "resource_type": "COLOR_LAB"},
    {"stage": ProductionStageType.DYEING, "order": 4, "duration_min": 180.0, "resource_type": "DYEING_MACHINE"}, # The Drum
    {"stage": ProductionStageType.WASHING, "order": 5, "duration_min": 45.0, "resource_type": "WASHING_LINE"},
    {"stage": ProductionStageType.DRYING, "order": 6, "duration_min": 50.0, "resource_type": "DRYING_TUMBLER"},
    {"stage": ProductionStageType.FINISHING, "order": 7, "duration_min": 60.0, "resource_type": "STENTER_FINISHING"},
    {"stage": ProductionStageType.QUALITY_INSPECTION, "order": 8, "duration_min": 30.0, "resource_type": "LAB_INSPECTION"},
    {"stage": ProductionStageType.PACKING_DISPATCH, "order": 9, "duration_min": 40.0, "resource_type": "DISPATCH_PACKING"},
]

def get_stage_pipeline_for_cloth(cloth_type: str, quantity_kg: float) -> List[Dict[str, Any]]:
    """Calculates tailored stage pipeline durations based on cloth type and batch weight."""
    scaling_factor = max(0.6, quantity_kg / 500.0)
    pipeline = []
    
    for item in STANDARD_STAGE_PIPELINE:
        base_dur = item["duration_min"]
        
        # Polyester requires longer high-temperature dyeing and stenter heat-setting
        if "Polyester" in cloth_type and item["stage"] == ProductionStageType.DYEING:
            dur = (base_dur + 30.0) * (scaling_factor ** 0.5)
        elif "Cotton" in cloth_type and item["stage"] == ProductionStageType.WASHING:
            dur = (base_dur + 15.0) * (scaling_factor ** 0.5) # Cotton requires more washings for reactive dyes
        else:
            dur = base_dur * (scaling_factor ** 0.5)
            
        pipeline.append({
            "stage_name": item["stage"].value,
            "sequence_order": item["order"],
            "duration_minutes": round(dur, 1),
            "resource_type": item["resource_type"]
        })
    return pipeline
