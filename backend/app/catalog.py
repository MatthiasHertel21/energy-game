from http import HTTPStatus
from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required, get_jwt_identity

from .extensions import db
from .models import Campaign, CampaignScenario, Scenario, PlayerProgress, PlayerProgressStatus, CohortCampaign, CohortMember


ns = Namespace("catalog", description="Player catalog of published campaigns")


@ns.route("/campaigns")
class CampaignList(Resource):
    @jwt_required()
    def get(self):
        uid = int(get_jwt_identity())
        # Optional filters
        from flask import request as _rq
        cohort_id = _rq.args.get('cohort_id', type=int)
        only_active = str(_rq.args.get('active', '0')).lower() in ('1','true','yes')
        for_me = str(_rq.args.get('for_me', '0')).lower() in ('1','true','yes')

        q = Campaign.query.filter_by(published=True)
        # Filter by cohort mapping (visible[/active])
        if cohort_id:
            q = q.join(CohortCampaign, CohortCampaign.campaign_id == Campaign.id, isouter=False).\
                filter(CohortCampaign.cohort_id == cohort_id, CohortCampaign.visible == True)
            if only_active:
                q = q.filter(CohortCampaign.active == True)
        elif for_me:
            # campaigns visible for any cohort the user belongs to
            # user cohorts
            sub = _rq.app.db.session.query(CohortMember.cohort_id).filter(CohortMember.user_id == uid).subquery() if False else None
            # SQLAlchemy on this setup: use db from extensions
            from .extensions import db
            sub = db.session.query(CohortMember.cohort_id).filter(CohortMember.user_id == uid).subquery()
            q = q.join(CohortCampaign, CohortCampaign.campaign_id == Campaign.id, isouter=False).\
                filter(CohortCampaign.cohort_id.in_(sub), CohortCampaign.visible == True)
            if only_active:
                q = q.filter(CohortCampaign.active == True)

        rows = q.order_by(Campaign.id.desc()).all()
        out = []
        for c in rows:
            total = db.session.query(CampaignScenario.id).filter_by(campaign_id=c.id).count()
            completed = db.session.query(PlayerProgress.id).filter_by(user_id=uid, campaign_id=c.id, status=PlayerProgressStatus.completed).count()
            out.append({
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "cover_image_url": c.cover_image_url,
                "scenarios_count": total,
                "progress": {"completed": completed, "total": total},
            })
        return out, HTTPStatus.OK


@ns.route("/campaigns/<int:cid>")
class CampaignDetail(Resource):
    @jwt_required()
    def get(self, cid: int):
        uid = int(get_jwt_identity())
        c = Campaign.query.filter_by(id=cid, published=True).first_or_404()
        mappings = (
            db.session.query(CampaignScenario, Scenario)
            .join(Scenario, Scenario.id == CampaignScenario.scenario_id)
            .filter(CampaignScenario.campaign_id == cid)
            .order_by(CampaignScenario.order_index.asc())
            .all()
        )
        scenarios = []
        for cs, sc in mappings:
            pp = PlayerProgress.query.filter_by(user_id=uid, campaign_id=cid, scenario_id=sc.id).first()
            scenarios.append({
                "scenario_id": sc.id,
                "name": sc.name,
                "order_index": cs.order_index,
                "solo_enabled": cs.solo_enabled,
                "cohort_enabled": cs.cohort_enabled,
                "status": (pp.status.value if pp else PlayerProgressStatus.not_started.value),
            })
        return {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "cover_image_url": c.cover_image_url,
            "scenarios": scenarios,
        }, HTTPStatus.OK
