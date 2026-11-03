"""
Vessel Planning Data Module for Prime ERP / Prime AI - Vessel Planning
Matches exact vessels, orders, batches, KPIs, and effectiveness metrics.
"""
from datetime import datetime, timedelta
import random

VESSELS_DATA = [
    {"id": 1, "code": "B1", "min_cap": 0, "max_cap": 100, "fill_pct": 71},
    {"id": 2, "code": "B10", "min_cap": 0, "max_cap": 2500, "fill_pct": 80},
    {"id": 3, "code": "B11", "min_cap": 0, "max_cap": 1100, "fill_pct": 71},
    {"id": 4, "code": "B12", "min_cap": 0, "max_cap": 1100, "fill_pct": 68},
    {"id": 5, "code": "B13", "min_cap": 0, "max_cap": 650, "fill_pct": 73},
    {"id": 6, "code": "B2", "min_cap": 0, "max_cap": 200, "fill_pct": 80},
    {"id": 7, "code": "B3", "min_cap": 0, "max_cap": 300, "fill_pct": 73},
    {"id": 8, "code": "B4", "min_cap": 0, "max_cap": 500, "fill_pct": 73},
    {"id": 9, "code": "B5", "min_cap": 0, "max_cap": 700, "fill_pct": 80},
    {"id": 10, "code": "B6", "min_cap": 0, "max_cap": 1200, "fill_pct": 75},
    {"id": 11, "code": "B7", "min_cap": 0, "max_cap": 1400, "fill_pct": 71},
    {"id": 12, "code": "B8", "min_cap": 0, "max_cap": 1500, "fill_pct": 70},
    {"id": 13, "code": "B9", "min_cap": 0, "max_cap": 1800, "fill_pct": 75},
    {"id": 14, "code": "S1", "min_cap": 0, "max_cap": 25, "fill_pct": 75},
    {"id": 15, "code": "S2", "min_cap": 0, "max_cap": 25, "fill_pct": 71},
    {"id": 16, "code": "S3", "min_cap": 0, "max_cap": 25, "fill_pct": 71},
    {"id": 17, "code": "S5", "min_cap": 0, "max_cap": 50, "fill_pct": 71},
    {"id": 18, "code": "S6", "min_cap": 0, "max_cap": 30, "fill_pct": 75},
    {"id": 19, "code": "S7", "min_cap": 0, "max_cap": 50, "fill_pct": 50},
    {"id": 20, "code": "S8", "min_cap": 0, "max_cap": 50, "fill_pct": 70},
]

