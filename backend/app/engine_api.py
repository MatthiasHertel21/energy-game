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
        "round": fields.Integer(required=False, description="Preview for round number (filters events)")
    }
)
preview_hourly_in = ns.model("PreviewHourlyIn", {"config": fields.Raw(required=True), "hours": fields.Integer(required=False, description="number of hours (default 24)")})


@ns.route("/preview")
class Preview(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(preview_in, validate=True)
    def post(self):
        cfg = request.json["config"]
        r = request.json.get("round")
        out = preview_from_config(cfg, round_num=r)
        return out, HTTPStatus.OK


@ns.route("/preview/hourly")
class PreviewHourly(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    @ns.expect(preview_hourly_in, validate=True)
    def post(self):
        cfg = request.json["config"]
        hours = int(request.json.get("hours") or cfg.get("general",{}).get("horizon_hours", 24) or 24)
        supply, demand = generate_curves_from_config(cfg)
        mcp = []
        vol = []
        # simple seedless constant clearing per hour; slight variation by index
        for i in range(hours):
            p, v = clear_market(supply, demand, price_floor=cfg.get("market", {}).get("price_floor", -500), price_cap=cfg.get("market", {}).get("price_cap", 5000))
            # vary slightly ±1% by hour index for preview
            f = 1.0 + ((i % 5) - 2) * 0.005
            mcp.append(round(p * f, 1))
            vol.append(round(v * f, 3))
        return {"hours": hours, "mcp": mcp, "volume": vol}, HTTPStatus.OK