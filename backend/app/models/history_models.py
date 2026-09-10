from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from app.db.database import Base

class HistoricalProduction(Base):
    __tablename__ = "historical_production"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(50), nullable=False)
    cloth_type = Column(String(50), nullable=False)
    colour_name = Column(String(100), nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    operator_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    quantity_kg = Column(Float, nullable=False)
    
    planned_duration_min = Column(Float, nullable=False)
    actual_duration_min = Column(Float, nullable=False)
    variance_min = Column(Float, default=0.0) # actual - planned
    
    changeover_time_min = Column(Float, default=20.0)
    actual_downtime_min = Column(Float, default=0.0)
    rework_flag = Column(Boolean, default=False)
    rework_reason = Column(String(255), nullable=True)
    quality_grade = Column(String(20), default="GRADE_A")
    
    water_consumed_m3 = Column(Float, default=4.5)
    steam_consumed_kg = Column(Float, default=750.0)
    power_kwh = Column(Float, default=55.0)
    
    completed_at = Column(DateTime, default=datetime.utcnow)

class ScheduleStabilityLog(Base):
    __tablename__ = "schedule_stability_logs"

    id = Column(Integer, primary_key=True, index=True)
    logged_at = Column(DateTime, default=datetime.utcnow)
    rescheduled_by = Column(String(50), default="ALGORITHM")
    day0_changes = Column(Integer, default=0) # Changes to locked jobs
    day1_changes = Column(Integer, default=0) # Changes to mostly locked jobs
    days2_3_changes = Column(Integer, default=0)
    total_modifications = Column(Integer, default=0)
    stability_score = Column(Float, default=100.0)
    notes = Column(Text, nullable=True)
