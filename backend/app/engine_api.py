from http import HTTPStatus
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required

from .engine import preview_from_config, clear_market, generate_curves_from_config
from .utils import role_required


ns = Namespace("engine", description="Simulation preview")

preview_in = ns.model(
    "PreviewIn",
    {
        "config": fields.Raw(required=True),
        "round": fields.Integer(required=False, description="Preview for round number (filters events)"),
        "seed": fields.String(required=False, description="Optional seed override. Use campaign.seed when previewing in a campaign context."),
    }
)
preview_hourly_in = ns.model(
    "PreviewHourlyIn",
    {
        "config": fields.Raw(required=True),
        "hours": fields.Integer(required=False, description="number of hours (default 24)"),
        "seed": fields.String(required=False, description="Optional seed override. Use campaign.seed when previewing in a campaign context."),
    },
)


@ns.route("/preview")
class Preview(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(preview_in, validate=True)
    def post(self):
        cfg = request.json["config"]
        r = request.json.get("round")
        seed = request.json.get("seed") or (cfg.get("environment", {}) or {}).get("seed") or "preview"
        out = preview_from_config(cfg, seed=str(seed), round_num=r)
        return out, HTTPStatus.OK


@ns.route("/preview/hourly")
class PreviewHourly(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(preview_hourly_in, validate=True)
    def post(self):
        cfg = request.json["config"]
        hours = int(request.json.get("hours") or cfg.get("general",{}).get("horizon_hours", 24) or 24)
        seed = request.json.get("seed") or (cfg.get("environment", {}) or {}).get("seed") or "preview"
        base_supply, base_demand = generate_curves_from_config(cfg, seed=str(seed))
        mcp = []
        vol = []
        # Diurnal (24) and seasonal (12) profiles
        env = (cfg.get("environment") or {})
        diurnal = env.get("diurnal_profile") or [1.0] * 24
        seasonal = env.get("seasonal_factors") or [1.0] * 12
        # Determine start hour and month
        start_time = (cfg.get("general") or {}).get("start_time") or "00:00"
        try:
            sh = int(str(start_time).split(":")[0]) % 24
        except Exception:
            sh = 0
        fake_date = (cfg.get("general") or {}).get("fake_date") or "2025-01-01"
        try:
            sm = max(1, min(12, int(str(fake_date).split("-")[1])))
        except Exception:
            sm = 1
        price_floor = cfg.get("market", {}).get("price_floor", -500)
        price_cap = cfg.get("market", {}).get("price_cap", 5000)
        for i in range(hours):
            hour_idx = (sh + i) % 24
            f_d = float(diurnal[hour_idx] if hour_idx < len(diurnal) else 1.0)
            f_s = float(seasonal[(sm - 1) % len(seasonal)] if len(seasonal) > 0 else 1.0)
            f = max(0.0, f_d * f_s)
            # scale volumes of curves by f
            supply = [(p, max(0.0, v * f)) for (p, v) in base_supply]
            demand = [(p, max(0.0, v * f)) for (p, v) in base_demand]
            p, v = clear_market(supply, demand, price_floor=price_floor, price_cap=price_cap)
            mcp.append(round(p, 1))
            vol.append(round(v, 3))
        return {"hours": hours, "mcp": mcp, "volume": vol}, HTTPStatus.OK