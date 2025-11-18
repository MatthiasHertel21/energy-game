from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity

from .extensions import db
from .models import Session, Scenario, CohortMember, Cohort, SessionStatus
import os
try:
    import redis as _redis
    _redis_client = _redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
except Exception:
    _redis_client = None


ns = Namespace("me", description="Current user endpoints")


@ns.route("/sessions")
class MySessions(Resource):
    @jwt_required()
    def get(self):
        uid = int(get_jwt_identity())
        # sessions for cohorts the user is a member of (only active: created or running)
        q = (
            db.session.query(Session, Scenario, Cohort)
            .join(Scenario, Scenario.id == Session.scenario_id)
            .join(Cohort, Cohort.id == Session.cohort_id)
            .join(CohortMember, CohortMember.cohort_id == Session.cohort_id)
            .filter(CohortMember.user_id == uid)
            .filter(Session.status.in_([SessionStatus.created, SessionStatus.running]))
            .order_by(Session.id.desc())
        )
        out = []
        for s, sc, ch in q.all():
            general = (sc.config or {}).get("general", {})
            max_rounds = general.get("rounds", 10)
            # next_round_at: estimate based on round_span_hours
            round_span_hours = general.get("round_span_hours", 6)
            next_round_at = None
            if s.status == SessionStatus.running and s.started_at:
                from datetime import timedelta
                elapsed_rounds = s.current_round - 1
                next_round_at = (s.started_at + timedelta(hours=elapsed_rounds * round_span_hours)).isoformat()
            
            out.append({
                "id": s.id,
                "scenario_id": s.scenario_id,
                "scenario_name": sc.name,
                "cohort_name": ch.name,
                "status": s.status.value,
                "current_round": s.current_round,
                "max_rounds": max_rounds,
                "mode": s.mode,
                "next_round_at": next_round_at,
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "general": general,
            })
        return out


@ns.route("/navigate")
class MyNavigate(Resource):
    @jwt_required()
    def get(self):
        """Return a force navigation URL for the current user if trainer initiated one for any of user's cohorts."""
        uid = int(get_jwt_identity())
        if not _redis_client:
            return {"url": None}
        # find cohort memberships
        cohort_ids = [row.cohort_id for row in CohortMember.query.filter_by(user_id=uid).all()]
        for cid in cohort_ids:
            key = f"cohort:{cid}:force_nav"
            try:
                val = _redis_client.get(key)
            except Exception:
                val = None
            if val:
                url = val.decode() if isinstance(val, (bytes, bytearray)) else str(val)
                return {"url": url}
        return {"url": None}