# Primary orders shown in screenshot
INITIAL_ORDERS = [
    {
        "id": 1, "order_no": "26APO823", "shade": "MARIA MAUVE PK50835 LIGHT",
        "order_qty": 10.0, "stock_qty": 10.0, "mins_per_batch": 60, "due_date": "20/10/2026",
        "priority": 2, "wash_mins": 10, "already_fixed_kg": 0.0, "to_dye_kg": 10.0,
        "batches_count": 1, "completes": "28-Oct 23:50"
    },
    {
        "id": 2, "order_no": "26INH27146", "shade": "GREIGE WHITE",
        "order_qty": 165.0, "stock_qty": 125.0, "mins_per_batch": 30, "due_date": "01/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 125.0,
        "batches_count": 1, "completes": "28-Oct 00:30"
    },
    {
        "id": 3, "order_no": "26INH27328", "shade": "NAVY EXTRA DARK",
        "order_qty": 56.22, "stock_qty": 95.6, "mins_per_batch": 180, "due_date": "01/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 56.22,
        "batches_count": 1, "completes": "28-Oct 03:00"
    },
    {
        "id": 4, "order_no": "26INH27364", "shade": "WHITE WHITE",
        "order_qty": 789.19, "stock_qty": 137.8, "mins_per_batch": 30, "due_date": "20/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 137.8,
        "batches_count": 1, "completes": "28-Oct 17:40"
    },
    {
        "id": 5, "order_no": "26INH27689", "shade": "GREIGE EXTRA DARK - D/DYEING",
        "order_qty": 2667.8, "stock_qty": 181.3, "mins_per_batch": 180, "due_date": "20/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 181.3,
        "batches_count": 1, "completes": "28-Oct 19:50"
    },
    {
        "id": 6, "order_no": "26INH27860", "shade": "GREIGE EXTRA DARK - D/DYEING",
        "order_qty": 2824.86, "stock_qty": 563.8, "mins_per_batch": 180, "due_date": "20/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 563.8,
        "batches_count": 2, "completes": "28-Oct 14:10"
    },
    {
        "id": 7, "order_no": "26INH27317", "shade": "GREIGE LIGHT",
        "order_qty": 59.5, "stock_qty": 0.0, "mins_per_batch": 60, "due_date": "22/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 59.5,
        "batches_count": 1, "completes": "28-Oct 01:00"
    },
    {
        "id": 8, "order_no": "26INH28779", "shade": "MULTI COLORS LIGHT",
        "order_qty": 5350.0, "stock_qty": 0.0, "mins_per_batch": 120, "due_date": "24/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 5350.0,
        "batches_count": 12, "completes": "28-Oct 02:00"
    },
    {
        "id": 9, "order_no": "26INH28444", "shade": "ROYAL SAPPHIRE DARK",
        "order_qty": 6567.1, "stock_qty": 1200.0, "mins_per_batch": 150, "due_date": "18/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 5567.1,
        "batches_count": 5, "completes": "28-Oct 08:30"
    },
    {
        "id": 10, "order_no": "26INH28450", "shade": "EMERALD FORESTS MEDIUM",
        "order_qty": 1573.2, "stock_qty": 0.0, "mins_per_batch": 140, "due_date": "15/10/2026",
        "priority": 2, "wash_mins": 30, "already_fixed_kg": 0.0, "to_dye_kg": 1573.2,
        "batches_count": 2, "completes": "28-Oct 12:20"
    },
]

# Generate realistic remaining orders to total 102 orders
SHADES_POOL = [
    "TURQUOISE PACIFIC DEEP", "CRIMSON RED RICH", "JET BLACK SUPREME",
    "CHARCOAL GREY HEAVY", "CORAL SUNSET BRIGHT", "LEMON SPARK LIGHT",
    "LAVENDER MIST SOFT", "OLIVE MILITARY DARK", "MIDNIGHT NAVY INTENSE",
    "MAROON VELVET DEEP", "PEACH BLUSH DELICATE", "MINT GREEN FRESH",
    "CHOCOLATE BROWN WARM", "ROYAL PLUM RICH", "SKY CYAN VIVID"
]

random.seed(42)

for i in range(11, 103):
    order_code = f"26INH{27800 + i * 11}"
    shade = SHADES_POOL[i % len(SHADES_POOL)]
    qty = round(random.uniform(50.0, 3200.0), 2)
    stock = round(random.uniform(0.0, min(qty * 0.4, 600.0)), 1)
    to_dye = round(max(qty - stock, 15.0), 2)
    mins = random.choice([30, 45, 60, 90, 120, 150, 180])
    wash = random.choice([10, 15, 20, 30])
    priority = random.choice([1, 2, 2, 2, 3])
    due_day = random.randint(1, 25)
    due_date = f"{due_day:02d}/10/2026"
    b_count = max(1, int(round(to_dye / random.choice([400, 800, 1200]))))
    hour = random.randint(1, 23)
    minute = random.choice([0, 10, 20, 30, 40, 50])
    
    INITIAL_ORDERS.append({
        "id": i,
        "order_no": order_code,
        "shade": shade,
        "order_qty": qty,
        "stock_qty": stock,
        "mins_per_batch": mins,
        "due_date": due_date,
        "priority": priority,
        "wash_mins": wash,
        "already_fixed_kg": 0.0,
        "to_dye_kg": to_dye,
        "batches_count": b_count,
        "completes": f"28-Oct {hour:02d}:{minute:02d}"
    })

