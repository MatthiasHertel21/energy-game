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
        "preview_date": fields.String(required=False, description="Preview date for seasonal profiles (YYYY-MM-DD)"),
        "preview_time": fields.String(required=False, description="Preview time for hourly profiles (HH:MM)"),
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
        
        # Extract preview_date and preview_time for profile selection
        preview_date = request.json.get("preview_date")
        preview_time = request.json.get("preview_time")
        
        # Extract month from date for seasonal profile
        month_of_year = None
        if preview_date:
            from datetime import datetime
            try:
                dt = datetime.strptime(preview_date, "%Y-%m-%d")
                month_of_year = dt.month  # 1-12
            except ValueError:
                pass
        
        # Extract hour from time for hourly profile
        hour_of_day = None
        if preview_time:
            try:
                parts = preview_time.split(":")
                hour_of_day = int(parts[0])  # 0-23
            except (ValueError, IndexError):
                pass
        
        out = preview_from_config(cfg, seed=str(seed), round_num=r, hour_of_day=hour_of_day, month_of_year=month_of_year)
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
        
        # Allow override of start date/time from frontend
        preview_date = request.json.get("preview_date")
        preview_time = request.json.get("preview_time")
        
        smp = []
        vol = []
        
        # Determine start hour and month
        if preview_time:
            try:
                sh = int(str(preview_time).split(":")[0]) % 24
            except Exception:
                sh = 0
        else:
            start_time = (cfg.get("general") or {}).get("start_time") or "00:00"
            try:
                sh = int(str(start_time).split(":")[0]) % 24
            except Exception:
                sh = 0
        
        if preview_date:
            try:
                sm = max(1, min(12, int(str(preview_date).split("-")[1])))
            except Exception:
                sm = 1
        else:
            fake_date = (cfg.get("general") or {}).get("fake_date") or "2025-01-01"
            try:
                sm = max(1, min(12, int(str(fake_date).split("-")[1])))
            except Exception:
                sm = 1
        
        price_floor = cfg.get("market", {}).get("price_floor", -500)
        price_cap = cfg.get("market", {}).get("price_cap", 5000)
        for i in range(hours):
            hour_idx = (sh + i) % 24
            # Generate curves with device-specific profiles for this hour and month
            base_supply, base_demand = generate_curves_from_config(cfg, seed=str(seed), hour_of_day=hour_idx, month_of_year=sm)
            # No additional scaling needed - device profiles handle everything
            supply = base_supply
            demand = base_demand
            p, v = clear_market(supply, demand, price_floor=price_floor, price_cap=price_cap)
            smp.append(round(p, 1))
            vol.append(round(v, 3))
        return {"hours": hours, "smp": smp, "volume": vol}, HTTPStatus.OK