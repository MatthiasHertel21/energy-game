from http import HTTPStatus
import csv
import io
from flask import request, make_response
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime

from .extensions import db
from sqlalchemy import func, case
from .models import Cohort, CohortMember, User, Role, Invite, Campaign, CohortCampaign, Session, ActivityLog, Forecast, Result, SessionAllowedType, SessionPlayerType
from .utils import role_required
from .config import Config


ns = Namespace("cohorts", description="Cohorts & player assignment")

cohort_in = ns.model("CohortIn", {"name": fields.String(required=True)})

csv_in = ns.model("PlayersCSV", {"csv": fields.String(required=True, description="One email per line")})


@ns.route("")
class Cohorts(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self):
        cohorts = (
            db.session.query(Cohort)
            .filter(~Cohort.name.like('Solo %'))  # Exclude solo cohorts
            .order_by(Cohort.id.desc())
            .all()
        )
        
        result = []
        for cohort in cohorts:
            # Get trainer email
            trainer = User.query.get(cohort.trainer_id)
            
            # Get members count
            members_count = CohortMember.query.filter_by(cohort_id=cohort.id).count()
            
            # Get campaigns with scenario counts
            campaign_mappings = (
                db.session.query(CohortCampaign, Campaign)
                .join(Campaign, Campaign.id == CohortCampaign.campaign_id)
                .filter(CohortCampaign.cohort_id == cohort.id)
                .filter(CohortCampaign.active == True)
                .all()
            )
            
            campaigns_info = []
            for mapping, campaign in campaign_mappings:
                # Count scenarios in this campaign
                from .models import CampaignScenario
                scenario_count = CampaignScenario.query.filter_by(campaign_id=campaign.id).count()
                campaigns_info.append({
                    "id": campaign.id,
                    "name": campaign.name,
                    "scenario_count": scenario_count
                })
            
            result.append({
                "id": cohort.id,
                "name": cohort.name,
                "trainer_id": cohort.trainer_id,
                "trainer_email": trainer.email if trainer else None,
                "members_count": members_count,
                "campaigns": campaigns_info
            })
        
        return result

    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(cohort_in, validate=True)
    def post(self):
        # Check system limit for max cohorts
        cohort_count = Cohort.query.count()
        if cohort_count >= Config.MAX_COHORTS:
            ns.abort(HTTPStatus.FORBIDDEN, f"System limit reached: maximum {Config.MAX_COHORTS} cohorts allowed")
        
        trainer_id = int(get_jwt_identity())
        c = Cohort(name=request.json["name"], trainer_id=trainer_id)
        db.session.add(c)
        db.session.commit()
        return {"id": c.id, "name": c.name}, HTTPStatus.CREATED


@ns.route("/<int:cid>")
class CohortItem(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, cid: int):
        """Get cohort details including invite token."""
        c = Cohort.query.get_or_404(cid)
        
        # Find or create a valid invite token for this cohort
        invite = Invite.query.filter_by(cohort_id=cid, used=False).filter(
            Invite.expires_at >= datetime.utcnow()
        ).first()
        
        if not invite:
            # Create a new invite token (no specific email, valid for 365 days)
            import uuid
            from datetime import timedelta
            token = uuid.uuid4().hex
            expires = datetime.utcnow() + timedelta(days=365)
            invite = Invite(
                email="",  # Empty email means it can be used by anyone
                role=Role.player,
                token=token,
                expires_at=expires,
                used=False,
                cohort_id=cid
            )
            db.session.add(invite)
            db.session.commit()
        
        return {
            "id": c.id,
            "name": c.name,
            "trainer_id": c.trainer_id,
            "invite_token": invite.token
        }
    
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(cohort_in, validate=True)
    def patch(self, cid: int):
        """Update cohort name."""
        c = Cohort.query.get_or_404(cid)
        if "name" in request.json:
            c.name = request.json["name"]
        db.session.commit()
        return {"id": c.id, "name": c.name}

    @jwt_required()
    @role_required("trainer", "admin")
    def delete(self, cid: int):
        """Delete cohort (cascading delete on members and campaign mappings, sessions orphaned)."""
        c = Cohort.query.get_or_404(cid)
        # Delete dependent data for sessions in this cohort, then sessions
        session_ids = [sid for (sid,) in db.session.query(Session.id).filter_by(cohort_id=cid).all()]
        if session_ids:
            Forecast.query.filter(Forecast.session_id.in_(session_ids)).delete(synchronize_session=False)
            Result.query.filter(Result.session_id.in_(session_ids)).delete(synchronize_session=False)
            SessionPlayerType.query.filter(SessionPlayerType.session_id.in_(session_ids)).delete(synchronize_session=False)
            SessionAllowedType.query.filter(SessionAllowedType.session_id.in_(session_ids)).delete(synchronize_session=False)
            Session.query.filter(Session.id.in_(session_ids)).delete(synchronize_session=False)
        # Delete members
        CohortMember.query.filter_by(cohort_id=cid).delete()
        # Delete campaign mappings
        CohortCampaign.query.filter_by(cohort_id=cid).delete()
        # Delete cohort
        db.session.delete(c)
        db.session.commit()
        return "", HTTPStatus.NO_CONTENT