# Adjust total sum to match exactly 103,202 kg across orders
current_total_to_dye = sum(o["to_dye_kg"] for o in INITIAL_ORDERS)
diff = 103202.0 - current_total_to_dye
INITIAL_ORDERS[15]["to_dye_kg"] = round(INITIAL_ORDERS[15]["to_dye_kg"] + diff, 2)
INITIAL_ORDERS[15]["order_qty"] = round(INITIAL_ORDERS[15]["to_dye_kg"] + INITIAL_ORDERS[15]["stock_qty"], 2)


# Gantt Batch allocation for 20 vessels
# Generating 269 batches matching the timeline Wed 28 Oct
GANTT_SCHEDULE_DATA = []

# Exact key starting batches from screenshots
KEY_BATCHES = [
    # B1
    {"vessel": "B1", "order": "26INH27317", "shade": "GREIGE LIGHT", "batch_no": 1, "start_min": 0, "dur_min": 60, "kg": 59.5, "fill_pct": 60},
    {"vessel": "B1", "order": "26INH27860", "shade": "GREIGE EXTRA DARK", "batch_no": 2, "start_min": 60, "dur_min": 100, "kg": 100.0, "fill_pct": 100},
    {"vessel": "B1", "order": "26INH27860", "shade": "GREIGE EXTRA DARK", "batch_no": 3, "start_min": 160, "dur_min": 100, "kg": 100.0, "fill_pct": 100},
    {"vessel": "B1", "order": "26INH27860", "shade": "GREIGE EXTRA DARK", "batch_no": 4, "start_min": 260, "dur_min": 100, "kg": 100.0, "fill_pct": 100},
    {"vessel": "B1", "order": "26INH27860", "shade": "GREIGE EXTRA DARK", "batch_no": 5, "start_min": 360, "dur_min": 100, "kg": 100.0, "fill_pct": 100},
    {"vessel": "B1", "order": "26INH27860", "shade": "GREIGE EXTRA DARK", "batch_no": 6, "start_min": 460, "dur_min": 100, "kg": 100.0, "fill_pct": 100},
    {"vessel": "B1", "order": "26INH27860", "shade": "GREIGE EXTRA DARK", "batch_no": 7, "start_min": 560, "dur_min": 180, "kg": 100.0, "fill_pct": 100},
    {"vessel": "B1", "order": "26INH28726", "shade": "CHARCOAL GREY", "batch_no": 1, "start_min": 740, "dur_min": 120, "kg": 100.0, "fill_pct": 100},
    {"vessel": "B1", "order": "26INH28337", "shade": "LAVENDER MIST", "batch_no": 1, "start_min": 860, "dur_min": 80, "kg": 24.0, "fill_pct": 24},

    # B10
    {"vessel": "B10", "order": "26INH28779", "shade": "MULTI COLORS LIGHT", "batch_no": 11, "start_min": 0, "dur_min": 120, "kg": 2500.0, "fill_pct": 100},
    {"vessel": "B10", "order": "26INH28779", "shade": "MULTI COLORS LIGHT", "batch_no": 12, "start_min": 120, "dur_min": 120, "kg": 2500.0, "fill_pct": 100},
    {"vessel": "B10", "order": "26INH28444", "shade": "ROYAL SAPPHIRE DARK", "batch_no": 1, "start_min": 240, "dur_min": 150, "kg": 2500.0, "fill_pct": 100},
    {"vessel": "B10", "order": "26INH28445", "shade": "ROYAL SAPPHIRE DARK", "batch_no": 2, "start_min": 390, "dur_min": 150, "kg": 2500.0, "fill_pct": 100},
    {"vessel": "B10", "order": "26INH27970", "shade": "JET BLACK SUPREME", "batch_no": 1, "start_min": 540, "dur_min": 180, "kg": 2500.0, "fill_pct": 100},
    {"vessel": "B10", "order": "26INH28904", "shade": "CRIMSON RED", "batch_no": 1, "start_min": 720, "dur_min": 140, "kg": 911.0, "fill_pct": 36},

    # B11
    {"vessel": "B11", "order": "26INH28779", "shade": "MULTI COLORS LIGHT", "batch_no": 12, "start_min": 0, "dur_min": 120, "kg": 1100.0, "fill_pct": 100},
    {"vessel": "B11", "order": "26INH28779", "shade": "MULTI COLORS LIGHT", "batch_no": 13, "start_min": 120, "dur_min": 120, "kg": 1100.0, "fill_pct": 100},
    {"vessel": "B11", "order": "26INH28849", "shade": "TURQUOISE PACIFIC", "batch_no": 1, "start_min": 240, "dur_min": 130, "kg": 1100.0, "fill_pct": 100},
    {"vessel": "B11", "order": "26INH28849", "shade": "TURQUOISE PACIFIC", "batch_no": 2, "start_min": 370, "dur_min": 100, "kg": 472.0, "fill_pct": 43},
    {"vessel": "B11", "order": "26INH28902", "shade": "MINT GREEN", "batch_no": 1, "start_min": 470, "dur_min": 90, "kg": 86.0, "fill_pct": 8},

    # B12
    {"vessel": "B12", "order": "26INH28779", "shade": "MULTI COLORS LIGHT", "batch_no": 9, "start_min": 0, "dur_min": 120, "kg": 1100.0, "fill_pct": 100},
    {"vessel": "B12", "order": "26INH28779", "shade": "MULTI COLORS LIGHT", "batch_no": 10, "start_min": 120, "dur_min": 120, "kg": 1100.0, "fill_pct": 100},
    {"vessel": "B12", "order": "26INH27689", "shade": "GREIGE EXTRA DARK", "batch_no": 1, "start_min": 240, "dur_min": 180, "kg": 460.0, "fill_pct": 42},
    {"vessel": "B12", "order": "26INH27689", "shade": "GREIGE EXTRA DARK", "batch_no": 2, "start_min": 420, "dur_min": 120, "kg": 181.3, "fill_pct": 16},

    # B13
    {"vessel": "B13", "order": "26INH28779", "shade": "MULTI COLORS LIGHT", "batch_no": 10, "start_min": 0, "dur_min": 120, "kg": 650.0, "fill_pct": 100},
    {"vessel": "B13", "order": "26INH28444", "shade": "ROYAL SAPPHIRE DARK", "batch_no": 2, "start_min": 120, "dur_min": 150, "kg": 367.1, "fill_pct": 56},
    {"vessel": "B13", "order": "26INH28450", "shade": "EMERALD FORESTS", "batch_no": 1, "start_min": 270, "dur_min": 130, "kg": 73.2, "fill_pct": 11},
    {"vessel": "B13", "order": "26INH27689", "shade": "GREIGE EXTRA DARK", "batch_no": 3, "start_min": 400, "dur_min": 180, "kg": 181.3, "fill_pct": 28},

    # B2
    {"vessel": "B2", "order": "26INH27146", "shade": "GREIGE WHITE", "batch_no": 1, "start_min": 0, "dur_min": 60, "kg": 125.0, "fill_pct": 63},
    {"vessel": "B2", "order": "26INH28836", "shade": "OLIVE MILITARY", "batch_no": 1, "start_min": 60, "dur_min": 140, "kg": 152.7, "fill_pct": 76},
    {"vessel": "B2", "order": "26W067957", "shade": "PEACH BLUSH", "batch_no": 1, "start_min": 200, "dur_min": 100, "kg": 50.0, "fill_pct": 25},

    # B3
    {"vessel": "B3", "order": "26INH27171", "shade": "LEMON SPARK", "batch_no": 1, "start_min": 0, "dur_min": 90, "kg": 57.5, "fill_pct": 19},
    {"vessel": "B3", "order": "26INH26448", "shade": "NAVY EXTRA DARK", "batch_no": 1, "start_min": 90, "dur_min": 150, "kg": 300.0, "fill_pct": 100},
    {"vessel": "B3", "order": "26INH28726", "shade": "CHARCOAL GREY", "batch_no": 1, "start_min": 240, "dur_min": 120, "kg": 132.5, "fill_pct": 44},
    {"vessel": "B3", "order": "26INH28912", "shade": "MIDNIGHT NAVY", "batch_no": 1, "start_min": 360, "dur_min": 110, "kg": 28.2, "fill_pct": 9},

    # B4
    {"vessel": "B4", "order": "26INH27328", "shade": "NAVY EXTRA DARK", "batch_no": 1, "start_min": 0, "dur_min": 180, "kg": 56.2, "fill_pct": 11},
    {"vessel": "B4", "order": "26INH28849", "shade": "TURQUOISE PACIFIC", "batch_no": 1, "start_min": 180, "dur_min": 120, "kg": 500.0, "fill_pct": 100},
    {"vessel": "B4", "order": "26INH28084", "shade": "CHOCOLATE BROWN", "batch_no": 1, "start_min": 300, "dur_min": 140, "kg": 24.6, "fill_pct": 5},

    # B5
    {"vessel": "B5", "order": "26INH28910", "shade": "SKY CYAN VIVID", "batch_no": 1, "start_min": 0, "dur_min": 140, "kg": 700.0, "fill_pct": 100},
    {"vessel": "B5", "order": "26INH28839", "shade": "TURQUOISE PACIFIC", "batch_no": 1, "start_min": 140, "dur_min": 110, "kg": 181.5, "fill_pct": 26},
]

