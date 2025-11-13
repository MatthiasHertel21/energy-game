from http import HTTPStatus
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity

from .extensions import db
from .models import Campaign, Scenario, Role, ReferenceRun
from .models import CampaignScenario
from .utils import role_required
from .device_types import DEVICE_SPECS, DeviceType, validate_device
import os

try:
    from PIL import Image
except Exception:
    Image = None


ns = Namespace("kse", description="Kampagnien/Szenarieneditor")

campaign_in = ns.model(
    "CampaignIn",
    {
        "name": fields.String(required=True),
        "description": fields.String,
    },
)

scenario_in = ns.model(
    "ScenarioIn",
    {
        "name": fields.String(required=True),
        "campaign_id": fields.Integer,
        "config": fields.Raw(required=True, description="Scenario JSON config"),
    },
)

validate_out = ns.model(
    "ValidationResult",
    {
        "ok": fields.Boolean,
        "errors": fields.List(fields.String),
    },
)

env_in = ns.model(
    "EnvGenIn",
    {
        "groups": fields.Raw(required=True, description="e.g., {'solar':40,'wind':30,'gas':30}"),
        "zone_split": fields.Integer(required=False, description="percent in zone 1 (0..100)", default=50),
        "base_volume_mwh": fields.Integer(required=False, default=20000),
    },
)


def validate_config(cfg: dict) -> list[str]:
    errors = []
    zones = cfg.get("grid", {}).get("zones", 2)
    if not (1 <= zones <= 5):
        errors.append("Zones must be 1–5")
    # ATC matrix symmetry and size
    atc = cfg.get("grid", {}).get("atc")
    if atc is not None:
        if not (isinstance(atc, list) and len(atc) == zones and all(isinstance(row, list) and len(row) == zones for row in atc)):
            errors.append("ATC must be zones×zones matrix")
        else:
            for i in range(zones):
                if atc[i][i] != 0:
                    errors.append("ATC diagonal must be 0")
                for j in range(zones):
                    if atc[i][j] != atc[j][i]:
                        errors.append("ATC must be symmetric")
    weights = cfg.get("scoring", {}).get("weights", {"profit": 0.6, "imbalance": 0.3, "curtailment": 0.1})
    if abs(sum(weights.values()) - 1.0) > 1e-6:
        errors.append("Scoring weights must sum to 1.0")
    horizon = cfg.get("general", {}).get("horizon_hours", 24)
    span = cfg.get("general", {}).get("round_span_hours", 6)
    rounds = cfg.get("general", {}).get("rounds", 4)
    if span <= 0 or horizon // span != rounds:
        errors.append("horizon ÷ round_span must equal rounds")
    
    # Validate fake_date and start_time formats
    fake_date = cfg.get("general", {}).get("fake_date")
    if fake_date:
        import re
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', fake_date):
            errors.append("fake_date must be YYYY-MM-DD format")
    
    start_time = cfg.get("general", {}).get("start_time")
    if start_time:
        import re
        if not re.match(r'^\d{2}:\d{2}$', start_time):
            errors.append("start_time must be HH:MM format")
    fh = cfg.get("general", {}).get("forecast_horizon_hours", 48)
    if fh is None or int(fh) <= 0:
        errors.append("forecast_horizon_hours must be > 0")
    else:
        try:
            if int(fh) < int(horizon):
                errors.append("forecast_horizon_hours must be >= horizon_hours")
        except Exception:
            pass
    
    # Validate devices
    devices = cfg.get("devices", [])
    if isinstance(devices, list):
        for device in devices:
            device_errors = validate_device(device)
            errors.extend(device_errors)

    # Validate player_types (planned)
    player_types = cfg.get("player_types")
    if player_types is not None:
        if not isinstance(player_types, list):
            errors.append("player_types must be a list")
        else:
            ids = set()
            dev_ids = {d.get("id") for d in (devices or []) if isinstance(d, dict)}
            for pt in player_types:
                if not isinstance(pt, dict):
                    errors.append("player_types[] must be objects")
                    continue
                tid = (pt.get("id") or "").strip()
                name = (pt.get("name") or "").strip()
                if not tid:
                    errors.append("player_types[].id is required")
                if tid in ids:
                    errors.append(f"player_types id duplicate: {tid}")
                ids.add(tid)
                if not name:
                    errors.append(f"player_types[{tid}].name is required")
                dv = pt.get("devices", [])
                if not isinstance(dv, list):
                    errors.append(f"player_types[{tid}].devices must be a list")
                else:
                    unknown = [x for x in dv if x not in dev_ids]
                    if unknown:
                        errors.append(f"player_types[{tid}].devices unknown: {', '.join(map(str, unknown))}")
    
    # Optional storage block: not used by engine anymore, but validate if present to catch config errors in legacy scenarios
    stor = cfg.get("storage", {}) or {}
    if "efficiency" in stor:
        try:
            eff = float(stor.get("efficiency"))
            if not (0 < eff <= 1):
                errors.append("storage.efficiency must be in (0,1]")
        except Exception:
            errors.append("storage.efficiency must be numeric")
    if "initial_soc_pct" in stor:
        try:
            soc = float(stor.get("initial_soc_pct"))
            if not (0 <= soc <= 100):
                errors.append("storage.initial_soc_pct must be in [0, 100]")
        except Exception:
            errors.append("storage.initial_soc_pct must be numeric")
    
    # Player Zone (all players in one zone)
    pz = cfg.get("general", {}).get("player_zone")
    if pz is not None:
        try:
            if not (1 <= int(pz) <= int(zones)):
                errors.append("general.player_zone must be within [1, zones]")
        except Exception:
            errors.append("general.player_zone must be integer")
    
    return errors


