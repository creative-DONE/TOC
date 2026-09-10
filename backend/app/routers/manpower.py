from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.models.factory_models import Employee, EmployeeSkill
from app.schemas.schemas import EmployeeResponse

router = APIRouter(prefix="/api/manpower", tags=["Manpower"])

@router.get("", response_model=List[EmployeeResponse])
def get_employees(db: Session = Depends(get_db)):
    employees = db.query(Employee).all()
    result = []
    
    for emp in employees:
        cert_ids = [s.machine_id for s in emp.skills if s.certified]
        result.append(EmployeeResponse(
            id=emp.id,
            code=emp.code,
            name=emp.name,
            role=emp.role,
            shift=emp.shift,
            available_hours=emp.available_hours,
            overtime_available_hours=emp.overtime_available_hours,
            current_workload_hours=emp.current_workload_hours,
            on_leave=emp.on_leave,
            certified_machine_ids=cert_ids
        ))
    return result
