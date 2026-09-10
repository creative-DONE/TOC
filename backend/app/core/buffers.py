from typing import Dict, Any, Tuple, Optional
from datetime import datetime, timedelta
from app.config import settings

def calculate_buffer_penetration(
    planned_completion: datetime,
    due_date: datetime,
    total_shipping_buffer_hours: float = settings.DEFAULT_SHIPPING_BUFFER_HOURS
) -> Dict[str, Any]:
    """
    Measures TOC Buffer Penetration:
    - 🟢 Safe: < 33% buffer consumed
    - 🟠 Warning: 33% - 66% buffer consumed
    - 🔴 Critical: > 66% buffer consumed (eating into delivery time)
    """
    total_slack_hours = (due_date - planned_completion).total_seconds() / 3600.0
    buffer_hours = max(1.0, total_shipping_buffer_hours)
    
    if total_slack_hours >= buffer_hours:
        penetration_pct = 0.0
        status = "SAFE"
        color = "GREEN"
    elif total_slack_hours <= 0:
        penetration_pct = 100.0 + (abs(total_slack_hours) / buffer_hours) * 100.0
        status = "CRITICAL_LATE"
        color = "RED"
    else:
        # Buffer partially consumed
        consumed_hours = buffer_hours - total_slack_hours
        penetration_pct = (consumed_hours / buffer_hours) * 100.0
        if penetration_pct < 33.3:
            status = "SAFE"
            color = "GREEN"
        elif penetration_pct < 66.6:
            status = "WARNING"
            color = "ORANGE"
        else:
            status = "CRITICAL"
            color = "RED"
            
    return {
        "status": status,
        "color": color,
        "penetration_pct": round(min(penetration_pct, 150.0), 1),
        "slack_remaining_hours": round(total_slack_hours, 1),
        "buffer_size_hours": round(buffer_hours, 1)
    }

def validate_seven_day_planning_rule(
    order_due_date: datetime,
    planned_schedule_date: Optional[datetime],
    current_time: datetime,
    advance_rule_days: int = settings.ADVANCE_PLANNING_DAYS
) -> Tuple[bool, Optional[str]]:
    """
    Validates the strict 7-Day Advance Planning Rule:
    Every order must receive a confirmed schedule at least 7 days before its due date.
    
    Example:
    Due Date: Sept 20
    Must be scheduled and confirmed by: Sept 13
    """
    deadline_for_confirmation = order_due_date - timedelta(days=advance_rule_days)
    
    # If currently past the 7-day cutoff and no schedule exists
    if current_time > deadline_for_confirmation and planned_schedule_date is None:
        days_to_due = (order_due_date - current_time).total_seconds() / 86400.0
        msg = f"RED ALERT — 7-Day Planning Rule Violated: Due date is in {days_to_due:.1f} days, but no production slot confirmed!"
        return False, msg
        
    # If scheduled date is too close to due date without sufficient advance confirmation
    if planned_schedule_date is not None:
        confirmation_lead_days = (order_due_date - planned_schedule_date).total_seconds() / 86400.0
        # If the planned production itself starts less than required process buffer before due date
        if confirmation_lead_days < 1.0:
            msg = f"RED ALERT — Extreme Delivery Risk: Production scheduled within 24 hours of customer due date ({confirmation_lead_days:.1f} days margin)."
            return False, msg

    return True, None
