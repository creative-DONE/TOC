# Intelligent TOC-Based Textile Colouring Production Scheduling Software

An industrial-grade, modern, constraint-aware **production planning and scheduling software for a textile/cloth colouring (dyeing) factory**, engineered around the **Theory of Constraints (TOC)** and the **Drum-Buffer-Rope (DBR)** methodology.

---

## Key Capabilities & TOC Architecture

### 1. 3-Level Hierarchical Planning
- **Level 1 — Monthly Capacity Plan (1–3 Months)**: High-level aggregate demand vs available capacity ($kg$), long-range bottleneck forecasting, MRP material shortages, and 7-day advance rule risk estimation.
- **Level 2 — Weekly Detailed Schedule (2–4 Weeks)**: Granular assignment of Order, Batch, Machine, Certified Operator, Shift, Start/End times, and buffers.
- **Level 3 — Daily/Real-Time Schedule (Today & Tomorrow)**: Minute-by-minute shop-floor execution enforcing Freeze Windows and reacting to disruptions.

### 2. Theory of Constraints (TOC) & Drum-Buffer-Rope (DBR)
Implements the **5 Focusing Steps**:
1. **Identify the Constraint**: Dynamic calculation of $Workload / Capacity$ across dyeing machines, finishing stages, and factory utilities (Water, Steam, Power) to locate the active Drum.
2. **Exploit the Drum**: Maximizes bottleneck productivity: zero unnecessary idle time, optimal colour sequencing (light-to-dark or shade grouping) to slash cleaning times, material and operator pre-staged before slot start.
3. **Subordinate Everything Else**: Upstream scouring, fabric inspection, and lab dips are paced to the Drum via the **Rope**, strictly respecting the **1,500 kg WIP ceiling**.
4. **Elevate the Constraint**: Automated executive recommendations: overtime authorization, auxiliary vessel activation, outsourcing pre-treatment, or delivery date negotiation.
5. **Repeat**: Real-time constraint migration tracking when factory parameters shift.

### 3. Configurable Planning Freeze Window
Prevents shop-floor nervousness and chaotic plan shuffling:
- **Today (Day 0)**: 🔒 **Locked** — No automated rescheduling; only emergency supervisor override.
- **Tomorrow (Day 1)**: 🔒 **Mostly Locked** — Changes restricted to downtime repairs or identical fabric swaps.
- **Days 2–3**: 🟠 **Limited Changes** — Rescheduling allowed only if critical buffer is penetrated.
- **Days 4–7**: 🟡 **Moderate Optimization** — Flexible sequencing to group colours and optimize batches.
- **> 7 Days**: 🟢 **Fully Optimizable** — Full combinatorial optimization freely shifts slots.

### 4. 5-Point Order Readiness Checklist & Smart Swap
Prevents starving machines while waiting for missing supplies:
- **Readiness Checklist**:
  1. Base Fabric Available $\ge$ required quantity
  2. Dyes & Chemicals in Stock $\ge$ recipe requirement
  3. Qualified Operator available on shift
  4. Target Machine Available & operational
  5. Lab Dip / Shade Approval confirmed
- **Smart Swap**: If an order is 🔴 **Not Ready**, the scheduler automatically replaces it with a feasible 🟢 **Ready** order with compatible machine requirements.

### 5. Multi-Dimensional Sequence-Dependent Changeover Matrix
Sequence transition penalty is calculated over:
$$\text{Changeover Cost} = f(\text{Prev Fabric}, \text{Prev Colour}, \text{Next Fabric}, \text{Next Colour}, \text{Machine})$$
- **Light to Dark** (White $\to$ Blue): 15–25 min quick rinse, 800 L water.
- **Dark to Light** (Black $\to$ White): 75–95 min caustic strip, 4,500 L water, ₹950 chemical cost.
- **Fabric Transitions**: Polyester to Cotton requires high-temperature boil-out.
- Optimization clusters identical shades and sequences light $\to$ medium $\to$ dark, slashing changeover downtime and water consumption by 30–60%.

### 6. Machine Capacity & Batch Splitting
- Evaluates machine minimum and maximum batch limits ($kg$).
- If an order exceeds capacity (e.g. 700 kg order on a 500 kg vessel), automatically partitions it into balanced sub-batches (e.g. 350 kg + 350 kg) to maintain consistent liquor ratios and shade uniformity.

