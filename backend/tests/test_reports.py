import pytest
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.database import SessionLocal
from app.models.schedule_models import ProductionSchedule
from app.services.report_service import generate_production_excel_report, generate_production_pdf_report

@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    yield session
    session.close()

def test_excel_and_pdf_generation(db):
    schedules = db.query(ProductionSchedule).all()
    assert len(schedules) > 0

    excel_path = generate_production_excel_report(schedules, "Test Master Production Schedule")
    assert os.path.exists(excel_path)
    assert os.path.getsize(excel_path) > 1000 # Valid excel file with data

    pdf_path = generate_production_pdf_report(schedules, "Test Master Production Dispatch Report")
    assert os.path.exists(pdf_path)
    assert os.path.getsize(pdf_path) > 1000 # Valid pdf file with data
