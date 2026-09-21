import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from app.db.database import Base

class MachineStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    RUNNING = "RUNNING"
    IDLE = "IDLE"
    MAINTENANCE = "MAINTENANCE"
    BREAKDOWN = "BREAKDOWN"
    RESERVED = "RESERVED"

class MachineType(str, enum.Enum):
    JET_DYEING = "JET_DYEING"
    SOFT_FLOW = "SOFT_FLOW"
    JIGGER = "JIGGER"
    WINCH = "WINCH"
    STENTER_FINISHING = "STENTER_FINISHING"
    DRYING_TUMBLER = "DRYING_TUMBLER"
    WASHING_LINE = "WASHING_LINE"
    INSPECTION_LINE = "INSPECTION_LINE"

class MaterialType(str, enum.Enum):
    FABRIC = "FABRIC"
    DYE = "DYE"
    CHEMICAL = "CHEMICAL"
    WATER = "WATER"
    CONSUMABLE = "CONSUMABLE"

class ShadeDepth(str, enum.Enum):
    LIGHT = "LIGHT"
    MEDIUM = "MEDIUM"
    DARK = "DARK"

class Machine(Base):
    __tablename__ = "machines"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    machine_type = Column(String(50), nullable=False, default=MachineType.JET_DYEING.value)
    capacity_kg = Column(Float, nullable=False)
    min_batch_kg = Column(Float, nullable=False, default=50.0)
    max_batch_kg = Column(Float, nullable=False)
    processing_speed = Column(Float, default=1.0) # Speed factor
    efficiency = Column(Float, default=0.92)       # Efficiency %
    status = Column(String(30), default=MachineStatus.AVAILABLE.value)
    available_hours_day = Column(Float, default=24.0)
    power_kw = Column(Float, default=45.0)
    water_m3_hr = Column(Float, default=3.5)
    steam_kg_hr = Column(Float, default=600.0)
    processing_time_hours = Column(Float, nullable=True, default=3.0) # Processing time (hours/batch)
    loading_time_hours = Column(Float, nullable=False, default=0.5)   # Loading time (hours/batch)
    unloading_time_hours = Column(Float, nullable=False, default=0.5) # Unloading time (hours/batch)
    cleaning_time_hours = Column(Float, nullable=False, default=1.0)  # Cleaning time (hours)
    working_hours_per_day = Column(Float, nullable=False, default=8.0) # Working hours (hours/day, default 8.0)
    compatible_cloth_types = Column(Text, default="Cotton,Polyester,Blended fabric,Rayon Viscose")
    compatible_colours = Column(Text, default="ALL")
    current_workload_kg = Column(Float, default=0.0)
    
    # Relationships
    maintenance_records = relationship("MachineMaintenance", back_populates="machine", cascade="all, delete-orphan")
    reliability = relationship("MachineReliability", back_populates="machine", uselist=False, cascade="all, delete-orphan")
    schedules = relationship("ProductionSchedule", back_populates="machine", cascade="all, delete-orphan")
    skills = relationship("EmployeeSkill", back_populates="machine", cascade="all, delete-orphan")

class MachineMaintenance(Base):
    __tablename__ = "machine_maintenance"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    title = Column(String(150), nullable=False)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    maintenance_type = Column(String(50), default="PREVENTIVE") # PREVENTIVE, EMERGENCY, OVERHAUL
    status = Column(String(30), default="SCHEDULED")             # SCHEDULED, IN_PROGRESS, COMPLETED
    notes = Column(Text, nullable=True)

    machine = relationship("Machine", back_populates="maintenance_records")

class MachineReliability(Base):
    __tablename__ = "machine_reliability"

    id = Column(Integer, primary_key=True, index=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), unique=True, nullable=False)
    mtbf_hours = Column(Float, default=200.0)       # Mean Time Between Failures
    mttr_hours = Column(Float, default=4.0)         # Mean Time To Repair
    breakdown_count = Column(Integer, default=2)
    avg_repair_hours = Column(Float, default=4.0)
    reliability_pct = Column(Float, default=95.0)   # Machine reliability percentage

    machine = relationship("Machine", back_populates="reliability")

