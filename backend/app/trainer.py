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
    CohortMember,
    Session,
    SessionStatus,
    Scenario,
    Campaign,
    PlayerProgress,
    PlayerProgressStatus,
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
                "role": user.role.value if user else None,
            })

        return {"users": result}, HTTPStatus.OK


@ns.route("/cohort/<int:cohort_id>/members")
class CohortMembers(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, cohort_id):
        """
        List all members of a cohort with statistics:
        - Total scenarios played (solo)
        - Completed scenarios
        - Last activity
        - Current session status
        """
        cohort = Cohort.query.get_or_404(cohort_id)
        
        # Get all cohort members
        members = (
            db.session.query(CohortMember, User)
            .join(User, User.id == CohortMember.user_id)
            .filter(CohortMember.cohort_id == cohort_id)
            .order_by(User.email)
            .all()
        )

        result = []
        for member_record, user in members:
            # Get statistics for this user
            total_played = (
                db.session.query(func.count(PlayerProgress.id))
                .filter(
                    PlayerProgress.user_id == user.id,
                    PlayerProgress.status.in_([PlayerProgressStatus.in_progress, PlayerProgressStatus.completed])
                )
                .scalar() or 0
            )
            
            completed_count = (
                db.session.query(func.count(PlayerProgress.id))
                .filter(
                    PlayerProgress.user_id == user.id,
                    PlayerProgress.status == PlayerProgressStatus.completed
                )
                .scalar() or 0
            )

            # Get last activity
            last_activity = (
                ActivityLog.query
                .filter(ActivityLog.user_id == user.id)
                .order_by(ActivityLog.timestamp.desc())
                .first()
            )

            # Get current active session for this cohort if any
            active_session = (
                Session.query
                .filter(
                    Session.cohort_id == cohort_id,
                    Session.status.in_([SessionStatus.created, SessionStatus.running, SessionStatus.paused])
                )
                .order_by(Session.created_at.desc())
                .first()
            )

            # Determine current status
            status = "inactive"
            session_info = None
            
            if last_activity:
                time_diff = (datetime.utcnow() - last_activity.timestamp).total_seconds()
                if time_diff < 300:  # Active in last 5 minutes
                    status = "online"
                elif time_diff < 3600:  # Active in last hour
                    status = "recent"
            
            if active_session:
                # Check if user is part of this session
                from .models import Player
                player = Player.query.filter_by(
                    session_id=active_session.id,
                    user_id=user.id
                ).first()
                
                if player:
                    if active_session.status == SessionStatus.running:
                        status = "playing"
                    elif active_session.status == SessionStatus.created:
                        status = "briefing"
                    elif active_session.status == SessionStatus.paused:
                        status = "paused"
                    
                    scenario = Scenario.query.get(active_session.scenario_id) if active_session.scenario_id else None
                    campaign = Campaign.query.get(scenario.campaign_id) if scenario and scenario.campaign_id else None
                    
                    session_info = {
                        "session_id": active_session.id,
                        "scenario_name": scenario.name if scenario else None,
                        "campaign_name": campaign.name if campaign else None,
                        "current_round": active_session.current_round,
                    }

            result.append({
                "user_id": user.id,
                "email": user.email,
                "name": user.name,
                "role": user.role.value,
                "status": status,
                "total_scenarios_played": total_played,
                "completed_scenarios": completed_count,
                "last_activity": _iso(last_activity.timestamp) if last_activity else None,
                "active_session": session_info,
            })

        return {
            "cohort_id": cohort_id,
            "cohort_name": cohort.name,
            "members": result,
            "total_members": len(result),
        }, HTTPStatus.OK
