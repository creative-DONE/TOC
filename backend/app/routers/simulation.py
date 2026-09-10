from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from app.db.database import get_db
from app.models.order_models import Order
from app.models.factory_models import Machine
from app.schemas.schemas import WhatIfRequest, WhatIfResponse
from app.core.simulation import run_what_if_simulation

router = APIRouter(prefix="/api/simulation", tags=["What-If Simulation"])

@router.post("/run", response_model=WhatIfResponse)
def run_simulation(req: WhatIfRequest, db: Session = Depends(get_db)):
    orders = db.query(Order).all()
    machines = db.query(Machine).all()
    
    sim_result = run_what_if_simulation(
        scenario_req=req,
        baseline_orders=orders,
        baseline_machines=machines,
        reference_now=datetime.utcnow()
    )
    
    return WhatIfResponse(
        scenario_name=sim_result["scenario_name"],
        baseline_on_time_pct=sim_result["baseline_on_time_pct"],
        simulated_on_time_pct=sim_result["simulated_on_time_pct"],
        baseline_bottleneck=sim_result["baseline_bottleneck"],
        simulated_bottleneck=sim_result["simulated_bottleneck"],
        delayed_orders_count=sim_result["delayed_orders_count"],
        delayed_orders=sim_result["delayed_orders"],
        cost_difference_inr=sim_result["cost_difference_inr"],
        recommendation=sim_result["recommendation"],
        simulated_schedule=[]
    )