@ns.route("/<int:cid>/players")
class CohortPlayers(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, cid: int):
        """List all members of a cohort."""
        members = (
            db.session.query(CohortMember, User)
            .join(User, User.id == CohortMember.user_id)
            .filter(CohortMember.cohort_id == cid)
            .all()
        )
        
        # Get solo session counts for all members
        user_ids = [m.user_id for m, u in members]
        solo_session_counts = {}
        if user_ids:
            # Count sessions in cohorts that start with "Solo "
            counts = (
                db.session.query(
                    Result.player_id,
                    func.count(func.distinct(Result.session_id)).label('count')
                )
                .join(Session, Session.id == Result.session_id)
                .join(Cohort, Cohort.id == Session.cohort_id)
                .filter(Result.player_id.in_(user_ids))
                .filter(Cohort.name.like('Solo %'))
                .group_by(Result.player_id)
                .all()
            )
            solo_session_counts = {user_id: count for user_id, count in counts}
        
        return [{
            "user_id": m.user_id, 
            "email": u.email, 
            "name": getattr(u, 'name', None),
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "solo_sessions": solo_session_counts.get(m.user_id, 0)
        } for m, u in members]
    
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(csv_in, validate=True)
    def post(self, cid: int):
        c = Cohort.query.get_or_404(cid)
        
        # Check current cohort size
        current_members = CohortMember.query.filter_by(cohort_id=cid).count()
        
        content = request.json["csv"]
        f = io.StringIO(content)
        reader = csv.reader(f)
        added = 0
        invited = 0
        for row in reader:
            if not row:
                continue
            email = row[0].strip().lower()
            if not email:
                continue
            
            # Check if adding would exceed limit
            if current_members + added >= Config.MAX_PLAYERS_PER_COHORT:
                ns.abort(HTTPStatus.FORBIDDEN, f"Cohort size limit reached: maximum {Config.MAX_PLAYERS_PER_COHORT} players per cohort")
            
            user = User.query.filter_by(email=email).first()
            if user:
                # ensure role is player
                if user.role == Role.player:
                    if not CohortMember.query.filter_by(cohort_id=cid, user_id=user.id).first():
                        db.session.add(CohortMember(cohort_id=cid, user_id=user.id))
                        added += 1
            else:
                inv = Invite.generate(email=email, role=Role.player)
                inv.cohort_id = cid
                db.session.add(inv)
                invited += 1
        db.session.commit()
        return {"added": added, "invited": invited}


# Backward compatibility alias for older frontend route
@ns.route("/<int:cid>/members")
class CohortMembersAlias(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, cid: int):
        members = (
            db.session.query(CohortMember, User)
            .join(User, User.id == CohortMember.user_id)
            .filter(CohortMember.cohort_id == cid)
            .all()
        )
        return [{"user_id": m.user_id, "email": u.email, "name": getattr(u, 'name', None)} for m, u in members]


