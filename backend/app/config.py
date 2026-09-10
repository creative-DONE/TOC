import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
EXPORTS_DIR = DATA_DIR / "exports"
EXPORTS_DIR.mkdir(exist_ok=True)

class Settings(BaseModel):
    PROJECT_NAME: str = "TOC Textile Colouring Production Scheduler"
    VERSION: str = "2.0.0"
    DATABASE_URL: str = f"sqlite:///{DATA_DIR / 'textile_production.db'}"
    
    # 7-Day Advance Planning Rule
    ADVANCE_PLANNING_DAYS: int = 7
    
    # Freeze Windows (Hours from reference time)
    FREEZE_TODAY_HOURS: int = 24        # Locked
    FREEZE_TOMORROW_HOURS: int = 48     # Mostly locked
    FREEZE_LIMITED_HOURS: int = 72      # Limited changes
    FREEZE_MODERATE_HOURS: int = 168    # 7 days: Moderate optimization
    
    # TOC Buffers
    DEFAULT_DRUM_BUFFER_HOURS: float = 4.0      # Safety buffer before bottleneck
    DEFAULT_SHIPPING_BUFFER_HOURS: float = 12.0  # Safety buffer before delivery
    DEFAULT_MATERIAL_BUFFER_DAYS: float = 2.0   # Safety buffer on material arrival
    
    # WIP Limits
    MAX_WIP_KG_PRE_DYEING: float = 1500.0
    MAX_WIP_KG_POST_DYEING: float = 2000.0
    
    # Factory Utility Limits (per hour)
    MAX_WATER_CAPACITY_M3_HR: float = 25.0
    MAX_STEAM_CAPACITY_KG_HR: float = 4000.0
    MAX_ELECTRICITY_KW: float = 650.0
    MAX_EFFLUENT_M3_HR: float = 22.0
    
    # Standard Unit Cost Rates (in INR/Units)
    COST_MACHINE_OPERATING_HR: float = 1200.0
    COST_LABOUR_REGULAR_HR: float = 250.0
    COST_LABOUR_OVERTIME_HR: float = 450.0
    COST_WATER_PER_M3: float = 45.0
    COST_STEAM_PER_KG: float = 3.5
    COST_POWER_PER_KWH: float = 9.0
    COST_CHANGEOVER_WATER_PENALTY: float = 500.0
    COST_LATE_DELIVERY_PENALTY_PER_HR: float = 2000.0

settings = Settings()