# Generate realistic batches across all 20 vessels to match 269 total batches
batch_id_counter = 1
for b in KEY_BATCHES:
    v_info = next((v for v in VESSELS_DATA if v["code"] == b["vessel"]), None)
    max_cap = v_info["max_cap"] if v_info else 100.0
    start_dt = datetime(2026, 10, 28, 0, 0) + timedelta(minutes=b["start_min"])
    end_dt = start_dt + timedelta(minutes=b["dur_min"])
    GANTT_SCHEDULE_DATA.append({
        "id": batch_id_counter,
        "order": b["order"],
        "shade": b["shade"],
        "batch_no": b["batch_no"],
        "plan": "New",
        "vessel": b["vessel"],
        "min_cap": 0,
        "max_cap": max_cap,
        "batch_kg": b["kg"],
        "fill_pct": b["fill_pct"],
        "wash_before": "-" if b["start_min"] == 0 else "15 min",
        "start": start_dt.strftime("28-Oct %H:%M"),
        "end": end_dt.strftime("28-Oct %H:%M"),
        "start_minutes": b["start_min"],
        "duration_minutes": b["dur_min"],
        "is_fixed": False
    })
    batch_id_counter += 1

# Populate remaining batches across all vessels up to 269
vessel_codes = [v["code"] for v in VESSELS_DATA]
vessel_minute_pointer = {code: 0 for code in vessel_codes}
for b in GANTT_SCHEDULE_DATA:
    vessel_minute_pointer[b["vessel"]] = max(vessel_minute_pointer[b["vessel"]], b["start_minutes"] + b["duration_minutes"])

