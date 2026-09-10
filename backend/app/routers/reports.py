from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.schedule_models import ProductionSchedule
from app.services.report_service import generate_production_excel_report, generate_production_pdf_report

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/excel")
def download_excel_schedule(db: Session = Depends(get_db)):
    schedules = db.query(ProductionSchedule).order_by(ProductionSchedule.planned_start.asc()).all()
    filepath = generate_production_excel_report(schedules, report_title="Master Production Schedule")
    return FileResponse(
        path=filepath,
        filename="textile_production_schedule.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

@router.get("/pdf")
def download_pdf_schedule(db: Session = Depends(get_db)):
    schedules = db.query(ProductionSchedule).order_by(ProductionSchedule.planned_start.asc()).all()
    filepath = generate_production_pdf_report(schedules, report_title="Production Schedule Dispatch Report")
    return FileResponse(
        path=filepath,
        filename="textile_production_dispatch.pdf",
        media_type="application/pdf"
    )