### 7. Smart Rush Order Insertion
When an Emergency Order arrives, evaluates candidate slots across compatible machines and selects the position with minimal Total Damage:
$$\text{Damage} = \Delta \text{Changeover} + (100 \times \text{Delayed Orders}) + (15 \times \text{Push Hours})$$

### 8. Dynamic Rescheduling & Disruption Recovery
Instantly repairs schedules upon:
- **Machine Breakdown**: Reassigns compatible jobs to alternative vessels; shifts remaining jobs past repair end; creates critical alerts for delayed customer orders.
- **Material / Dye Delay**: Defers dependent orders; backfills freed slots with ready stock to avoid idle machine time.
- **Worker Absence & Quality Rework**: Schedules urgent re-dye batches while minimizing disruption to the Drum.

### 9. What-If Scenario Sandbox
Isolated in-memory simulation modeling hypothetical scenarios without altering live data:
- Add 3rd Night Shift (22:00–06:00)
- Machine Breakdown for 48 Hours
- Critical Dye Shipment Delayed by 3 Days
- Emergency VIP Order Injection
- Boiler Steam Pressure Drop (Time Inflation +15%)
- Displays side-by-side KPI diffs (On-Time Delivery %, Cost Impact ₹, Delayed Orders, Bottleneck Migration).

### 10. Schedule Quality Scorecard (0–100)
Evaluates schedules using a strict hierarchical multi-objective function:
1. **On-Time Delivery**: 35 pts
2. **Bottleneck Utilization & Protection**: 20 pts
3. **Material Feasibility**: 10 pts
4. **Changeover Efficiency**: 10 pts
5. **Machine Fleet Utilization**: 10 pts
6. **Manpower Feasibility**: 5 pts
7. **Buffers & Schedule Stability**: 10 pts

### 11. Due Date Driven Automatic Scheduling & Daily Capacity
- **Earliest Due Date (EDD) Priority**: Jobs are prioritized using due dates, customer priority tiers, and urgency scores.
- **Strict Daily Machine Capacity**: Daily processing limits are enforced per machine for every single day (e.g. JET-M1: 500 kg/day, JET-M2: 800 kg/day, SOFT-M3: 400 kg/day, SOFT-M4: 600 kg/day, JIG-M5: 1,000 kg/day, STENT-M6: 1,500 kg/day) with zero daily overload.
- **Pre-Allocation Capacity Feasibility**: Proactively calculates cumulative capacity before deadlines to surface deficit alerts and recommendations.
- **Dynamic Planning Horizon**: Eliminates arbitrary scheduling window restrictions, expanding capacity horizon automatically to accommodate orders with deadlines across weeks and months.

### 12. Interactive Production Planning Matrix & Excel Integration
- **2D Smooth Scrolling & Full Backlog**: Real-time matrix supporting horizontal and vertical scrolling across the entire production order backlog with sticky header and column pins.
- **High-Legibility Typography**: High-contrast, bold font sizing for clear shop-floor and planner readability.
- **Excel Schedule Import & Export**: One-click import parsing relative days, ISO dates, customer tiers, and quantities into the live scheduling engine, with instant Excel matrix export.

### 13. Reports & Exports
- **Excel (.xlsx)**: Master production schedule with freeze locks, quantities, due dates, and planned times.
- **PDF (.pdf)**: Formal dispatch and shop-floor work order document.

---

## Project Structure

