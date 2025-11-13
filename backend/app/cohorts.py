from http import HTTPStatus
import csv
import io
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity

from .extensions import db
from .models import Cohort, CohortMember, User, Role, Invite, Campaign, CohortCampaign, Session
from .utils import role_required


ns = Namespace("cohorts", description="Cohorts & player assignment")

cohort_in = ns.model("CohortIn", {"name": fields.String(required=True)})

csv_in = ns.model("PlayersCSV", {"csv": fields.String(required=True, description="One email per line")})


@ns.route("")
class Cohorts(Resource):
    @jwt_required()
    @role_required("trainer", "admin")
    def get(self):
        rows = Cohort.query.order_by(Cohort.id.desc()).all()
        return [{"id": c.id, "name": c.name, "trainer_id": c.trainer_id} for c in rows]

    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(cohort_in, validate=True)
    def post(self):
        trainer_id = int(get_jwt_identity())
        c = Cohort(name=request.json["name"], trainer_id=trainer_id)
        db.session.add(c)
        db.session.commit()
        return {"id": c.id, "name": c.name}, HTTPStatus.CREATED


@ns.route("/<int:cid>")
class CohortItem(Resource):
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
        # Orphan sessions (set cohort_id to NULL to preserve historical data)
        Session.query.filter_by(cohort_id=cid).update({"cohort_id": None})
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
        return [{"user_id": m.user_id, "email": u.email, "name": getattr(u, 'name', None)} for m, u in members]
    
    @jwt_required()
    @role_required("trainer", "admin")
    @ns.expect(csv_in, validate=True)
    def post(self, cid: int):
        c = Cohort.query.get_or_404(cid)
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