from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pathlib import Path
from app.config import settings
from app.db.database import engine, Base, SessionLocal
from app.db.seed_data import seed_factory_data
from app.services.scheduler_service import SchedulerService

# Import all models to ensure registration
from app.models import *

# Import routers
from app.routers import (
    dashboard, orders, machines, materials, manpower, schedule, simulation, disruptions, reports
)

# Initialize database schema
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Intelligent TOC-Based Textile Colouring Production Planning & Scheduling Software"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(dashboard.router)
app.include_router(orders.router)
app.include_router(machines.router)
app.include_router(materials.router)
app.include_router(manpower.router)
app.include_router(schedule.router)
app.include_router(simulation.router)
app.include_router(disruptions.router)
app.include_router(reports.router)

# Mount static files
STATIC_DIR = Path(__file__).resolve().parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        # Seed realistic factory data
        seed_factory_data(db)
        
        # Run initial schedule optimization so the software is fully populated out-of-the-box
        scheduler = SchedulerService(db)
        scheduler.generate_full_schedule()
        print("Initial TOC production schedule successfully generated.")
    except Exception as e:
        print(f"Startup initialization note: {e}")
    finally:
        db.close()

@app.middleware("http")
async def add_no_cache_header(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

@app.get("/", response_class=HTMLResponse)
def serve_home():
    template_path = Path(__file__).resolve().parent / "templates" / "index.html"
    if template_path.exists():
        with open(template_path, "r", encoding="utf-8") as f:
            content = f.read()
            return HTMLResponse(
                content=content,
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            )
    return "<h1>TOC Textile Scheduler API is Running</h1>"