```
prime tech/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app & startup seeding
│   │   ├── config.py                # Settings, freeze windows, cost rates
│   │   ├── db/
│   │   │   ├── database.py          # SQLAlchemy engine & session
│   │   │   └── seed_data.py         # Realistic textile factory seed dataset
│   │   ├── models/                  # SQLAlchemy ORM models
│   │   │   ├── factory_models.py    # Machines, reliability, materials, colours, utilities
│   │   │   ├── order_models.py      # Customers, orders, batches, readiness, stages
│   │   │   ├── schedule_models.py   # Schedules, disruptions, what-if, alerts, scores
│   │   │   └── history_models.py    # Historical telemetry & stability logs
│   │   ├── schemas/
│   │   │   └── schemas.py           # Pydantic validation schemas
│   │   ├── core/                    # TOC & Optimization Engines
│   │   │   ├── stages.py            # 10-Stage production pipeline
│   │   │   ├── readiness.py         # 5-point readiness checklist & smart swap
│   │   │   ├── changeover.py        # Multi-dimensional sequence-dependent changeovers
│   │   │   ├── batch_splitter.py    # Batch capacity validation & auto-splitting
│   │   │   ├── processing_time.py   # Composite processing time & historical learning
│   │   │   ├── utilities.py         # Water, steam, electricity, effluent limits
│   │   │   ├── wip_rope.py          # Drum-Buffer-Rope 1500kg WIP ceiling
│   │   │   ├── buffers.py           # Drum & shipping buffers, buffer penetration
│   │   │   ├── freeze_window.py     # Configurable freeze window policy
│   │   │   ├── cost_engine.py       # Manufacturing cost accounting
│   │   │   ├── stability.py         # Schedule stability score
│   │   │   ├── rush_insertion.py    # Smart emergency order insertion
│   │   │   ├── explainability.py    # "Why was this order scheduled here?" reasoning
│   │   │   ├── infeasible_handler.py# Capacity shortage diagnostic & elevate actions
│   │   │   ├── quality_scorer.py    # 0-100 hierarchical quality scorecard
│   │   │   ├── historical_learning.py# Production telemetry logger
│   │   │   ├── toc_engine.py        # Bottleneck detection & 5 focusing steps
│   │   │   ├── dynamic_rescheduler.py# Breakdown & delay recovery
│   │   │   ├── simulation.py        # What-If scenario sandbox
│   │   │   └── hierarchy.py         # 3-level planning (Monthly, Weekly, Daily)
│   │   ├── routers/                 # REST API endpoints
│   │   │   ├── dashboard.py         # Executive KPIs & TOC radar
│   │   │   ├── orders.py            # Order management, Excel import & urgency scores
│   │   │   ├── machines.py          # Machines & reliability telemetry
│   │   │   ├── materials.py         # Materials, inventory & MRP forecasting
│   │   │   ├── manpower.py          # Operators, skills & certifications
│   │   │   ├── schedule.py          # Schedule slots, override, rush-insert, score, planning matrix
│   │   │   ├── simulation.py        # What-If sandbox endpoint
│   │   │   ├── disruptions.py       # Breakdown & delay triggers
│   │   │   └── reports.py           # Excel & PDF downloads
│   │   ├── services/
│   │   │   ├── scheduler_service.py # Central DBR scheduler coordinator
│   │   │   ├── matrix_service.py    # Interactive Planning Matrix coordinator
│   │   │   ├── excel_import_service.py # Excel order batch parser & importer
│   │   │   └── report_service.py    # OpenPyXL & ReportLab generators
│   │   ├── static/
│   │   │   ├── css/app.css          # Modern minimalist vibrant light UI CSS
│   │   │   └── js/app.js            # React 18 SPA application
│   │   └── templates/
│   │       └── index.html           # Single-Page Application entry
│   └── tests/                       # Pytest test suite
│       ├── test_toc_engine.py
│       ├── test_changeover.py
│       ├── test_batch_splitter.py
│       ├── test_readiness.py
│       ├── test_rush_insertion.py
│       ├── test_rescheduling.py
│       ├── test_daily_capacity.py
│       ├── test_due_date_scheduling.py
│       ├── test_planning_matrix.py
│       ├── test_factory_scheduler.py
│       ├── test_agenda_reorganize.py
│       └── test_reports.py
├── run.py                           # Server launcher
├── run_tests.py                     # Unit & algorithm test runner
├── test_e2e.py                      # HTTP end-to-end integration test runner
├── requirements.txt
└── README.md
```

---

## Quick Start & Installation

### 1. Requirements
- Python 3.10+
- Installed packages: `fastapi`, `uvicorn`, `sqlalchemy`, `pydantic`, `ortools`, `openpyxl`, `reportlab`, `pandas`, `numpy`, `httpx`

### 2. Launch the Application
```bash
python run.py
```
Then open your web browser at:
```
http://127.0.0.1:8000
```
Upon startup, the database is automatically seeded with 6 production machines, 13 raw materials & dyes, 5 operators, and 16+ realistic customer production orders. The initial TOC schedule is automatically generated and visible immediately on the dashboard and Gantt timeline!

### 3. Run Automated Tests
Run the pytest suite (43 unit & integration tests):
```bash
python -m pytest backend/tests/ -v
```
Run the core scheduler test suite:
```bash
python run_tests.py
```
Run the full HTTP end-to-end integration test suite:
```bash
python test_e2e.py
```