@ns.route("/campaigns")
class Campaigns(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self):
        rows = Campaign.query.order_by(Campaign.id.desc()).all()
        return [
            {"id": c.id, "name": c.name, "description": c.description, "designer_id": c.designer_id}
            for c in rows
        ]

    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(campaign_in, validate=True)
    def post(self):
        data = request.json
        designer_id = int(get_jwt_identity())
        c = Campaign(
            name=data["name"],
            description=data.get("description", ""),
            designer_id=designer_id,
        )
        db.session.add(c)
        db.session.commit()
        return {"id": c.id, "name": c.name}, HTTPStatus.CREATED


@ns.route("/campaigns/<int:cid>")
class CampaignItem(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def patch(self, cid: int):
        c = Campaign.query.get_or_404(cid)
        body = request.json or {}
        if "name" in body:
            c.name = body.get("name") or c.name
        if "description" in body:
            c.description = body.get("description") or c.description
        if "published" in body:
            c.published = bool(body.get("published"))
        db.session.add(c)
        db.session.commit()
        return {"status": "ok"}

    @jwt_required()
    @role_required("designer", "admin")
    def delete(self, cid: int):
        """Delete a campaign if it is not published. Removes mappings and cohort visibility entries."""
        c = Campaign.query.get_or_404(cid)
        if c.published:
            return {"error": "Cannot delete a published campaign. Unpublish first."}, HTTPStatus.CONFLICT
        # Remove mappings and cohort visibility
        from .models import CampaignScenario, CohortCampaign
        CampaignScenario.query.filter_by(campaign_id=cid).delete(synchronize_session=False)
        CohortCampaign.query.filter_by(campaign_id=cid).delete(synchronize_session=False)
        db.session.delete(c)
        db.session.commit()
        return {"status": "deleted"}, HTTPStatus.NO_CONTENT


@ns.route("/campaigns/<int:cid>/scenarios")
class CampaignScenarios(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self, cid: int):
        """List all scenarios assigned to this campaign with their order and flags"""
        Campaign.query.get_or_404(cid)  # verify campaign exists
        mappings = (
            db.session.query(CampaignScenario, Scenario)
            .join(Scenario, Scenario.id == CampaignScenario.scenario_id)
            .filter(CampaignScenario.campaign_id == cid)
            .order_by(CampaignScenario.order_index.asc())
            .all()
        )
        return [
            {
                "scenario_id": s.id,
                "name": s.name,
                "order_index": cs.order_index,
                "solo_enabled": cs.solo_enabled,
                "cohort_enabled": cs.cohort_enabled,
            }
            for cs, s in mappings
        ], HTTPStatus.OK

    @jwt_required()
    @role_required("designer", "admin")
    def post(self, cid: int):
        """Assign scenario to campaign with order and flags"""
        Campaign.query.get_or_404(cid)
        data = request.json
        scenario_id = data.get("scenario_id")
        if not scenario_id:
            return {"error": "scenario_id required"}, HTTPStatus.BAD_REQUEST
        
        # Check if scenario exists
        Scenario.query.get_or_404(scenario_id)
        
        # Check if already assigned
        existing = CampaignScenario.query.filter_by(
            campaign_id=cid, scenario_id=scenario_id
        ).first()
        if existing:
            return {"error": "Scenario already assigned to this campaign"}, HTTPStatus.CONFLICT
        
        cs = CampaignScenario(
            campaign_id=cid,
            scenario_id=scenario_id,
            order_index=data.get("order_index", 0),
            solo_enabled=data.get("solo_enabled", True),
            cohort_enabled=data.get("cohort_enabled", True),
        )
        db.session.add(cs)
        db.session.commit()
        return {"status": "ok", "id": cs.id}, HTTPStatus.CREATED

    @jwt_required()
    @role_required("designer", "admin")
    def put(self, cid: int):
        """Update order and flags for all campaign scenarios (bulk reorder)"""
        Campaign.query.get_or_404(cid)
        data = request.json
        scenarios = data.get("scenarios", [])
        
        if not isinstance(scenarios, list):
            return {"error": "scenarios must be a list"}, HTTPStatus.BAD_REQUEST
        
        for item in scenarios:
            scenario_id = item.get("scenario_id")
            if not scenario_id:
                continue
            
            cs = CampaignScenario.query.filter_by(
                campaign_id=cid, scenario_id=scenario_id
            ).first()
            if not cs:
                continue
            
            if "order_index" in item:
                cs.order_index = int(item["order_index"])
            if "solo_enabled" in item:
                cs.solo_enabled = bool(item["solo_enabled"])
            if "cohort_enabled" in item:
                cs.cohort_enabled = bool(item["cohort_enabled"])
            
            db.session.add(cs)
        
        db.session.commit()
        return {"status": "ok"}, HTTPStatus.OK


@ns.route("/campaigns/<int:cid>/scenarios/<int:sid>")
class CampaignScenarioItem(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def delete(self, cid: int, sid: int):
        """Remove scenario from campaign"""
        cs = CampaignScenario.query.filter_by(
            campaign_id=cid, scenario_id=sid
        ).first_or_404()
        db.session.delete(cs)
        db.session.commit()
        return {"status": "ok"}, HTTPStatus.OK


@ns.route("/scenarios")
class Scenarios(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self):
        rows = Scenario.query.order_by(Scenario.id.desc()).all()
        return [
            {"id": s.id, "name": s.name, "campaign_id": s.campaign_id, "config": s.config}
            for s in rows
        ]

    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(scenario_in, validate=True)
    def post(self):
        data = request.json
        errors = validate_config(data.get("config", {}))
        if errors:
            return {"ok": False, "errors": errors}, HTTPStatus.BAD_REQUEST
        s = Scenario(name=data["name"], campaign_id=data.get("campaign_id"), config=data["config"])
        db.session.add(s)
        db.session.commit()
        return {"id": s.id, "name": s.name}, HTTPStatus.CREATED


assign_in = ns.model(
    "CampaignScenarioAssign",
    {
        "scenario_id": fields.Integer(required=True),
        "order_index": fields.Integer(required=False, default=0),
        "solo_enabled": fields.Boolean(required=False, default=True),
        "cohort_enabled": fields.Boolean(required=False, default=True),
    },
)


@ns.route("/campaigns/<int:cid>/scenarios")
class CampaignScenarios(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self, cid: int):
        rows = (
            db.session.query(CampaignScenario, Scenario)
            .join(Scenario, Scenario.id == CampaignScenario.scenario_id)
            .filter(CampaignScenario.campaign_id == cid)
            .order_by(CampaignScenario.order_index.asc())
            .all()
        )
        return [
            {
                "scenario_id": sc.id,
                "name": sc.name,
                "order_index": cs.order_index,
                "solo_enabled": cs.solo_enabled,
                "cohort_enabled": cs.cohort_enabled,
            }
            for cs, sc in rows
        ]

    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(assign_in, validate=True)
    def post(self, cid: int):
        body = request.json or {}
        cs = CampaignScenario(
            campaign_id=cid,
            scenario_id=int(body["scenario_id"]),
            order_index=int(body.get("order_index") or 0),
            solo_enabled=bool(body.get("solo_enabled", True)),
            cohort_enabled=bool(body.get("cohort_enabled", True)),
        )
        db.session.add(cs)
        db.session.commit()
        return {"status": "ok"}, HTTPStatus.CREATED


@ns.route("/campaigns/<int:cid>/scenarios/reorder")
class CampaignScenariosReorder(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def put(self, cid: int):
        arr = request.json or []
        for item in arr:
            scid = int(item.get("scenario_id"))
            idx = int(item.get("order_index"))
            cs = CampaignScenario.query.filter_by(campaign_id=cid, scenario_id=scid).first()
            if cs:
                cs.order_index = idx
                db.session.add(cs)
        db.session.commit()
        return {"status": "ok"}


@ns.route("/campaigns/<int:cid>/scenarios/<int:sid>")
class CampaignScenarioItem(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def patch(self, cid: int, sid: int):
        cs = CampaignScenario.query.filter_by(campaign_id=cid, scenario_id=sid).first_or_404()
        body = request.json or {}
        if "order_index" in body:
            cs.order_index = int(body.get("order_index") or cs.order_index)
        if "solo_enabled" in body:
            cs.solo_enabled = bool(body.get("solo_enabled"))
        if "cohort_enabled" in body:
            cs.cohort_enabled = bool(body.get("cohort_enabled"))
        db.session.add(cs)
        db.session.commit()
        return {"status": "ok"}

    @jwt_required()
    @role_required("designer", "admin")
    def delete(self, cid: int, sid: int):
        cs = CampaignScenario.query.filter_by(campaign_id=cid, scenario_id=sid).first_or_404()
        db.session.delete(cs)
        db.session.commit()
        return {"status": "ok"}


@ns.route("/campaigns/<int:cid>/image")
class CampaignImage(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def post(self, cid: int):
        c = Campaign.query.get_or_404(cid)
        if 'file' not in request.files:
            return {"error": "file required"}, HTTPStatus.BAD_REQUEST
        if Image is None:
            return {"error": "image processing not available"}, HTTPStatus.INTERNAL_SERVER_ERROR
        f = request.files['file']
        try:
            img = Image.open(f.stream).convert('RGB')
        except Exception:
            return {"error": "invalid image"}, HTTPStatus.BAD_REQUEST
        # center-crop to square
        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        # resize to max 640x640
        if side > 640:
            img = img.resize((640, 640))
        # ensure upload dir
        upload_dir = os.getenv('UPLOAD_DIR', '/app/uploads')
        dest_dir = os.path.join(upload_dir, 'campaigns')
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, f"{cid}.png")
        img.save(dest_path, format='PNG')
        c.cover_image_url = f"/uploads/campaigns/{cid}.png"
        db.session.add(c)
        db.session.commit()
        return {"cover_image_url": c.cover_image_url}


@ns.route("/scenarios/<int:sid>")
class ScenarioItem(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self, sid: int):
        s = Scenario.query.get_or_404(sid)
        return {"id": s.id, "name": s.name, "campaign_id": s.campaign_id, "config": s.config}

    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(scenario_in, validate=True)
    def put(self, sid: int):
        data = request.json
        errors = validate_config(data.get("config", {}))
        if errors:
            return {"ok": False, "errors": errors}, HTTPStatus.BAD_REQUEST
        s = Scenario.query.get_or_404(sid)
        s.name = data["name"]
        s.campaign_id = data.get("campaign_id")
        s.config = data["config"]
        db.session.add(s)
        db.session.commit()
        return {"status": "ok"}

    @jwt_required()
    @role_required("designer", "admin")
    def delete(self, sid: int):
        s = Scenario.query.get_or_404(sid)
        db.session.delete(s)
        db.session.commit()
        return {"status": "ok"}


@ns.route("/scenarios/<int:sid>/export")
class ScenarioExport(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self, sid: int):
        s = Scenario.query.get_or_404(sid)
        return {"id": s.id, "name": s.name, "campaign_id": s.campaign_id, "config": s.config}


@ns.route("/scenarios/import")
class ScenarioImport(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def post(self):
        data = request.json or {}
        name = data.get("name") or (data.get("config", {}).get("name")) or "Imported Scenario"
        config = data.get("config") or {}
        errors = validate_config(config)
        if errors:
            return {"ok": False, "errors": errors}, HTTPStatus.BAD_REQUEST
        s = Scenario(name=name, campaign_id=data.get("campaign_id"), config=config)
        db.session.add(s)
        db.session.commit()
        return {"id": s.id, "name": s.name}, HTTPStatus.CREATED


@ns.route("/environment/generate")
class EnvGenerate(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(env_in, validate=True)
    def post(self):
        body = request.json or {}
        groups = body.get("groups", {})
        base = float(body.get("base_volume_mwh", 20000))
        split = int(body.get("zone_split", 50))
        if abs(sum(groups.values()) - 100) > 1e-6:
            return {"ok": False, "errors": ["Group shares must sum to 100"]}, HTTPStatus.BAD_REQUEST
        # Allocate base volume to groups, then split per zone
        env = {"groups": {}, "zones": {"1": {}, "2": {}}}
        for k, pct in groups.items():
            vol = base * (float(pct)/100.0)
            env["groups"][k] = round(vol,3)
            z1 = vol * (split/100.0)
            z2 = vol - z1
            env["zones"]["1"][k] = round(z1,3)
            env["zones"]["2"][k] = round(z2,3)
        return {"ok": True, "environment": env}


@ns.route("/scenarios/<int:sid>/reference-runs")
class ReferenceRuns(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self, sid: int):
        rows = ReferenceRun.query.filter_by(scenario_id=sid).order_by(ReferenceRun.id.desc()).all()
        return [{"id": r.id, "name": r.name, "created_at": r.created_at.isoformat() + "Z"} for r in rows]

    @jwt_required()
    @role_required("designer", "admin")
    def post(self, sid: int):
        body = request.json or {}
        name = body.get("name") or "Reference Run"
        data = body.get("data") or {}
        rr = ReferenceRun(scenario_id=sid, name=name, data=data)
        db.session.add(rr)
        db.session.commit()
        return {"id": rr.id, "name": rr.name}, HTTPStatus.CREATED


@ns.route("/scenarios/<int:sid>/reference-runs/<int:rid>")
class ReferenceRunItem(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self, sid: int, rid: int):
        rr = ReferenceRun.query.filter_by(scenario_id=sid, id=rid).first_or_404()
        return {"id": rr.id, "name": rr.name, "data": rr.data}


@ns.route("/scenarios/<int:sid>/validate")
class ScenarioValidate(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    @ns.marshal_with(validate_out)
    def get(self, sid: int):
        s = Scenario.query.get_or_404(sid)
        errors = validate_config(s.config or {})
        return {"ok": len(errors) == 0, "errors": errors}


@ns.route("/events")
class EventLibrary(Resource):
    @jwt_required()
    def get(self):
        # Minimal event library (concept.md specifies 7 default events)
        return [
            {"name": "Fuel Price Spike", "type": "systemic", "multiplier": 1.2, "trigger_type": "round", "trigger_value": 2, "duration_rounds": 1},
            {"name": "Renewable Drought", "type": "systemic", "multiplier": 0.7, "trigger_type": "prob", "trigger_value": 0.3, "duration_rounds": 2},
            {"name": "Plant Outage", "type": "player", "additive": -1000, "trigger_type": "prob", "trigger_value": 0.1, "duration_rounds": 1},
            {"name": "Demand Surge", "type": "systemic", "multiplier": 1.15, "trigger_type": "round", "trigger_value": 3, "duration_rounds": 1},
            {"name": "Grid Congestion", "type": "grid", "multiplier": 0.5, "trigger_type": "round", "trigger_value": 2, "duration_rounds": 2, "target": "atc"},
            {"name": "Carbon Tax Increase", "type": "systemic", "additive": 50, "trigger_type": "round", "trigger_value": 1, "duration_rounds": 4, "target": "fossil"},
            {"name": "Battery Degradation", "type": "device", "multiplier": 0.95, "trigger_type": "cycles", "trigger_value": 3, "duration_rounds": 999, "target": "battery"},
        ]


@ns.route("/device-types")
class DeviceTypes(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self):
        """Return supported device types and their specifications for the KSE UI."""
        result = []
        for device_type in DeviceType:
            spec = DEVICE_SPECS.get(device_type, {})
            result.append({
                "type": device_type.value,
                "name": spec.get("name", ""),
                "category": spec.get("category", ""),
                "description": spec.get("description", ""),
                "defaults": spec.get("defaults", {}),
                "required_params": spec.get("required_params", []),
                "optional_params": spec.get("optional_params", []),
            })
        return result