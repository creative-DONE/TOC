import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from app.db.database import Base

class ScheduleTier(str, enum.Enum):
    MONTHLY_PLAN = "MONTHLY_PLAN"       # Level 1 (1-3 months)
    WEEKLY_SCHEDULE = "WEEKLY_SCHEDULE" # Level 2 (2-4 weeks)
    DAILY_DISPATCH = "DAILY_DISPATCH"   # Level 3 (Today & Tomorrow)

class AlertSeverity(str, enum.Enum):
    CRITICAL = "CRITICAL" # 🔴
    WARNING = "WARNING"   # 🟠
    INFO = "INFO"         # 🟢

class ProductionSchedule(Base):
    __tablename__ = "production_schedules"

    id = Column(Integer, primary_key=True, index=True)
    schedule_tier = Column(String(30), default=ScheduleTier.WEEKLY_SCHEDULE.value)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("order_batches.id"), nullable=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    operator_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    planned_start = Column(DateTime, nullable=False)
    planned_end = Column(DateTime, nullable=False)
    actual_start = Column(DateTime, nullable=True)
    actual_end = Column(DateTime, nullable=True)

    # Time breakdown (minutes)
    base_processing_min = Column(Float, default=120.0)
    setup_min = Column(Float, default=15.0)
    changeover_min = Column(Float, default=20.0)
    cleaning_min = Column(Float, default=15.0)
    loading_min = Column(Float, default=15.0)
    unloading_min = Column(Float, default=15.0)
    inspection_min = Column(Float, default=15.0)
    drum_buffer_min = Column(Float, default=60.0)
    shipping_buffer_min = Column(Float, default=180.0)

    # Freeze & Control
    is_locked = Column(Boolean, default=False)
    freeze_level = Column(String(20), default="FLEXIBLE")
    sequence_order = Column(Integer, default=1)
    status = Column(String(30), default="SCHEDULED") # SCHEDULED, IN_PROGRESS, COMPLETED, INTERRUPTED, CANCELLED

    # Environmental & Cost metrics
    water_consumption_m3 = Column(Float, default=5.0)
    steam_consumption_kg = Column(Float, default=800.0)
    electricity_kwh = Column(Float, default=60.0)
    operating_cost_inr = Column(Float, default=3500.0)

    # Explainability
    scheduling_reason = Column(Text, nullable=True)

    # Relationships
    order = relationship("Order", back_populates="schedules")
    batch = relationship("OrderBatch")
    machine = relationship("Machine", back_populates="schedules")
    operator = relationship("Employee", back_populates="schedules")

class DisruptionEvent(Base):
    __tablename__ = "disruption_events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False) # MACHINE_BREAKDOWN, MATERIAL_DELAY, WORKER_ABSENCE, QUALITY_FAILURE, RUSH_ORDER, PROCESSING_DELAY
    reference_id = Column(Integer, nullable=True)   # machine_id, material_id, employee_id, etc.
    start_time = Column(DateTime, default=datetime.utcnow)
    duration_hours = Column(Float, default=4.0)
    description = Column(String(255), nullable=False)
    affected_orders_count = Column(Integer, default=0)
    impact_summary = Column(Text, nullable=True)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class WhatIfScenario(Base):
    __tablename__ = "what_if_scenarios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    scenario_type = Column(String(50), nullable=False) # BREAKDOWN, MATERIAL_DELAY, ADD_SHIFT, ADD_OPERATOR, RUSH_ORDER, TIME_INFLATION
    parameters_json = Column(Text, nullable=False)      # JSON string of input parameters
    baseline_kpis_json = Column(Text, nullable=False)   # Baseline state KPIs
    simulated_kpis_json = Column(Text, nullable=False)  # Scenario outcome KPIs
    cost_difference_inr = Column(Float, default=0.0)
    on_time_delivery_diff_pct = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    severity = Column(String(20), default=AlertSeverity.WARNING.value)
    alert_type = Column(String(50), nullable=False) # SEVEN_DAY_RULE, BOTTLENECK_OVERLOAD, MATERIAL_SHORTAGE, BUFFER_PENETRATION, MACHINE_BREAKDOWN, WORKER_SHORTAGE
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    related_order_id = Column(Integer, nullable=True)
    related_machine_id = Column(Integer, nullable=True)
    action_recommendation = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class ScheduleQualityScoreLog(Base):
    __tablename__ = "schedule_quality_score_logs"

    id = Column(Integer, primary_key=True, index=True)
    calculated_at = Column(DateTime, default=datetime.utcnow)
    overall_score = Column(Float, nullable=False) # 0 to 100
    on_time_delivery_score = Column(Float, default=0.0)
    bottleneck_utilization_score = Column(Float, default=0.0)
    machine_utilization_score = Column(Float, default=0.0)
    changeover_efficiency_score = Column(Float, default=0.0)
    material_feasibility_score = Column(Float, default=0.0)
    manpower_feasibility_score = Column(Float, default=0.0)
    buffer_safety_score = Column(Float, default=0.0)
    stability_score = Column(Float, default=100.0)
    explanation_text = Column(Text, nullable=True)
