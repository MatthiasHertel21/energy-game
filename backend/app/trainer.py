from http import HTTPStatus
from datetime import datetime, timedelta
from typing import Optional

from flask import request
from flask_restx import Namespace, Resource, fields
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
    SessionPlayerType,
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

        # Batch: latest ActivityLog per user (one query with window-function subquery)
        all_user_ids = [int(r.user_id) for r in rows]
        act_map: dict = {}
        if all_user_ids:
            act_sub = (
                db.session.query(
                    ActivityLog.user_id.label("user_id"),
                    func.max(ActivityLog.id).label("max_id"),
                )
                .filter(ActivityLog.user_id.in_(all_user_ids))
                .group_by(ActivityLog.user_id)
                .subquery()
            )
            for act in (
                db.session.query(ActivityLog)
                .join(act_sub, ActivityLog.id == act_sub.c.max_id)
                .all()
            ):
                act_map[act.user_id] = act

        # Collect unique session/scenario/campaign/cohort IDs for batch loading.
        session_ids_needed = {a.session_id for a in act_map.values() if a.session_id}
        cohort_ids_needed  = {a.cohort_id  for a in act_map.values() if a.cohort_id}
        session_by_id = {s.id: s for s in Session.query.filter(Session.id.in_(session_ids_needed)).all()} if session_ids_needed else {}
        # Also collect cohort_ids from sessions whose act didn't carry one.
        for s_obj in session_by_id.values():
            if s_obj.cohort_id:
                cohort_ids_needed.add(s_obj.cohort_id)
        scenario_ids_needed = {s_obj.scenario_id for s_obj in session_by_id.values() if s_obj.scenario_id}
        scenario_by_id = {sc.id: sc for sc in Scenario.query.filter(Scenario.id.in_(scenario_ids_needed)).all()} if scenario_ids_needed else {}
        campaign_ids_needed = {sc.campaign_id for sc in scenario_by_id.values() if sc.campaign_id}
        campaign_by_id = {c.id: c for c in Campaign.query.filter(Campaign.id.in_(campaign_ids_needed)).all()} if campaign_ids_needed else {}
        cohort_by_id = {co.id: co for co in Cohort.query.filter(Cohort.id.in_(cohort_ids_needed)).all()} if cohort_ids_needed else {}

        for r in rows:
            uid = int(r.user_id)
            last_seen = r.last_seen
            act = act_map.get(uid)
            c_id = act.cohort_id if act else None
            s_id = act.session_id if act else None
            session = session_by_id.get(s_id) if s_id else None
            if session and not c_id:
                c_id = session.cohort_id
            scenario = scenario_by_id.get(session.scenario_id) if session and session.scenario_id else None
            campaign = campaign_by_id.get(scenario.campaign_id) if scenario and scenario.campaign_id else None

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

            cohort = cohort_by_id.get(c_id) if c_id else None
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
                    Session.status.in_(
                        [
                            SessionStatus.created,
                            SessionStatus.briefing,
                            SessionStatus.running,
                            SessionStatus.round_active,
                            SessionStatus.round_closing,
                            SessionStatus.calculating,
                            SessionStatus.round_results,
                            SessionStatus.paused,
                        ]
                    )
                )
                .order_by(Session.id.desc())
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
                # Check if user joined this session via session_join activity
                joined = ActivityLog.query.filter_by(
                    user_id=user.id,
                    session_id=active_session.id,
                    action_type="session_join",
                ).first()

                if joined:
                    selected_type = None
                    try:
                        sel = SessionPlayerType.query.filter_by(session_id=active_session.id, user_id=user.id).first()
                        if sel:
                            selected_type = sel.type_id
                    except Exception:
                        selected_type = None

                    if active_session.status in [SessionStatus.running, SessionStatus.round_active, SessionStatus.round_results]:
                        status = "playing"
                    elif active_session.status in [SessionStatus.created, SessionStatus.briefing]:
                        status = "briefing"
                    elif active_session.status == SessionStatus.paused:
                        status = "paused"
                    elif active_session.status in [SessionStatus.round_closing, SessionStatus.calculating]:
                        status = "waiting"

                    scenario = Scenario.query.get(active_session.scenario_id) if active_session.scenario_id else None
                    campaign = Campaign.query.get(scenario.campaign_id) if scenario and scenario.campaign_id else None

                    session_info = {
                        "session_id": active_session.id,
                        "scenario_name": scenario.name if scenario else None,
                        "campaign_name": campaign.name if campaign else None,
                        "current_round": active_session.current_round,
                        "player_type": selected_type,
                    }

            result.append({
                "user_id": user.id,
                "email": user.email,
                "name": user.name,
                "role": user.role.value,
                "player_type": session_info.get("player_type") if session_info else None,
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


broadcast_in = ns.model("BroadcastIn", {
    "message": fields.String(required=True, description="Message to broadcast")
})

@ns.route("/broadcast")
class TrainerBroadcast(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(broadcast_in, validate=True)
    def post(self):
        """
        Broadcast a message to all connected players.
        """
        from .extensions import socketio
        msg = request.json["message"]
        # Broadcast to all game namespace clients
        socketio.emit("trainer_message", {"message": msg}, namespace="/game")
        return {"status": "ok"}, HTTPStatus.OK