order_pool_len = len(INITIAL_ORDERS)
while len(GANTT_SCHEDULE_DATA) < 269:
    v_code = vessel_codes[len(GANTT_SCHEDULE_DATA) % len(vessel_codes)]
    v_info = next(v for v in VESSELS_DATA if v["code"] == v_code)
    ord_item = INITIAL_ORDERS[(len(GANTT_SCHEDULE_DATA) * 7) % order_pool_len]
    start_min = vessel_minute_pointer[v_code] + random.choice([0, 10, 15, 20])
    dur_min = random.choice([30, 45, 60, 90, 120, 150])
    vessel_minute_pointer[v_code] = start_min + dur_min
    
    max_cap = v_info["max_cap"]
    batch_kg = round(random.uniform(max_cap * 0.45, max_cap * 1.0), 1)
    fill_pct = min(100, int(round((batch_kg / max_cap) * 100)))
    
    start_dt = datetime(2026, 10, 28, 0, 0) + timedelta(minutes=start_min)
    end_dt = start_dt + timedelta(minutes=dur_min)
    
    GANTT_SCHEDULE_DATA.append({
        "id": batch_id_counter,
        "order": ord_item["order_no"],
        "shade": ord_item["shade"],
        "batch_no": random.randint(1, 8),
        "plan": "New",
        "vessel": v_code,
        "min_cap": 0,
        "max_cap": max_cap,
        "batch_kg": batch_kg,
        "fill_pct": fill_pct,
        "wash_before": "30 min" if random.random() > 0.5 else "-",
        "start": start_dt.strftime("28-Oct %H:%M"),
        "end": end_dt.strftime("28-Oct %H:%M"),
        "start_minutes": start_min,
        "duration_minutes": dur_min,
        "is_fixed": False
    })
    batch_id_counter += 1

