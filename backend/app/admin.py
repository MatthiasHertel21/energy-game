from http import HTTPStatus
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required
from datetime import datetime, timedelta
from sqlalchemy import func

from .extensions import db, bcrypt
from .models import (
    User,
    Invite,
    Role,
    ActivityLog,
    Session,
    Forecast,
    SessionStatus,
    Scenario,
    Cohort,
    Result,
    SessionAllowedType,
    SessionPlayerType,
    CohortMember,
    Campaign,
    CampaignScenario,
    CohortCampaign,
    PlayerProgress,
)
from . import mailer
from .utils import role_required
from .config import Config


ns = Namespace("admin", description="Admin endpoints")

user_out = ns.model(
    "User",
    {
        "id": fields.Integer,
        "email": fields.String,
        "role": fields.String,
        "created_at": fields.String,
    },
)

invite_in = ns.model(
    "InviteCreate",
    {
        "email": fields.String(required=True),
        "role": fields.String(required=True, enum=[r.value for r in Role]),
    },
)

role_patch = ns.model(
    "RolePatch",
    {"role": fields.String(required=True, enum=[r.value for r in Role])},
)


@ns.route("/users")
class Users(Resource):
    @jwt_required()
    @role_required("admin")
    @ns.marshal_list_with(user_out)
    def get(self):
        return [u.to_dict() for u in User.query.order_by(User.id.asc()).all()]

    create_in = ns.model(
        "UserCreate",
        {
            "email": fields.String(required=True),
            "role": fields.String(required=True, enum=[r.value for r in Role]),
            "password": fields.String(required=False, description="Temporary password (min 12 chars). If omitted, a strong password is generated."),
            "send_email": fields.Boolean(required=False, description="If true, send credentials via email (if SMTP configured).", default=True),
        },
    )

    @jwt_required()
    @role_required("admin")
    @ns.expect(create_in, validate=True)
    def post(self):
        body = request.json
        email = body.get("email", "").strip().lower()
        try:
            role = Role(body.get("role"))
        except Exception:
            ns.abort(HTTPStatus.BAD_REQUEST, "Invalid role")

        if not email:
            ns.abort(HTTPStatus.BAD_REQUEST, "Email required")

        # Check system limit for max users
        user_count = User.query.count()
        if user_count >= Config.MAX_USERS:
            ns.abort(HTTPStatus.FORBIDDEN, f"System limit reached: maximum {Config.MAX_USERS} users allowed")

        if User.query.filter_by(email=email).first():
            ns.abort(HTTPStatus.CONFLICT, "Email already registered")

        password = body.get("password")
        if password and len(password) < 12:
            ns.abort(HTTPStatus.BAD_REQUEST, "Password too short (min 12)")

        # generate strong password if not provided
        if not password:
            import secrets, string
            alphabet = string.ascii_letters + string.digits + string.punctuation
            # Exclude whitespace-like chars that sometimes break copying
            alphabet = alphabet.replace("`", "").replace("\\", "")
            password = ''.join(secrets.choice(alphabet) for _ in range(16))

        pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(email=email, password_hash=pw_hash, role=role)
        db.session.add(user)
        db.session.commit()

        email_sent = False
        email_error = None
        if body.get("send_email", True):
            try:
                email_sent, email_error = mailer.send_account_created_email(email, email, password)
            except Exception as e:
                email_sent = False
                email_error = str(e)

        return {
            "status": "ok",
            "user": user.to_dict(),
            "email_sent": bool(email_sent),
            "email_error": (None if email_sent else email_error),
        }, HTTPStatus.CREATED


@ns.route("/users/<int:user_id>/role")
class UserRole(Resource):
    @jwt_required()
    @role_required("admin")
    @ns.expect(role_patch, validate=True)
    def post(self, user_id: int):
        body = request.json
        role_str = body.get("role")
        try:
            new_role = Role(role_str)
        except ValueError:
            ns.abort(HTTPStatus.BAD_REQUEST, "Invalid role")
        user = User.query.get_or_404(user_id)
        user.role = new_role
        db.session.commit()
        return {"status": "ok", "user": user.to_dict()}


