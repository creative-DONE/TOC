from datetime import datetime, timedelta
from typing import Tuple, Optional
from app.config import settings

def get_freeze_status_for_time(
    slot_time: datetime,
    reference_now: datetime,
    due_date: Optional[datetime] = None
) -> Tuple[str, bool]:
    """
    Evaluates the configurable Freeze Window:
    - Today (0-24h): 🔒 LOCKED (only for urgent orders with <= 7d deadline)
    - Tomorrow (24-48h): 🔒 MOSTLY_LOCKED (only for urgent orders with <= 7d deadline)
    - 2-3 Days (48-72h): 🟠 LIMITED
    - 4-7 Days (72-168h): 🟡 MODERATE
    - > 7 Days: 🟢 FLEXIBLE (Products with > 1 week deadline do not show lock)
    
    Returns:
    (freeze_level_name, is_locked)
    """
    # Freeze policy rule: Products that have more than 1 week deadline (> 7 days) are in the Flexible Horizon and NOT locked
    if due_date:
        days_to_deadline = (due_date - reference_now).total_seconds() / 86400.0
        if days_to_deadline > 7.0:
            return "FLEXIBLE", False

    diff_hours = (slot_time - reference_now).total_seconds() / 3600.0
    
    if diff_hours <= settings.FREEZE_TODAY_HOURS:
        return "LOCKED", True
    elif diff_hours <= settings.FREEZE_TOMORROW_HOURS:
        return "MOSTLY_LOCKED", True
    elif diff_hours <= settings.FREEZE_LIMITED_HOURS:
        return "LIMITED", False
    elif diff_hours <= settings.FREEZE_MODERATE_HOURS:
        return "MODERATE", False
    else:
        return "FLEXIBLE", False

def can_reschedule_job(
    current_freeze_level: str,
    is_emergency: bool = False,
    is_manual_override: bool = False
) -> bool:
    """Checks whether a job is eligible for rescheduling."""
    if is_manual_override:
        return True
    if is_emergency:
        return current_freeze_level != "LOCKED"
    return current_freeze_level in ["LIMITED", "MODERATE", "FLEXIBLE"]