class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    material_type = Column(String(30), default=MaterialType.DYE.value)
    current_stock = Column(Float, default=0.0)
    reserved_stock = Column(Float, default=0.0)
    min_stock_level = Column(Float, default=50.0)
    reorder_level = Column(Float, default=100.0)
    unit = Column(String(20), default="kg")
    supplier = Column(String(100), default="Standard Supplier")
    lead_time_days = Column(Float, default=3.0)
    cost_per_unit = Column(Float, default=150.0)

    purchases = relationship("MaterialPurchase", back_populates="material")

class MaterialPurchase(Base):
    __tablename__ = "material_purchases"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    po_number = Column(String(50), unique=True, nullable=False)
    ordered_qty = Column(Float, nullable=False)
    order_date = Column(DateTime, default=datetime.utcnow)
    expected_arrival = Column(DateTime, nullable=False)
    actual_arrival = Column(DateTime, nullable=True)
    supplier_confidence_pct = Column(Float, default=80.0) # Historical supplier reliability
    status = Column(String(30), default="ORDERED")        # ORDERED, SHIPPED, DELAYED, RECEIVED

    material = relationship("Material", back_populates="purchases")

class Colour(Base):
    __tablename__ = "colours"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    hex_code = Column(String(10), default="#000000")
    shade_depth = Column(String(20), default=ShadeDepth.MEDIUM.value)
    dye_recipe_json = Column(Text, default="{}") # e.g. {"Reactive Blue 21": 0.03, "Caustic Soda": 0.015}
    expected_prep_time_min = Column(Float, default=25.0)
    compatible_machines = Column(Text, default="ALL")
    cleaning_base_time_min = Column(Float, default=30.0)

class ChangeoverMatrixItem(Base):
    __tablename__ = "changeover_matrix"

    id = Column(Integer, primary_key=True, index=True)
    from_fabric = Column(String(50), default="Cotton")
    from_colour_code = Column(String(50), default="WHITE")
    to_fabric = Column(String(50), default="Cotton")
    to_colour_code = Column(String(50), default="BLUE")
    machine_type = Column(String(50), default="JET_DYEING")
    changeover_min = Column(Float, default=30.0)
    cleaning_min = Column(Float, default=20.0)
    water_litres = Column(Float, default=1500.0)
    chemical_cost = Column(Float, default=300.0)
    energy_kwh = Column(Float, default=25.0)

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    role = Column(String(50), default="OPERATOR") # MASTER_DYER, OPERATOR, LAB_TECHNICIAN, FINISHING_SPECIALIST
    shift = Column(String(20), default="SHIFT_A") # SHIFT_A (06:00-14:00), SHIFT_B (14:00-22:00), SHIFT_C (22:00-06:00)
    available_hours = Column(Float, default=8.0)
    overtime_available_hours = Column(Float, default=4.0)
    max_weekly_hours = Column(Float, default=48.0)
    current_workload_hours = Column(Float, default=0.0)
    on_leave = Column(Boolean, default=False)

    skills = relationship("EmployeeSkill", back_populates="employee")
    schedules = relationship("ProductionSchedule", back_populates="operator")

class EmployeeSkill(Base):
    __tablename__ = "employee_skills"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=False)
    skill_level = Column(Integer, default=3) # 1 (Junior) to 5 (Master)
    certified = Column(Boolean, default=True)

    employee = relationship("Employee", back_populates="skills")
    machine = relationship("Machine", back_populates="skills")

class FactoryUtility(Base):
    __tablename__ = "factory_utilities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False) # Water, Steam, Electricity, Effluent
    capacity_per_hour = Column(Float, nullable=False)
    current_load_per_hour = Column(Float, default=0.0)
    unit = Column(String(20), default="m3/hr")