@ns.route("/users/<int:user_id>/password")
class UserPassword(Resource):
    password_reset_in = ns.model(
        "PasswordReset",
        {
            "password": fields.String(required=False, description="New password (min 12 chars). If omitted, a strong password is generated."),
            "send_email": fields.Boolean(required=False, description="If true, send new password via email (if SMTP configured).", default=True),
        },
    )

    @jwt_required()
    @role_required("admin")
    @ns.expect(password_reset_in, validate=True)
    def post(self, user_id: int):
        """Reset a user's password. Optionally send new password via email."""
        user = User.query.get_or_404(user_id)
        body = request.json

        password = body.get("password")
        if password and len(password) < 12:
            ns.abort(HTTPStatus.BAD_REQUEST, "Password too short (min 12 characters)")

        # Generate strong password if not provided
        if not password:
            import secrets, string
            alphabet = string.ascii_letters + string.digits + string.punctuation
            # Exclude characters that sometimes break copying
            alphabet = alphabet.replace("`", "").replace("\\", "")
            password = ''.join(secrets.choice(alphabet) for _ in range(16))

        # Update password
        pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user.password_hash = pw_hash
        db.session.commit()

        email_sent = False
        email_error = None
        if body.get("send_email", True):
            try:
                email_sent, email_error = mailer.send_password_reset_email(user.email, user.email, password)
            except Exception as e:
                email_sent = False
                email_error = str(e)

        return {
            "status": "ok",
            "message": f"Password reset for {user.email}",
            "new_password": password,
            "email_sent": bool(email_sent),
            "email_error": (None if email_sent else email_error),
        }, HTTPStatus.OK


@ns.route("/users/<int:user_id>")
class UserItem(Resource):
    @jwt_required()
    @role_required("admin")
    def delete(self, user_id: int):
        """Delete a user. Prevent deleting yourself."""
        user = User.query.get_or_404(user_id)

        # Prevent deleting yourself
        from flask_jwt_extended import get_jwt_identity
        current_user_id = int(get_jwt_identity())
        if user.id == current_user_id:
            ns.abort(HTTPStatus.BAD_REQUEST, "Cannot delete yourself")

        # Delete related records to prevent foreign key constraint violations
        
        # Delete forecasts by this user
        Forecast.query.filter_by(player_id=user_id).delete()
        
        # Delete results by this user
        Result.query.filter_by(player_id=user_id).delete()
        
        # Delete session player type selections
        SessionPlayerType.query.filter_by(user_id=user_id).delete()
        
        # Delete player progress
        PlayerProgress.query.filter_by(user_id=user_id).delete()
        
        # Remove user from all cohorts
        CohortMember.query.filter_by(user_id=user_id).delete()
        
        # Delete activity logs for this user (CASCADE should handle this, but explicit is better)
        ActivityLog.query.filter_by(user_id=user_id).delete()
        
        # Delete cohorts where user is trainer
        for cohort in Cohort.query.filter_by(trainer_id=user_id).all():
            # First delete all members of this cohort
            CohortMember.query.filter_by(cohort_id=cohort.id).delete()
            # Delete sessions in this cohort
            for session in Session.query.filter_by(cohort_id=cohort.id).all():
                # Delete session-related data
                Forecast.query.filter_by(session_id=session.id).delete()
                Result.query.filter_by(session_id=session.id).delete()
                SessionPlayerType.query.filter_by(session_id=session.id).delete()
                SessionAllowedType.query.filter_by(session_id=session.id).delete()
                ActivityLog.query.filter_by(session_id=session.id).delete()
                db.session.delete(session)
            # Then delete cohort campaigns
            CohortCampaign.query.filter_by(cohort_id=cohort.id).delete()
            # Delete activity logs for this cohort
            ActivityLog.query.filter_by(cohort_id=cohort.id).delete()
            # Finally delete the cohort itself
            db.session.delete(cohort)
        
        # Delete campaigns created by this user (if designer)
        for campaign in Campaign.query.filter_by(designer_id=user_id).all():
            # Delete player progress for this campaign
            PlayerProgress.query.filter_by(campaign_id=campaign.id).delete()
            # Delete campaign scenarios first
            CampaignScenario.query.filter_by(campaign_id=campaign.id).delete()
            # Delete cohort campaigns
            CohortCampaign.query.filter_by(campaign_id=campaign.id).delete()
            # Delete the campaign
            db.session.delete(campaign)

        # Finally delete the user
        db.session.delete(user)
        db.session.commit()
        return {"status": "ok", "message": f"User {user.email} deleted"}


# (Removed duplicate UserDelete route with unreachable code)


@ns.route("/invites")
class Invites(Resource):
    @jwt_required()
    @role_required("admin")
    @ns.expect(invite_in, validate=True)
    def post(self):
        data = request.json
        email = data["email"].strip().lower()
        try:
            role = Role(data["role"])
        except ValueError:
            ns.abort(HTTPStatus.BAD_REQUEST, "Invalid role")

        inv = Invite.generate(email=email, role=role, days_valid=7)
        db.session.add(inv)
        db.session.commit()

        # try to send invite email (best-effort)
        email_sent, error = mailer.send_invite_email(inv.email, f"/register?token={inv.token}&email={inv.email}", inv.role.value)

        return {
            "status": "ok",
            "invite": {
                "email": inv.email,
                "role": inv.role.value,
                "token": inv.token,
                "expires_at": inv.expires_at.isoformat() + "Z",
                "link": f"/register?token={inv.token}&email={inv.email}",
                "email_sent": bool(email_sent),
                "email_error": (None if email_sent else error),
            },
        }, HTTPStatus.CREATED

