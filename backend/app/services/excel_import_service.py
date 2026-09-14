import io
import re
from datetime import datetime, timedelta, date
from typing import List, Dict, Any, Optional
from openpyxl import load_workbook
from sqlalchemy.orm import Session
from app.models.order_models import Order, Customer, OrderStatus, ReadinessStatus
from app.models.factory_models import Colour

COLOUR_NORMALIZATION = {
    "raw white": "WHITE",
    "normal white": "WHITE",
    "bleached optical white": "WHITE",
    "white": "WHITE",
    "optical white": "WHITE",
    "pastel pink": "PASTEL_PINK",
    "pink": "PASTEL_PINK",
    "sky blue": "SKY_BLUE",
    "blue": "ROYAL_BLUE",
    "royal blue": "ROYAL_BLUE",
    "golden yellow": "GOLDEN_YELLOW",
    "yellow": "GOLDEN_YELLOW",
    "scarlet red": "SCARLET_RED",
    "red": "SCARLET_RED",
    "emerald green": "EMERALD_GREEN",
    "green": "EMERALD_GREEN",
    "deep navy": "DEEP_NAVY",
    "navy": "DEEP_NAVY",
    "jet black": "JET_BLACK",
    "black": "JET_BLACK",
}

def parse_due_date_value(val: Any, reference_now: datetime) -> datetime:
    """
    Parses a Due Date value from an Excel cell.
    Supports:
    - datetime / date objects
    - 'Day X' or 'day X' string format (relative planning day)
    - ISO strings 'YYYY-MM-DD' or common date formats
    - integer/float relative days (e.g. 9 -> 9 days from reference_now)
    """
    if val is None:
        return reference_now + timedelta(days=7)

    if isinstance(val, datetime):
        return val
    if isinstance(val, date):
        return datetime.combine(val, datetime.min.time())

    val_str = str(val).strip()

    # Pattern: Day X (e.g. "Day 10", "Day 9", "day 5")
    day_match = re.search(r"day\s*(\d+)", val_str, re.IGNORECASE)
    if day_match:
        d = int(day_match.group(1))
        return reference_now + timedelta(days=d)

    # Pure number (e.g. 9 or 10 -> relative day)
    if val_str.isdigit():
        d = int(val_str)
        if 1 <= d <= 365:
            return reference_now + timedelta(days=d)

    # Standard date formats
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            continue

    # Default fallback
    return reference_now + timedelta(days=7)


