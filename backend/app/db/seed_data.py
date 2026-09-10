from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.factory_models import (
    Machine, MachineMaintenance, MachineReliability, Material, MaterialPurchase,
    Colour, ChangeoverMatrixItem, Employee, EmployeeSkill, FactoryUtility,
    MachineStatus, MachineType, MaterialType, ShadeDepth
)
from app.models.order_models import (
    Customer, Order, OrderBatch, OrderReadinessChecklist, OrderPriority, OrderStatus, ReadinessStatus
)
from app.core.changeover import calculate_changeover_penalty

def seed_factory_data(db: Session):
    """Populates complete realistic textile colouring dataset."""
    if db.query(Machine).first():
        return # Already seeded

    now = datetime.utcnow()

    # 1. Factory Utilities
    utilities = [
        FactoryUtility(name="Process Water Supply", capacity_per_hour=25.0, current_load_per_hour=14.5, unit="m3/hr"),
        FactoryUtility(name="High Pressure Steam Boiler", capacity_per_hour=4000.0, current_load_per_hour=2400.0, unit="kg/hr"),
        FactoryUtility(name="Electric Substation Power", capacity_per_hour=650.0, current_load_per_hour=380.0, unit="kW"),
        FactoryUtility(name="Effluent Treatment Plant (ETP)", capacity_per_hour=22.0, current_load_per_hour=12.8, unit="m3/hr"),
    ]
    db.add_all(utilities)

    # 2. Production Machines
    machines = [
        Machine(
            code="JET-M1", name="Jet Dyeing Machine M1", machine_type=MachineType.JET_DYEING.value,
            capacity_kg=500.0, min_batch_kg=80.0, max_batch_kg=500.0, processing_speed=1.0, efficiency=0.92,
            status=MachineStatus.AVAILABLE.value, power_kw=45.0, water_m3_hr=3.5, steam_kg_hr=600.0,
            compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend,Rayon Viscose", compatible_colours="ALL"
        ),
        Machine(
            code="JET-M2", name="Jet Dyeing Machine M2 (High Capacity)", machine_type=MachineType.JET_DYEING.value,
            capacity_kg=800.0, min_batch_kg=150.0, max_batch_kg=800.0, processing_speed=1.1, efficiency=0.94,
            status=MachineStatus.AVAILABLE.value, power_kw=65.0, water_m3_hr=5.2, steam_kg_hr=900.0,
            compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend", compatible_colours="ALL"
        ),
        Machine(
            code="SOFT-M3", name="Soft Flow Vessel M3 (Delicate)", machine_type=MachineType.SOFT_FLOW.value,
            capacity_kg=400.0, min_batch_kg=50.0, max_batch_kg=400.0, processing_speed=0.95, efficiency=0.90,
            status=MachineStatus.AVAILABLE.value, power_kw=35.0, water_m3_hr=2.8, steam_kg_hr=500.0,
            compatible_cloth_types="Cotton,Organic Cotton,Rayon Viscose,Modal", compatible_colours="ALL"
        ),
        Machine(
            code="SOFT-M4", name="Soft Flow Vessel M4", machine_type=MachineType.SOFT_FLOW.value,
            capacity_kg=600.0, min_batch_kg=100.0, max_batch_kg=600.0, processing_speed=1.0, efficiency=0.91,
            status=MachineStatus.AVAILABLE.value, power_kw=48.0, water_m3_hr=4.0, steam_kg_hr=700.0,
            compatible_cloth_types="Cotton,Poly-Cotton Blend,Rayon Viscose", compatible_colours="ALL"
        ),
        Machine(
            code="JIG-M5", name="Jigger Dyeing Machine J5", machine_type=MachineType.JIGGER.value,
            capacity_kg=1000.0, min_batch_kg=250.0, max_batch_kg=1000.0, processing_speed=0.85, efficiency=0.88,
            status=MachineStatus.AVAILABLE.value, power_kw=55.0, water_m3_hr=4.5, steam_kg_hr=750.0,
            compatible_cloth_types="Cotton,Woven Twill,Denim,Linen Blend", compatible_colours="ALL"
        ),
        Machine(
            code="STENT-M6", name="Stenter Finishing Line S6", machine_type=MachineType.STENTER_FINISHING.value,
            capacity_kg=1500.0, min_batch_kg=100.0, max_batch_kg=1500.0, processing_speed=1.3, efficiency=0.95,
            status=MachineStatus.AVAILABLE.value, power_kw=90.0, water_m3_hr=1.5, steam_kg_hr=1200.0,
            compatible_cloth_types="Cotton,Polyester,Poly-Cotton Blend,Rayon Viscose,Organic Cotton", compatible_colours="ALL"
        ),
    ]
    db.add_all(machines)
    db.flush()

    # 3. Machine Reliability (MTBF, MTTR, reliability %)
    reliabilities = [
        MachineReliability(machine_id=machines[0].id, mtbf_hours=210.0, mttr_hours=3.5, breakdown_count=1, reliability_pct=97.0),
        MachineReliability(machine_id=machines[1].id, mtbf_hours=180.0, mttr_hours=5.0, breakdown_count=3, reliability_pct=96.2), # The heavy drum
        MachineReliability(machine_id=machines[2].id, mtbf_hours=240.0, mttr_hours=3.0, breakdown_count=1, reliability_pct=98.0),
        MachineReliability(machine_id=machines[3].id, mtbf_hours=195.0, mttr_hours=4.2, breakdown_count=2, reliability_pct=96.5),
        MachineReliability(machine_id=machines[4].id, mtbf_hours=160.0, mttr_hours=6.0, breakdown_count=4, reliability_pct=94.0),
        MachineReliability(machine_id=machines[5].id, mtbf_hours=280.0, mttr_hours=4.0, breakdown_count=1, reliability_pct=98.5),
    ]
    db.add_all(reliabilities)

    # 4. Planned Preventive Maintenance
    maintenances = [
        MachineMaintenance(
            machine_id=machines[0].id, title="Quarterly Pump & Nozzle Inspection",
            start_time=now + timedelta(days=6, hours=8), end_time=now + timedelta(days=6, hours=12),
            maintenance_type="PREVENTIVE", status="SCHEDULED", notes="Replace mechanical seals"
        ),
        MachineMaintenance(
            machine_id=machines[4].id, title="Drive Motor Overhaul",
            start_time=now + timedelta(days=12, hours=6), end_time=now + timedelta(days=12, hours=14),
            maintenance_type="PREVENTIVE", status="SCHEDULED", notes="Lubrication and roller alignment"
        )
    ]
    db.add_all(maintenances)

    # 5. Employees & Skills
    employees = [
        Employee(code="EMP-101", name="Rajesh Kumar", role="MASTER_DYER", shift="SHIFT_A", available_hours=8.0, current_workload_hours=4.0),
        Employee(code="EMP-102", name="Anand Verma", role="OPERATOR", shift="SHIFT_A", available_hours=8.0, current_workload_hours=3.5),
        Employee(code="EMP-103", name="Suresh Patil", role="MASTER_DYER", shift="SHIFT_B", available_hours=8.0, current_workload_hours=2.0),
        Employee(code="EMP-104", name="Vikram Singh", role="OPERATOR", shift="SHIFT_B", available_hours=8.0, current_workload_hours=5.0),
        Employee(code="EMP-105", name="Prakash Nair", role="FINISHING_SPECIALIST", shift="SHIFT_A", available_hours=8.0, current_workload_hours=1.0),
    ]
    db.add_all(employees)
    db.flush()

    for emp in employees:
        for m in machines[:4]:
            db.add(EmployeeSkill(employee_id=emp.id, machine_id=m.id, skill_level=4, certified=True))

    # 6. Raw Materials (Fabrics, Dyes, Chemicals)
    materials = [
        # Fabrics
        Material(code="MAT-COT-100", name="Cotton 100% Greige Knit", material_type=MaterialType.FABRIC.value, current_stock=8500.0, reserved_stock=2400.0, min_stock_level=1500.0, reorder_level=3000.0, unit="kg", supplier="Lakshmi Mills", lead_time_days=3.0, cost_per_unit=220.0),
        Material(code="MAT-POLY-75", name="Polyester Interlock Fabric", material_type=MaterialType.FABRIC.value, current_stock=6200.0, reserved_stock=1800.0, min_stock_level=1200.0, reorder_level=2500.0, unit="kg", supplier="Reliance Texturised", lead_time_days=4.0, cost_per_unit=165.0),
        Material(code="MAT-PC-BLEND", name="Poly-Cotton 65/35 Blend", material_type=MaterialType.FABRIC.value, current_stock=5400.0, reserved_stock=1200.0, min_stock_level=1000.0, reorder_level=2000.0, unit="kg", supplier="Vardhman Textiles", lead_time_days=3.0, cost_per_unit=190.0),
        Material(code="MAT-RAYON", name="Rayon Viscose Fabric", material_type=MaterialType.FABRIC.value, current_stock=3800.0, reserved_stock=600.0, min_stock_level=800.0, reorder_level=1500.0, unit="kg", supplier="Grasim Industries", lead_time_days=5.0, cost_per_unit=210.0),
        Material(code="MAT-ORG-COT", name="Organic Cotton GOTS Certified", material_type=MaterialType.FABRIC.value, current_stock=1800.0, reserved_stock=1600.0, min_stock_level=600.0, reorder_level=1200.0, unit="kg", supplier="Arvind Organics", lead_time_days=6.0, cost_per_unit=290.0), # TIGHT STOCK

        # Dyes
        Material(code="DYE-REC-BLU21", name="Reactive Blue 21 (Royal Blue)", material_type=MaterialType.DYE.value, current_stock=320.0, reserved_stock=95.0, min_stock_level=60.0, reorder_level=120.0, unit="kg", supplier="Archroma Chemicals", lead_time_days=2.0, cost_per_unit=550.0),
        Material(code="DYE-REC-RED8B", name="Reactive Red M8B", material_type=MaterialType.DYE.value, current_stock=240.0, reserved_stock=80.0, min_stock_level=50.0, reorder_level=100.0, unit="kg", supplier="Huntsman Dyes", lead_time_days=3.0, cost_per_unit=620.0),
        Material(code="DYE-REC-BLK-B", name="Reactive Black B", material_type=MaterialType.DYE.value, current_stock=480.0, reserved_stock=150.0, min_stock_level=100.0, reorder_level=200.0, unit="kg", supplier="Dystar India", lead_time_days=2.0, cost_per_unit=420.0),
        Material(code="DYE-DIS-NAVY", name="Disperse Navy Blue EX-SF", material_type=MaterialType.DYE.value, current_stock=45.0, reserved_stock=40.0, min_stock_level=30.0, reorder_level=60.0, unit="kg", supplier="Colourtex Industries", lead_time_days=4.0, cost_per_unit=490.0), # SHORTAGE WARNING!
        Material(code="DYE-DIS-YEL4G", name="Disperse Yellow 4G", material_type=MaterialType.DYE.value, current_stock=180.0, reserved_stock=45.0, min_stock_level=40.0, reorder_level=80.0, unit="kg", supplier="Colourtex Industries", lead_time_days=3.0, cost_per_unit=460.0),

        # Auxiliary Chemicals
        Material(code="CHEM-CAUSTIC", name="Caustic Soda Lye (48%)", material_type=MaterialType.CHEMICAL.value, current_stock=2500.0, reserved_stock=600.0, min_stock_level=800.0, reorder_level=1500.0, unit="kg", supplier="GACL", lead_time_days=2.0, cost_per_unit=45.0),
        Material(code="CHEM-HYDRO", name="Sodium Hydrosulphite", material_type=MaterialType.CHEMICAL.value, current_stock=1200.0, reserved_stock=300.0, min_stock_level=400.0, reorder_level=800.0, unit="kg", supplier="Transpek Silox", lead_time_days=2.0, cost_per_unit=85.0),
        Material(code="CHEM-ACETIC", name="Glacial Acetic Acid", material_type=MaterialType.CHEMICAL.value, current_stock=950.0, reserved_stock=200.0, min_stock_level=300.0, reorder_level=600.0, unit="kg", supplier="GNFC", lead_time_days=2.0, cost_per_unit=65.0),
    ]
    db.add_all(materials)
    db.flush()

    # Material Purchases & Supplier Confidence
    purchases = [
        MaterialPurchase(
            material_id=materials[8].id, # Disperse Navy
            po_number="PO-2026-889", ordered_qty=200.0, order_date=now - timedelta(days=2),
            expected_arrival=now + timedelta(days=2), supplier_confidence_pct=78.0, status="SHIPPED"
        ),
        MaterialPurchase(
            material_id=materials[4].id, # Organic Cotton
            po_number="PO-2026-892", ordered_qty=3000.0, order_date=now - timedelta(days=1),
            expected_arrival=now + timedelta(days=4), supplier_confidence_pct=85.0, status="ORDERED"
        )
    ]
    db.add_all(purchases)

    # 7. Colours
    colours = [
        Colour(code="WHITE", name="Bleached Optical White", hex_code="#FFFFFF", shade_depth=ShadeDepth.LIGHT.value, cleaning_base_time_min=10.0),
        Colour(code="PASTEL_PINK", name="Pastel Rose Pink", hex_code="#FFB6C1", shade_depth=ShadeDepth.LIGHT.value, cleaning_base_time_min=15.0),
        Colour(code="SKY_BLUE", name="Sky Aqua Blue", hex_code="#87CEEB", shade_depth=ShadeDepth.LIGHT.value, cleaning_base_time_min=20.0),
        Colour(code="GOLDEN_YELLOW", name="Golden Sun Yellow", hex_code="#FFD700", shade_depth=ShadeDepth.MEDIUM.value, cleaning_base_time_min=25.0),
        Colour(code="ROYAL_BLUE", name="Vibrant Royal Blue", hex_code="#4169E1", shade_depth=ShadeDepth.MEDIUM.value, cleaning_base_time_min=30.0),
        Colour(code="SCARLET_RED", name="Scarlet Crimson Red", hex_code="#FF2400", shade_depth=ShadeDepth.MEDIUM.value, cleaning_base_time_min=35.0),
        Colour(code="EMERALD_GREEN", name="Emerald Olive Green", hex_code="#2E8B57", shade_depth=ShadeDepth.MEDIUM.value, cleaning_base_time_min=35.0),
        Colour(code="DEEP_NAVY", name="Deep Midnight Navy", hex_code="#000080", shade_depth=ShadeDepth.DARK.value, cleaning_base_time_min=50.0),
        Colour(code="JET_BLACK", name="Intense Jet Black", hex_code="#111111", shade_depth=ShadeDepth.DARK.value, cleaning_base_time_min=60.0),
    ]
    db.add_all(colours)
    db.flush()

    # 8. Customers
    customers = [
        Customer(code="CUST-ZARA", name="Zara International", priority_tier="TIER_1", importance_weight=1.5, contact_email="orders@inditex.com"),
        Customer(code="CUST-HM", name="H&M Global Sourcing", priority_tier="TIER_1", importance_weight=1.4, contact_email="supply@hm.com"),
        Customer(code="CUST-RAYMOND", name="Raymond Textiles Ltd", priority_tier="TIER_2", importance_weight=1.2, contact_email="orders@raymond.in"),
        Customer(code="CUST-ARVIND", name="Arvind Lifestyle Brands", priority_tier="TIER_2", importance_weight=1.1, contact_email="procurement@arvind.com"),
        Customer(code="CUST-DOMESTIC", name="Apex Domestic Garments", priority_tier="TIER_3", importance_weight=1.0, contact_email="apexgarments@gmail.com"),
    ]
    db.add_all(customers)
    db.flush()

    # 9. Clean, Focused Customer Orders (7 Orders matching 2-10 data requirement)
    # Designed specifically to clearly demonstrate the Freeze Policy:
    # - Today (0-24h, <=7d deadline): Locked
    # - Tomorrow (24-48h, <=7d deadline): Mostly Locked
    # - Flexible Horizon (>7d deadline): NO LOCK for products with > 1 week deadline
    orders_data = [
        # Today: Urgent Orders (Due in 1-2 days) -> Locked (Today)
        ("ORD-101", 0, "Polyester Interlock Fabric", 350.0, "Deep Midnight Navy", "DEEP_NAVY", 1, "EMERGENCY", "EXPORT_GRADE_A"),
        ("ORD-102", 1, "Cotton 100% Greige Knit", 400.0, "Vibrant Royal Blue", "ROYAL_BLUE", 2, "HIGH", "EXPORT_GRADE_A"),
        
        # Tomorrow: Near-term Orders (Due in 3-4 days) -> Mostly Locked (Tomorrow)
        ("ORD-103", 2, "Poly-Cotton 65/35 Blend", 300.0, "Scarlet Crimson Red", "SCARLET_RED", 3, "HIGH", "EXPORT_GRADE_A"),
        ("ORD-104", 3, "Rayon Viscose Fabric", 380.0, "Sky Aqua Blue", "SKY_BLUE", 4, "MEDIUM", "COMMERCIAL"),
        
        # Flexible Horizon: Due in > 1 week (> 7 days deadline) -> NO LOCK
        ("ORD-105", 0, "Cotton 100% Greige Knit", 450.0, "Bleached Optical White", "WHITE", 10, "HIGH", "EXPORT_GRADE_A"),
        ("ORD-106", 1, "Organic Cotton GOTS Certified", 400.0, "Pastel Rose Pink", "PASTEL_PINK", 14, "MEDIUM", "EXPORT_GRADE_A"),
        ("ORD-107", 4, "Cotton 100% Greige Knit", 500.0, "Intense Jet Black", "JET_BLACK", 21, "LOW", "UTILITY"),
    ]

    orders = []
    for ord_num, cust_idx, cloth, qty, col_name, col_code, days_due, prio, quality in orders_data:
        order = Order(
            order_number=ord_num,
            customer_id=customers[cust_idx].id,
            order_date=now - timedelta(days=2),
            due_date=now + timedelta(days=days_due),
            cloth_type=cloth,
            quantity_kg=qty,
            colour_name=col_name,
            colour_code=col_code,
            required_quality=quality,
            required_finishing="Heat Set Soft Finish",
            priority=prio,
            readiness_status=ReadinessStatus.READY.value if prio in ["EMERGENCY", "HIGH"] else (
                ReadinessStatus.NOT_READY.value if "Navy" in col_name and prio == "MEDIUM" else ReadinessStatus.READY.value
            ),
            status=OrderStatus.PENDING.value
        )
        orders.append(order)

    db.add_all(orders)
    db.commit()
    print("Database successfully seeded with realistic textile factory data.")