@ns.route("/activity/summary")
class ActivitySummary(Resource):
    @jwt_required()
    @role_required("admin")
    def get(self):
        """Get activity summary KPIs for dashboard."""
        period = request.args.get("period", "30d")

        # Calculate date range
        days = 30
        if period == "7d":
            days = 7
        elif period == "90d":
            days = 90

        from_date = datetime.utcnow() - timedelta(days=days)

        # Total users
        total_users = User.query.count()

        # Active users (logged in during period)
        active_users = (
            db.session.query(func.count(func.distinct(ActivityLog.user_id)))
            .filter(ActivityLog.action_type == "login")
            .filter(ActivityLog.timestamp >= from_date)
            .scalar()
            or 0
        )

        # Active users 7d (for comparison)
        from_7d = datetime.utcnow() - timedelta(days=7)
        active_7d = (
            db.session.query(func.count(func.distinct(ActivityLog.user_id)))
            .filter(ActivityLog.action_type == "login")
            .filter(ActivityLog.timestamp >= from_7d)
            .scalar()
            or 0
        )

        # Sessions started
        sessions_started = Session.query.filter(Session.started_at >= from_date).count()

        # Sessions completed (status ended within period)
        sessions_completed = Session.query.filter(
            Session.status == SessionStatus.ended,
            Session.updated_at >= from_date,
        ).count()

        # Total forecasts
        total_forecasts = Forecast.query.count()

        # Average forecasts per session
        avg_forecasts = 0
        if sessions_started > 0:
            forecast_count = (
                db.session.query(func.count(Forecast.id))
                .join(Session)
                .filter(Session.started_at >= from_date)
                .scalar()
                or 0
            )
            avg_forecasts = round(forecast_count / sessions_started, 2)

        return {
            "total_users": total_users,
            "active_users_7d": active_7d,
            "active_users_30d": active_users if days >= 30 else 0,
            "sessions_started": sessions_started,
            "sessions_completed": sessions_completed,
            "avg_forecasts_per_session": avg_forecasts,
            "total_forecasts": total_forecasts,
            "period": period,
        }


@ns.route("/activity/timeseries")
class ActivityTimeseries(Resource):
    @jwt_required()
    @role_required("admin")
    def get(self):
        """Get activity timeseries data for charts."""
        metric = request.args.get("metric", "logins")
        period = request.args.get("period", "30d")
        interval = request.args.get("interval", "daily")
        
        # Calculate date range
        days = 30
        if period == "7d":
            days = 7
        elif period == "90d":
            days = 90
        
        from_date = datetime.utcnow() - timedelta(days=days)
        
        data = []
        
        if metric == "logins":
            # Count logins per day
            results = db.session.query(
                func.date_trunc('day', ActivityLog.timestamp).label('date'),
                func.count(ActivityLog.id).label('count')
            ).filter(
                ActivityLog.action_type == 'login',
                ActivityLog.timestamp >= from_date
            ).group_by('date').order_by('date').all()
            
            data = [{"date": r.date.strftime("%Y-%m-%d"), "count": r.count} for r in results]
        
        elif metric == "registrations":
            # Count registrations per day
            results = db.session.query(
                func.date_trunc('day', User.created_at).label('date'),
                func.count(User.id).label('count')
            ).filter(
                User.created_at >= from_date
            ).group_by('date').order_by('date').all()
            
            data = [{"date": r.date.strftime("%Y-%m-%d"), "count": r.count} for r in results]
        
        elif metric == "sessions":
            # Count sessions per day
            results = db.session.query(
                func.date_trunc('day', Session.started_at).label('date'),
                func.count(Session.id).label('count')
            ).filter(
                Session.started_at >= from_date
            ).group_by('date').order_by('date').all()
            
            data = [{"date": r.date.strftime("%Y-%m-%d"), "count": r.count} for r in results]
        
        return {
            "metric": metric,
            "interval": interval,
            "data": data
        }


@ns.route("/activity/recent")
class ActivityRecent(Resource):
    @jwt_required()
    @role_required("admin")
    def get(self):
        """Get recent activity across all users."""
        limit = request.args.get("limit", 50, type=int)
        
        activities = ActivityLog.query.order_by(ActivityLog.timestamp.desc()).limit(limit).all()
        
        result = []
        for activity in activities:
            user = User.query.get(activity.user_id)
            result.append({
                "id": activity.id,
                "timestamp": activity.timestamp.isoformat() + "Z" if activity.timestamp else None,
                "user_id": activity.user_id,
                "user_email": user.email if user else "Unknown",
                "action_type": activity.action_type,
                "session_id": activity.session_id,
                "cohort_id": activity.cohort_id,
                "details": activity.details or {}
            })
        
        return {"activities": result, "total": len(result)}