# Schedule effectiveness comparison data matching Page 3 screenshot exactly
SCHEDULE_EFFECTIVENESS = [
    {
        "measure": "On-time orders",
        "basic": "0%",
        "optimised": "0%",
        "what_it_tells_you": "Share of orders finished by their due date",
        "better": "optimised"
    },
    {
        "measure": "Orders late",
        "basic": "101",
        "optimised": "101",
        "what_it_tells_you": "Orders that miss their due date",
        "better": "optimised"
    },
    {
        "measure": "Tightest slack",
        "basic": "-627.0 h",
        "optimised": "-627.0 h",
        "what_it_tells_you": "Hours to spare on the riskiest order",
        "better": "optimised"
    },
    {
        "measure": "Average slack",
        "basic": "-204.1 h",
        "optimised": "-204.1 h",
        "what_it_tells_you": "Hours to spare on a typical order",
        "better": "optimised"
    },
    {
        "measure": "Batches",
        "basic": "269",
        "optimised": "269",
        "what_it_tells_you": "Each batch costs water, steam, chemicals and operator time",
        "better": "optimised"
    },
    {
        "measure": "Batches under 60% full",
        "basic": "87",
        "optimised": "87",
        "what_it_tells_you": "Vessel loads that are mostly empty",
        "better": "optimised"
    },
    {
        "measure": "Batches below vessel minimum",
        "basic": "0",
        "optimised": "0",
        "what_it_tells_you": "Loads smaller than the vessel's minimum capacity",
        "better": "optimised"
    },
    {
        "measure": "Average fill (by kg)",
        "basic": "59%",
        "optimised": "59%",
        "what_it_tells_you": "Fabric kg as a share of vessel capacity",
        "better": "optimised"
    },
    {
        "measure": "Unused vessel capacity",
        "basic": "70,348 kg",
        "optimised": "70,348 kg",
        "what_it_tells_you": "Capacity run empty across all batches",
        "better": "optimised"
    },
    {
        "measure": "Wash time",
        "basic": "4500 min",
        "optimised": "4500 min",
        "what_it_tells_you": "Minutes spends washing between colours",
        "better": "optimised"
    },
    {
        "measure": "Batches off preferred vessel",
        "basic": "0",
        "optimised": "0",
        "what_it_tells_you": "Batches on a vessel the order did not prefer",
        "better": "optimised"
    },
    {
        "measure": "Vessel utilisation",
        "basic": "78%",
        "optimised": "78%",
        "what_it_tells_you": "Busy vessel-hours over plan length",
        "better": "optimised"
    },
    {
        "measure": "Plan length",
        "basic": "26.5 h",
        "optimised": "26.5 h",
        "what_it_tells_you": "First start to last finish",
        "better": "optimised"
    }
]

# Breakdowns & holidays list
BREAKDOWNS_AND_HOLIDAYS = []
