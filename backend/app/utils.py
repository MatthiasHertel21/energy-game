from functools import wraps
from flask_jwt_extended import verify_jwt_in_request, get_jwt
from flask import abort


def role_required(*allowed_roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt() or {}
            role = claims.get("role")
            if role not in allowed_roles:
                abort(403, description="Forbidden: insufficient role")
            return fn(*args, **kwargs)

        return wrapper

    return decorator

def log_activity(user_id, action_type, session_id=None, cohort_id=None, details=None):
    """
    Log user activity to activity_log table.
    
    Args:
        user_id: User performing the action
        action_type: One of: login, forecast_submit, round_complete, session_join, type_select
        session_id: Optional session context
        cohort_id: Optional cohort context
        details: Optional dict with additional context (round, forecast_count, etc.)
    """
    from .extensions import db
    from .models import ActivityLog
    
    activity = ActivityLog(
        user_id=user_id,
        session_id=session_id,
        cohort_id=cohort_id,
        action_type=action_type,
        details=details
    )
    db.session.add(activity)
    db.session.commit()