@ns.route("/sessions")
class AdminSessions(Resource):
    @jwt_required()
    @role_required("admin")
    def get(self):
        """Get all sessions with filters for admin management."""
        status_filter = request.args.get("status", "")
        scenario_id = request.args.get("scenario_id", type=int)
        date_from = request.args.get("date_from", "")
        date_to = request.args.get("date_to", "")
        limit = request.args.get("limit", 100, type=int)
        offset = request.args.get("offset", 0, type=int)
        
        query = Session.query
        
        # Apply filters
        if status_filter:
            try:
                status_enum = SessionStatus(status_filter)
                query = query.filter(Session.status == status_enum)
            except ValueError:
                pass
        
        if scenario_id:
            query = query.filter(Session.scenario_id == scenario_id)
        
        if date_from:
            try:
                from_date = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                query = query.filter(Session.started_at >= from_date)
            except ValueError:
                pass
        
        if date_to:
            try:
                to_date = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                query = query.filter(Session.started_at <= to_date)
            except ValueError:
                pass
        
        # Get total count before pagination
        total = query.count()
        
        # Pagination
        sessions = query.order_by(Session.started_at.desc()).limit(limit).offset(offset).all()
        
        result = []
        for session in sessions:
            scenario = Scenario.query.get(session.scenario_id) if session.scenario_id else None
            cohort = Cohort.query.get(session.cohort_id) if session.cohort_id else None
            
            # Count players in this session (distinct players who submitted forecasts)
            from .models import Forecast
            player_count = db.session.query(Forecast.player_id).filter_by(session_id=session.id).distinct().count()
            
            result.append({
                "id": session.id,
                "scenario_id": session.scenario_id,
                "scenario_name": scenario.name if scenario else "Deleted Scenario",
                "cohort_id": session.cohort_id,
                "cohort_name": cohort.name if cohort else ("Solo" if session.mode == "solo" else "Unknown"),
                "status": session.status.value if session.status else "unknown",
                "mode": session.mode,
                "created_at": session.started_at.isoformat() + "Z" if session.started_at else None,
                "updated_at": session.updated_at.isoformat() + "Z" if session.updated_at else None,
                "round": session.round,
                "player_count": player_count
            })
        
        return {"sessions": result, "total": total, "limit": limit, "offset": offset}
    
    cleanup_in = ns.model(
        "SessionCleanup",
        {
            "delete_all": fields.Boolean(description="If true, delete ALL sessions", default=False),
            "status": fields.String(description="(Deprecated) Filter by status"),
            "older_than_days": fields.Integer(description="(Deprecated) Delete sessions older than N days", default=90),
        },
    )
    
    @jwt_required()
    @role_required("admin")
    @ns.expect(cleanup_in, validate=True)
    def post(self):
        """Bulk cleanup: delete ALL sessions and their related data. Ignores filters."""
        # Collect all session ids
        session_ids = [sid for (sid,) in db.session.query(Session.id).all()]
        count = len(session_ids)
        if count == 0:
            return {"deleted_count": 0}, HTTPStatus.OK
        # Delete dependent rows explicitly to avoid FK issues
        Forecast.query.filter(Forecast.session_id.in_(session_ids)).delete(synchronize_session=False)
        Result.query.filter(Result.session_id.in_(session_ids)).delete(synchronize_session=False)
        SessionPlayerType.query.filter(SessionPlayerType.session_id.in_(session_ids)).delete(synchronize_session=False)
        SessionAllowedType.query.filter(SessionAllowedType.session_id.in_(session_ids)).delete(synchronize_session=False)
        ActivityLog.query.filter(ActivityLog.session_id.in_(session_ids)).delete(synchronize_session=False)
        Session.query.filter(Session.id.in_(session_ids)).delete(synchronize_session=False)
        db.session.commit()
        return {"deleted_count": count}, HTTPStatus.OK


@ns.route("/sessions/<int:session_id>")
class AdminSessionDetail(Resource):
    @jwt_required()
    @role_required("admin")
    def delete(self, session_id):
        """Delete a specific session."""
        session = Session.query.get(session_id)
        if not session:
            ns.abort(HTTPStatus.NOT_FOUND, "Session not found")
        
        db.session.delete(session)
        db.session.commit()
        
        return "", HTTPStatus.NO_CONTENT
