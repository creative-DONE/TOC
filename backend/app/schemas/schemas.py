from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

# Order Schemas
class OrderBase(BaseModel):
    order_number: str
    customer_name: str
    cloth_type: str
    quantity_kg: float
    colour_name: str
    colour_code: str
    due_date: datetime
    priority: str = "MEDIUM" # EMERGENCY, HIGH, MEDIUM, LOW
    required_quality: str = "EXPORT_GRADE_A"
    required_finishing: str = "Soft Stenter Finish"
    delivery_location: str = "Central Dispatch Port"

class OrderCreate(OrderBase):
    customer_id: Optional[int] = None
    dye_requirements: Optional[str] = None
    notes: Optional[str] = None

class OrderUpdate(BaseModel):
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    quantity_kg: Optional[float] = None
    cloth_type: Optional[str] = None
    colour_name: Optional[str] = None
    colour_code: Optional[str] = None
    assigned_machine_id: Optional[int] = None
    assigned_operator_id: Optional[int] = None
    planned_start: Optional[datetime] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class OrderResponse(BaseModel):
    id: int
    order_number: str
    customer_name: str
    customer_priority_tier: Optional[str] = "TIER_1"
    cloth_type: str
    quantity_kg: float
    colour_name: str
    colour_code: str
    due_date: datetime
    order_date: datetime
    priority: str
    urgency_score: float
    readiness_status: str
    status: str
    assigned_machine_id: Optional[int] = None
    assigned_machine_name: Optional[str] = None
    assigned_operator_id: Optional[int] = None
    assigned_operator_name: Optional[str] = None
    planned_start: Optional[datetime] = None
    planned_completion: Optional[datetime] = None
    seven_day_rule_violated: bool
    seven_day_rule_diagnostic: Optional[str] = None
    drum_buffer_hours: float
    shipping_buffer_hours: float
    buffer_penetration_pct: float
    freeze_level: str
    scheduling_reason: Optional[str] = None
    batches_count: int = 1

    class Config:
        from_attributes = True

# Machine Schemas
class MachineCreate(BaseModel):
    code: Optional[str] = None
    name: str
    machine_type: str = "JET_DYEING"
    capacity_kg: float
    min_batch_kg: float = 50.0
    max_batch_kg: float
    processing_speed: float = 1.0
    efficiency: float = 0.92
    status: str = "AVAILABLE"
    power_kw: float = 45.0
    water_m3_hr: float = 3.5
    steam_kg_hr: float = 600.0
    compatible_cloth_types: Optional[str] = "Cotton,Polyester,Blended fabric,Rayon Viscose"
    compatible_colours: Optional[str] = "ALL"

class MachineUpdate(BaseModel):
    name: Optional[str] = None
    machine_type: Optional[str] = None
    capacity_kg: Optional[float] = None
    min_batch_kg: Optional[float] = None
    max_batch_kg: Optional[float] = None
    processing_speed: Optional[float] = None
    efficiency: Optional[float] = None
    status: Optional[str] = None
    power_kw: Optional[float] = None
    water_m3_hr: Optional[float] = None
    steam_kg_hr: Optional[float] = None
    compatible_cloth_types: Optional[str] = None
    compatible_colours: Optional[str] = None

class MachineMaintenanceScheduleRequest(BaseModel):
    hours: float
    title: Optional[str] = "Scheduled Preventive Maintenance"
    start_time: Optional[datetime] = None
    maintenance_type: Optional[str] = "PREVENTIVE" # PREVENTIVE, EMERGENCY, OVERHAUL
    notes: Optional[str] = None

class MachineResponse(BaseModel):
    id: int
    code: str
    name: str
    machine_type: str
    capacity_kg: float
    min_batch_kg: float
    max_batch_kg: float
    processing_speed: float
    efficiency: float
    status: str
    available_hours_day: float
    power_kw: float
    water_m3_hr: float
    steam_kg_hr: float
    compatible_cloth_types: Optional[str] = None
    compatible_colours: Optional[str] = None
    current_workload_kg: float
    utilization_pct: float = 0.0
    mtbf_hours: float = 200.0
    mttr_hours: float = 4.0
    reliability_pct: float = 96.0
    active_maintenance: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

# Material Schemas
class MaterialResponse(BaseModel):
    id: int
    code: str
    name: str
    material_type: str
    current_stock: float
    reserved_stock: float
    available_stock: float
    min_stock_level: float
    reorder_level: float
    unit: str
    supplier: str
    lead_time_days: float
    cost_per_unit: float
    is_shortage: bool = False
    expected_arrival: Optional[datetime] = None
    supplier_confidence_pct: Optional[float] = 80.0

    class Config:
        from_attributes = True

# Employee Schemas
class EmployeeResponse(BaseModel):
    id: int
    code: str
    name: str
    role: str
    shift: str
    available_hours: float
    overtime_available_hours: float
    current_workload_hours: float
    on_leave: bool
    certified_machine_ids: List[int] = []

    class Config:
        from_attributes = True

# Schedule Slot Response (Gantt representation)
class ScheduleSlotResponse(BaseModel):
    id: int
    schedule_tier: str
    order_id: int
    order_number: str
    customer_name: str
    cloth_type: str
    quantity_kg: float
    colour_name: str
    colour_code: str
    batch_number: int = 1
    total_batches: int = 1
    machine_id: int
    machine_name: str
    operator_id: Optional[int] = None
    operator_name: Optional[str] = None
    planned_start: datetime
    planned_end: datetime
    base_processing_min: float
    setup_min: float
    changeover_min: float
    cleaning_min: float
    drum_buffer_min: float
    shipping_buffer_min: float
    buffer_penetration_pct: float = 0.0
    status: str
    is_locked: bool
    freeze_level: str
    priority: str
    due_date: Optional[datetime] = None
    scheduling_reason: Optional[str] = None
    operating_cost_inr: float

    class Config:
        from_attributes = True

