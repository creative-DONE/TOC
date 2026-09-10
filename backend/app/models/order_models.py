import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from app.db.database import Base

class OrderPriority(str, enum.Enum):
    EMERGENCY = "EMERGENCY"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    DELAYED = "DELAYED"
    CANCELLED = "CANCELLED"

class ReadinessStatus(str, enum.Enum):
    NOT_READY = "NOT_READY"           # 🔴
    PARTIALLY_READY = "PARTIALLY_READY" # 🟠
    READY = "READY"                   # 🟢
    IN_PRODUCTION = "IN_PRODUCTION"   # 🔵
    COMPLETED = "COMPLETED"           # ✅

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    priority_tier = Column(String(20), default="TIER_1") # TIER_1 (VIP), TIER_2, TIER_3
    importance_weight = Column(Float, default=1.0)        # 1.0 to 2.0 multiplier
    contact_email = Column(String(100), nullable=True)
    phone = Column(String(50), nullable=True)

    orders = relationship("Order", back_populates="customer")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(50), unique=True, index=True, nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    order_date = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime, nullable=False)
    cloth_type = Column(String(50), nullable=False)        # Cotton, Polyester, Blended, Rayon
    quantity_kg = Column(Float, nullable=False)
    colour_name = Column(String(100), nullable=False)
    colour_code = Column(String(50), nullable=False)
    dye_requirements = Column(Text, nullable=True)
    required_quality = Column(String(50), default="EXPORT_GRADE_A") # EXPORT_GRADE_A, COMMERCIAL, UTILITY
    required_finishing = Column(String(100), default="Soft Stenter Finish")
    priority = Column(String(20), default=OrderPriority.MEDIUM.value)
    delivery_location = Column(String(100), default="Central Dispatch Port")
    urgency_score = Column(Float, default=50.0)             # 0 to 100
    readiness_status = Column(String(30), default=ReadinessStatus.NOT_READY.value)
    status = Column(String(30), default=OrderStatus.PENDING.value)
    
    # Scheduling assignment
    assigned_machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    assigned_operator_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    planned_start = Column(DateTime, nullable=True)
    planned_completion = Column(DateTime, nullable=True)
    delivery_date = Column(DateTime, nullable=True)
    
    # 7-Day Planning Rule enforcement
    seven_day_rule_violated = Column(Boolean, default=False)
    seven_day_rule_diagnostic = Column(Text, nullable=True)
    
    # Buffers & Stability
    drum_buffer_hours = Column(Float, default=4.0)
    shipping_buffer_hours = Column(Float, default=12.0)
    buffer_penetration_pct = Column(Float, default=0.0) # 0 to 100%
    freeze_level = Column(String(20), default="FLEXIBLE") # LOCKED, MOSTLY_LOCKED, LIMITED, MODERATE, FLEXIBLE
    
    # Explainability & Notes
    scheduling_reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    customer = relationship("Customer", back_populates="orders")
    assigned_machine = relationship("Machine", foreign_keys=[assigned_machine_id])
    assigned_operator = relationship("Employee", foreign_keys=[assigned_operator_id])
    batches = relationship("OrderBatch", back_populates="order", cascade="all, delete-orphan")
    readiness_checklist = relationship("OrderReadinessChecklist", back_populates="order", uselist=False, cascade="all, delete-orphan")
    process_stages = relationship("OrderProcessStage", back_populates="order", cascade="all, delete-orphan")
    schedules = relationship("ProductionSchedule", back_populates="order", cascade="all, delete-orphan")

class OrderBatch(Base):
    __tablename__ = "order_batches"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    batch_number = Column(Integer, nullable=False, default=1)
    total_batches = Column(Integer, nullable=False, default=1)
    batch_quantity_kg = Column(Float, nullable=False)
    assigned_machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    status = Column(String(30), default=OrderStatus.PENDING.value)
    planned_start = Column(DateTime, nullable=True)
    planned_completion = Column(DateTime, nullable=True)

    order = relationship("Order", back_populates="batches")
    assigned_machine = relationship("Machine")

class OrderReadinessChecklist(Base):
    __tablename__ = "order_readiness_checklists"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), unique=True, nullable=False)
    fabric_available = Column(Boolean, default=False)
    dye_available = Column(Boolean, default=False)
    operator_available = Column(Boolean, default=False)
    machine_available = Column(Boolean, default=False)
    lab_dip_approved = Column(Boolean, default=False)
    missing_items_summary = Column(Text, nullable=True)
    expected_ready_date = Column(DateTime, nullable=True)

    order = relationship("Order", back_populates="readiness_checklist")

class OrderProcessStage(Base):
    __tablename__ = "order_process_stages"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    stage_name = Column(String(50), nullable=False) # FABRIC_INSPECTION, PRE_TREATMENT, DYE_PREP, DYEING, WASHING, DRYING, FINISHING, QUALITY_INSPECTION, REWORK, PACKING_DISPATCH
    sequence_order = Column(Integer, nullable=False)
    duration_minutes = Column(Float, default=60.0)
    status = Column(String(30), default="PENDING")   # PENDING, IN_PROGRESS, COMPLETED, BLOCKED
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    assigned_resource = Column(String(100), nullable=True)

    order = relationship("Order", back_populates="process_stages")
