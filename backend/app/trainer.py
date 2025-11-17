from http import HTTPStatus
from datetime import datetime, timedelta
from typing import Optional

from flask import request
from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from .extensions import db
from .utils import role_required
from .models import (
    ActivityLog,
    User,
    Cohort,
    Session,
    SessionStatus,
    Scenario,
    Campaign,
)

ns = Namespace("trainer", description="Trainer utilities and presence")


def _iso(ts: Optional[datetime]) -> Optional[str]:
    return ts.isoformat() + "Z" if ts else None


@ns.route("/presence")
class TrainerPresence(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self):
        """
        List recently active users ("online") with cohort/campaign/scenario context.
        Query params:
          - cohort_id (optional): filter by cohort
          - window (optional): seconds for activity window (default 300)
        """
        cohort_id = request.args.get("cohort_id", type=int)
        window = request.args.get("window", default=300, type=int)
        since = datetime.utcnow() - timedelta(seconds=max(30, window))

        # last activity per user in window
        sub = (
            db.session.query(
                ActivityLog.user_id.label("user_id"),
                func.max(ActivityLog.timestamp).label("last_seen"),
            )
            .filter(ActivityLog.timestamp >= since)
            .group_by(ActivityLog.user_id)
            .subquery()
        )

        rows = (
            db.session.query(sub.c.user_id, sub.c.last_seen)
            .order_by(sub.c.user_id.asc())
            .all()
        )

        result = []
        # Preload users and cohorts maps
        user_map = {u.id: u for u in User.query.filter(User.id.in_([r.user_id for r in rows])).all()} if rows else {}

        for r in rows:
            uid = int(r.user_id)
            last_seen = r.last_seen
            # Fetch latest activity record for richer context (session/cohort)
            act = (
                ActivityLog.query
                .filter(ActivityLog.user_id == uid)
                .order_by(ActivityLog.timestamp.desc())
                .first()
            )
            # Context defaults
            c_id = act.cohort_id if act else None
            s_id = act.session_id if act else None
            session = Session.query.get(s_id) if s_id else None
            if session and not c_id:
                c_id = session.cohort_id
            scenario = Scenario.query.get(session.scenario_id) if session and session.scenario_id else None
            campaign = Campaign.query.get(scenario.campaign_id) if scenario and scenario.campaign_id else None

            # Optional filter by cohort
            if cohort_id and c_id != cohort_id:
                continue

            status = "lobby"
            if session:
                if session.status == SessionStatus.running:
                    status = "playing"
                elif session.status == SessionStatus.created:
                    status = "briefing"
                elif session.status == SessionStatus.paused:
                    status = "paused"
                elif session.status == SessionStatus.ended:
                    status = "ended"

            cohort = Cohort.query.get(c_id) if c_id else None
            user = user_map.get(uid)

            result.append({
                "user_id": uid,
                "email": user.email if user else None,
                "cohort_id": c_id,
                "cohort_name": cohort.name if cohort else None,
                "campaign_id": campaign.id if campaign else None,
                "campaign_name": campaign.name if campaign else None,
                "scenario_id": scenario.id if scenario else None,
                "scenario_name": scenario.name if scenario else None,
                "session_id": session.id if session else None,
                "status": status,
                "last_seen": _iso(last_seen),
            })

        return {"users": result}, HTTPStatus.OK