# TOC Bottleneck Response
class TOCBottleneckResponse(BaseModel):
    current_bottleneck_type: str     # MACHINE, UTILITY, MATERIAL, MANPOWER
    resource_id: Optional[int] = None
    resource_code: str
    resource_name: str
    workload_kg: float
    capacity_kg: float
    utilization_pct: float
    overload_hours: float
    buffer_status: str               # SAFE, WARNING, CRITICAL
    buffer_penetration_pct: float
    recommendation: str
    five_focusing_steps: Dict[str, str]
    migration_history: List[Dict[str, Any]] = []

# What-If Simulation Schemas
class WhatIfRequest(BaseModel):
    scenario_type: str # BREAKDOWN, MATERIAL_DELAY, ADD_SHIFT, ADD_OPERATOR, RUSH_ORDER, TIME_INFLATION
    target_machine_id: Optional[int] = None
    breakdown_hours: Optional[float] = 8.0
    material_id: Optional[int] = None
    delay_days: Optional[float] = 2.0
    rush_order: Optional[OrderCreate] = None
    time_inflation_pct: Optional[float] = 15.0

class WhatIfResponse(BaseModel):
    scenario_name: str
    baseline_on_time_pct: float
    simulated_on_time_pct: float
    baseline_bottleneck: str
    simulated_bottleneck: str
    delayed_orders_count: int
    delayed_orders: List[str]
    cost_difference_inr: float
    recommendation: str
    simulated_schedule: List[ScheduleSlotResponse]

# Disruption Event Schema
class DisruptionEventTrigger(BaseModel):
    event_type: str # MACHINE_BREAKDOWN, MATERIAL_DELAY, WORKER_ABSENCE, QUALITY_FAILURE, RUSH_ORDER
    reference_id: int
    duration_hours: float
    description: str

class DisruptionImpactResponse(BaseModel):
    event_id: int
    affected_orders: List[str]
    rescheduled_orders_count: int
    new_bottleneck: str
    immediate_alerts: List[str]
    repaired_schedule: List[ScheduleSlotResponse]

# Schedule Quality Score Response
class QualityScoreResponse(BaseModel):
    overall_score: float # 0 - 100
    grade: str           # EXCELLENT, GOOD, MODERATE, CRITICAL
    sub_scores: Dict[str, float]
    score_explanations: List[str]
    recommendations_to_reach_100: List[str]

# Schedule Slot Update & Reorganization Schema
class ScheduleSlotUpdateRequest(BaseModel):
    machine_id: Optional[int] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    quantity_kg: Optional[float] = None
    cloth_type: Optional[str] = None
    colour_name: Optional[str] = None
    colour_code: Optional[str] = None
    changeover_min: Optional[float] = None
    operator_id: Optional[int] = None
    status: Optional[str] = None
    shift: Optional[str] = None
    force_override: bool = False
    force_unlock_conflicts: bool = False

# Production Planning Matrix Edit Schema
class MatrixEditRequest(BaseModel):
    action: str # ASSIGN, MOVE, REMOVE, UPDATE_ROW, ADD_ORDER, DELETE_ORDER, TOGGLE_LOCK
    order_id: Optional[int] = None
    machine_id: Optional[int] = None
    target_machine_id: Optional[int] = None
    order_number: Optional[str] = None
    customer_name: Optional[str] = None
    cloth_type: Optional[str] = None
    quantity_kg: Optional[float] = None
    colour_name: Optional[str] = None
    colour_code: Optional[str] = None
    planned_day: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = "MEDIUM"
    force_override: bool = False
    force_unlock_conflicts: bool = False

# KPI Dashboard Overview
class DashboardOverviewResponse(BaseModel):
    total_orders: int
    completed_orders: int
    pending_orders: int
    orders_at_risk: int
    late_orders: int
    on_time_delivery_pct: float
    total_production_kg: float
    machine_utilization_pct: float
    bottleneck_utilization_pct: float
    avg_processing_time_hours: float
    total_changeover_hours_saved: float
    seven_day_rule_violations_count: int
    schedule_stability_score: float
    total_operating_cost_inr: float
    bottleneck_info: TOCBottleneckResponse
    active_alerts: List[Dict[str, Any]]

# Approx Time Calculator Schemas
class ApproxTimeCalculatorRequest(BaseModel):
    quantity_kg: float
    colour_code: str
    due_date: datetime
    cloth_type: Optional[str] = "Cotton"

class MachineEstimateDetail(BaseModel):
    machine_id: int
    machine_code: str
    machine_name: str
    machine_type: str
    is_suitable: bool
    unsuitability_reason: Optional[str] = None
    estimated_start: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    production_hours: Optional[float] = None
    changeover_min: Optional[float] = None
    is_on_time: bool
    delay_hours: float = 0.0
    slack_hours: Optional[float] = 0.0
    due_status: str
    is_bottleneck: bool
    current_workload_kg: float
    daily_capacity_kg: float
    allocated_days_count: Optional[int] = 1
    preceding_colour: Optional[str] = None
    explanation: str

class ApproxTimeCalculatorResponse(BaseModel):
    status: str
    recommended_machine: Optional[MachineEstimateDetail] = None
    order_quantity_kg: float
    colour_name: str
    colour_code: str
    colour_hex: Optional[str] = "#2563EB"
    due_date: datetime
    is_any_machine_on_time: bool
    earliest_completion: Optional[datetime] = None
    total_delay_hours: float = 0.0
    why_recommended: str
    due_date_risk_warning: Optional[str] = None
    risk_factors: List[str] = []
    alternative_machines: List[MachineEstimateDetail] = []