def parse_excel_orders(file_content: bytes, reference_now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """
    Parses an Excel sheet with order columns:
    Job number | Product ID | Customer level | Quantity | Colour | Due Date | Delivery time
    """
    now = reference_now or datetime.utcnow()
    wb = load_workbook(io.BytesIO(file_content), data_only=True)
    sheet = wb.active

    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    # Identify header row
    header_row_idx = None
    header_map: Dict[str, int] = {}

    for r_idx, row in enumerate(rows[:5]):
        normalized_cols = [str(c).strip().lower() if c is not None else "" for c in row]
        if any("job" in c or "order" in c for c in normalized_cols):
            header_row_idx = r_idx
            for c_idx, col_name in enumerate(normalized_cols):
                if any(k in col_name for k in ["job", "order number", "order_number"]):
                    header_map["job_number"] = c_idx
                elif any(k in col_name for k in ["product id", "product", "cloth", "fabric"]):
                    header_map["product_id"] = c_idx
                elif any(k in col_name for k in ["customer level", "customer", "tier", "level"]):
                    header_map["customer_level"] = c_idx
                elif any(k in col_name for k in ["quantity", "qty", "weight"]):
                    header_map["quantity"] = c_idx
                elif any(k in col_name for k in ["colour", "color", "shade"]):
                    header_map["colour"] = c_idx
                elif any(k in col_name for k in ["due date", "due_date", "deadline", "due"]):
                    header_map["due_date"] = c_idx
                elif any(k in col_name for k in ["delivery time", "delivery_time", "delivery"]):
                    header_map["delivery_time"] = c_idx
            break

    if header_row_idx is None:
        # Fallback to standard column index order if header missing
        header_row_idx = 0
        header_map = {
            "job_number": 0,
            "product_id": 1,
            "customer_level": 2,
            "quantity": 3,
            "colour": 4,
            "due_date": 5,
            "delivery_time": 6
        }

    parsed_orders: List[Dict[str, Any]] = []

    for r_idx in range(header_row_idx + 1, len(rows)):
        row = rows[r_idx]
        if not row or all(c is None for c in row):
            continue

        job_val = row[header_map["job_number"]] if "job_number" in header_map and header_map["job_number"] < len(row) else None
        if job_val is None:
            continue

        job_str = str(job_val).strip()
        if not job_str or job_str.lower() in ["job number", "order number", "none"]:
            continue

        # Format job number: ORD-XXX if it's a pure number, otherwise preserve verbatim
        if job_str.isdigit():
            order_number = f"ORD-{int(job_str):03d}"
        else:
            order_number = job_str

        # Product / Cloth
        prod_val = row[header_map["product_id"]] if "product_id" in header_map and header_map["product_id"] < len(row) else None
        cloth_type = str(prod_val).strip() if prod_val else "Cotton 100% Greige Knit"

        # Customer level
        cust_lvl = str(row[header_map["customer_level"]]).strip().upper().replace(" ", "_") if "customer_level" in header_map and header_map["customer_level"] < len(row) and row[header_map["customer_level"]] is not None else "B"
        if cust_lvl in ["A", "TIER_1", "VIP", "1"]:
            priority_tier = "TIER_1"
            importance_weight = 1.5
            priority = "HIGH"
        elif cust_lvl in ["C", "TIER_3", "UTILITY", "3"]:
            priority_tier = "TIER_3"
            importance_weight = 1.0
            priority = "LOW"
        else:
            priority_tier = "TIER_2"
            importance_weight = 1.2
            priority = "MEDIUM"

        # Quantity
        qty_val = row[header_map["quantity"]] if "quantity" in header_map and header_map["quantity"] < len(row) else None
        try:
            quantity_kg = float(qty_val) if qty_val is not None else 400.0
        except (ValueError, TypeError):
            quantity_kg = 400.0

        if quantity_kg <= 0:
            quantity_kg = 400.0

        # Colour
        col_val = str(row[header_map["colour"]]).strip() if "colour" in header_map and header_map["colour"] < len(row) and row[header_map["colour"]] is not None else "Bleached Optical White"
        col_code = COLOUR_NORMALIZATION.get(col_val.lower(), "ROYAL_BLUE")
        colour_name = col_val

        # Due Date
        due_val = row[header_map["due_date"]] if "due_date" in header_map and header_map["due_date"] < len(row) else None
        due_date = parse_due_date_value(due_val, now)

        # Delivery time
        deliv_val = row[header_map["delivery_time"]] if "delivery_time" in header_map and header_map["delivery_time"] < len(row) else None
        try:
            delivery_hours = float(deliv_val) if deliv_val is not None else 8.0
        except (ValueError, TypeError):
            delivery_hours = 8.0

        parsed_orders.append({
            "order_number": order_number,
            "cloth_type": cloth_type,
            "customer_tier": priority_tier,
            "importance_weight": importance_weight,
            "quantity_kg": quantity_kg,
            "colour_name": colour_name,
            "colour_code": col_code,
            "due_date": due_date,
            "delivery_hours": delivery_hours,
            "priority": priority
        })

    return parsed_orders


def import_excel_orders_to_db(db: Session, file_content: bytes, reference_now: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Imports orders from Excel into DB, creates customers if necessary,
    and runs full factory schedule re-optimization.
    """
    from app.services.scheduler_service import optimize_factory_schedule

    now = reference_now or datetime.utcnow()
    parsed = parse_excel_orders(file_content, now)

    if not parsed:
        return {"success": False, "imported_count": 0, "message": "No valid order rows found in Excel sheet."}

    imported_orders = []
    updated_orders = []

    for item in parsed:
        # Check if customer exists or create one
        cust_name = f"Client-{item['customer_tier']}"
        customer = db.query(Customer).filter(Customer.priority_tier == item["customer_tier"]).first()
        if not customer:
            customer = Customer(
                code=f"CUST-{item['customer_tier']}",
                name=cust_name,
                priority_tier=item["customer_tier"],
                importance_weight=item["importance_weight"]
            )
            db.add(customer)
            db.flush()

        # Check if order already exists
        existing = db.query(Order).filter(Order.order_number == item["order_number"]).first()
        if existing:
            existing.quantity_kg = item["quantity_kg"]
            existing.due_date = item["due_date"]
            existing.cloth_type = item["cloth_type"]
            existing.colour_name = item["colour_name"]
            existing.colour_code = item["colour_code"]
            existing.priority = item["priority"]
            existing.status = "PENDING"
            updated_orders.append(existing.order_number)
        else:
            new_order = Order(
                order_number=item["order_number"],
                customer_id=customer.id,
                order_date=now,
                due_date=item["due_date"],
                cloth_type=item["cloth_type"],
                quantity_kg=item["quantity_kg"],
                colour_name=item["colour_name"],
                colour_code=item["colour_code"],
                priority=item["priority"],
                status=OrderStatus.PENDING.value,
                readiness_status=ReadinessStatus.READY.value
            )
            db.add(new_order)
            imported_orders.append(new_order.order_number)

    db.commit()

    # Automatically run central factory optimization
    optimize_factory_schedule(db, reference_now=now, force_reschedule_all=False, preserve_locked=True)

    return {
        "success": True,
        "imported_count": len(imported_orders),
        "updated_count": len(updated_orders),
        "total_processed": len(parsed),
        "orders": imported_orders + updated_orders,
        "message": f"Successfully processed {len(parsed)} orders ({len(imported_orders)} created, {len(updated_orders)} updated). Factory schedule re-optimized."
    }