@ns.route("/<int:cid>/players/<int:user_id>")
class CohortPlayerItem(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def delete(self, cid: int, user_id: int):
        """Remove player from cohort."""
        member = CohortMember.query.filter_by(cohort_id=cid, user_id=user_id).first_or_404()
        db.session.delete(member)
        db.session.commit()
        return "", HTTPStatus.NO_CONTENT


@ns.route("/<int:cid>/campaigns")
class CohortCampaigns(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, cid: int):
        """List all campaigns with visibility/active flags for this cohort."""
        # left join campaigns with mapping
        rows = (
            db.session.query(Campaign, CohortCampaign)
            .join(CohortCampaign, (CohortCampaign.campaign_id == Campaign.id) & (CohortCampaign.cohort_id == cid), isouter=True)
            .order_by(Campaign.id.desc())
            .all()
        )
        out = []
        for camp, maprow in rows:
            out.append({
                "campaign_id": camp.id,
                "name": camp.name,
                "published": bool(camp.published),
                "visible": bool(maprow.visible) if maprow is not None else False,
                "active": bool(maprow.active) if maprow is not None else False,
            })
        return out


campaign_patch_in = ns.model("CohortCampaignPatch", {
    "visible": fields.Boolean(required=False),
    "active": fields.Boolean(required=False),
})


@ns.route("/<int:cid>/campaigns/<int:camp_id>")
class CohortCampaignItem(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(campaign_patch_in, validate=True)
    def patch(self, cid: int, camp_id: int):
        body = request.json or {}
        row = CohortCampaign.query.filter_by(cohort_id=cid, campaign_id=camp_id).first()
        created = False
        if not row:
            row = CohortCampaign(cohort_id=cid, campaign_id=camp_id, visible=False, active=False)
            created = True
        if "visible" in body:
            row.visible = bool(body.get("visible"))
        if "active" in body:
            row.active = bool(body.get("active"))
        db.session.add(row)
        db.session.commit()
        return {"campaign_id": camp_id, "visible": row.visible, "active": row.active, "created": created}

@ns.route("/<int:cid>/activity")
class CohortActivity(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self, cid: int):
        """Get activity timeline for cohort with optional filters and CSV export."""
        # Validate cohort exists
        Cohort.query.get_or_404(cid)
        
        # Get query parameters
        from_date = request.args.get("from")
        to_date = request.args.get("to")
        user_id = request.args.get("user_id", type=int)
        action_type = request.args.get("action_type")
        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)
        format_type = request.args.get("format", "json")
        
        # Build query
        query = ActivityLog.query.filter_by(cohort_id=cid)
        
        if from_date:
            try:
                from_dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                query = query.filter(ActivityLog.timestamp >= from_dt)
            except ValueError:
                pass
        
        if to_date:
            try:
                to_dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
                query = query.filter(ActivityLog.timestamp <= to_dt)
            except ValueError:
                pass
        
        if user_id:
            query = query.filter_by(user_id=user_id)
        
        if action_type:
            query = query.filter_by(action_type=action_type)
        
        # Get total count
        total = query.count()
        
        # Order and paginate
        query = query.order_by(ActivityLog.timestamp.desc())
        
        if format_type == "csv":
            # CSV export - get all matching results
            activities = query.all()
            
            # Create CSV
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["Timestamp", "User Email", "User Name", "Action Type", "Session ID", "Details"])
            
            for activity in activities:
                user = User.query.get(activity.user_id)
                user_email = user.email if user else "Unknown"
                user_name = user_email.split("@")[0] if user else "Unknown"
                details_str = str(activity.details) if activity.details else ""
                
                writer.writerow([
                    activity.timestamp.isoformat() + "Z" if activity.timestamp else "",
                    user_email,
                    user_name,
                    activity.action_type,
                    activity.session_id or "",
                    details_str
                ])
            
            response = make_response(output.getvalue())
            response.headers["Content-Type"] = "text/csv"
            response.headers["Content-Disposition"] = f"attachment; filename=cohort_{cid}_activity.csv"
            return response
        
        # JSON response with pagination
        activities = query.limit(limit).offset(offset).all()
        
        result = []
        for activity in activities:
            user = User.query.get(activity.user_id)
            result.append({
                "id": activity.id,
                "timestamp": activity.timestamp.isoformat() + "Z" if activity.timestamp else None,
                "user_id": activity.user_id,
                "user_email": user.email if user else "Unknown",
                "user_name": user.email.split("@")[0] if user else "Unknown",
                "action_type": activity.action_type,
                "session_id": activity.session_id,
                "details": activity.details or {}
            })
        
        return {
            "activities": result,
            "total": total,
            "limit": limit,
            "offset": offset
        }
