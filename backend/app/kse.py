from http import HTTPStatus
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required, get_jwt_identity

from .extensions import db
from .models import Campaign, Scenario, Role, ReferenceRun
from .models import CampaignScenario, Session, SessionStatus, PlayerProgress, Forecast, Result
from .models import SessionAllowedType, SessionPlayerType, PhaseResult
from .utils import role_required
from .device_types import DEVICE_SPECS, DeviceType, validate_device
from .config import Config
from .templates import list_templates, get_template
import os
import uuid

try:
    from PIL import Image
except Exception:
    Image = None


ns = Namespace("kse", description="Kampagnien/Szenarieneditor")

PLAYER_INPUT_SCOPE_MODES = {
    "all_hours",
    "first_hour",
    "first_two_hours",
    "first_three_hours",
    "custom_offsets",
}

campaign_in = ns.model(
    "CampaignIn",
    {
        "name": fields.String(required=True),
        "description": fields.String,
        "seed": fields.String(description="Optional deterministic seed used by simulations for this campaign"),
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

GRID_EXTRA_COST_MODES = {"zonal_only"}
GRID_COST_TARGETS = {"consumers_only"}
GRID_SHORTFALL_PRICE_MODES = {"fixed_price", "smp_multiplier", "value_of_lost_load"}
GRID_CURTAILMENT_MODES = {"pro_rata", "reverse_merit_order", "renewables_first", "renewables_last"}


def _normalize_boolean_flag(value, fallback: bool = False) -> bool:
    if value is None:
        return fallback
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on", "enabled"}:
            return True
        if normalized in {"false", "0", "no", "off", "disabled", ""}:
            return False
    return bool(value)


def _is_zonal_pricing_v1_enabled(cfg: dict | None) -> bool:
    zones = max(1, int((cfg or {}).get("grid", {}).get("zones", 1) or 1))
    general_cfg = (cfg or {}).get("general", {}) or {}
    return zones > 1 and _normalize_boolean_flag(general_cfg.get("zonal_pricing_v1_enabled"), False)


def _get_mix_blocks(entry) -> float:
    if isinstance(entry, dict):
        return float(entry.get("blocks", entry.get("share_pct", 0)) or 0)
    return float(entry or 0)


def _validate_zone_distribution(label: str, dist, zones: int, errors: list[str]) -> None:
    if dist is None:
        return
    if not isinstance(dist, list):
        errors.append(f"{label}.zone_distribution_pct must be a list")
        return
    if len(dist) != zones:
        errors.append(f"{label}.zone_distribution_pct must have length = zones")
        return
    values = []
    for idx, value in enumerate(dist):
        try:
            numeric = float(value)
        except Exception:
            errors.append(f"{label}.zone_distribution_pct[{idx}] must be numeric")
            return
        if numeric < 0:
            errors.append(f"{label}.zone_distribution_pct[{idx}] must be >= 0")
        values.append(numeric)
    if abs(sum(values) - 100.0) > 1e-6:
        errors.append(f"{label}.zone_distribution_pct must sum to 100")


def _validate_price_range(label: str, entry, errors: list[str]) -> None:
    if not isinstance(entry, dict):
        return

    has_min = entry.get("price_min") not in (None, "")
    has_max = entry.get("price_max") not in (None, "")
    if not has_min and not has_max:
        return

    min_price = None
    max_price = None
    if has_min:
        try:
            min_price = float(entry.get("price_min"))
        except Exception:
            errors.append(f"{label}.price_min must be numeric")
    if has_max:
        try:
            max_price = float(entry.get("price_max"))
        except Exception:
            errors.append(f"{label}.price_max must be numeric")

    if min_price is not None and max_price is not None and min_price > max_price:
        errors.append(f"{label}.price_min must be <= {label}.price_max")


def _validate_mix_with_zone_distribution(container_label: str, mix, zones: int, errors: list[str]) -> None:
    if mix is None:
        return
    if not isinstance(mix, dict):
        errors.append(f"{container_label} must be an object")
        return
    for key, entry in mix.items():
        if isinstance(entry, dict):
            _validate_zone_distribution(f"{container_label}.{key}", entry.get("zone_distribution_pct"), zones, errors)
            _validate_price_range(f"{container_label}.{key}", entry, errors)
            profile = entry.get("profile")
            if profile is not None:
                if not isinstance(profile, list) or len(profile) != 24:
                    errors.append(f"{container_label}.{key}.profile must be an array of 24 values")
            seasonal = entry.get("seasonal_profile")
            if seasonal is not None:
                if not isinstance(seasonal, list) or len(seasonal) != 12:
                    errors.append(f"{container_label}.{key}.seasonal_profile must be an array of 12 values")


def _normalize_grid_defaults(cfg: dict) -> None:
    grid = cfg.setdefault("grid", {})
    if grid.get("losses_pct_per_link") is None:
        if grid.get("transmission_loss_pct") is not None:
            grid["losses_pct_per_link"] = grid.get("transmission_loss_pct")
        elif grid.get("losses_pct") is not None:
            grid["losses_pct_per_link"] = grid.get("losses_pct")
        else:
            grid["losses_pct_per_link"] = 2.0
    settlement = grid.get("network_settlement")
    if not isinstance(settlement, dict):
        settlement = {}
    settlement.setdefault("extra_cost_mode", "zonal_only")
    settlement.setdefault("cost_allocation_target", "consumers_only")
    settlement.setdefault("shortfall_price_mode", "smp_multiplier")
    settlement.setdefault("shortfall_price_value", 2.0)
    grid["network_settlement"] = settlement
    grid.setdefault("generator_curtailment_mode", "pro_rata")


def _normalize_balancing_defaults(cfg: dict) -> None:
    balancing = cfg.get("balancing")
    if not isinstance(balancing, dict):
        balancing = {}
    balancing.setdefault("up_price_zar_per_mwh", 1200.0)
    balancing.setdefault("down_price_zar_per_mwh", 800.0)
    cfg["balancing"] = balancing


def validate_config(cfg: dict) -> list[str]:
    if not isinstance(cfg, dict):
        return ["config must be an object"]
    _normalize_grid_defaults(cfg)
    _normalize_balancing_defaults(cfg)
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
    try:
        losses_pct = float(cfg.get("grid", {}).get("losses_pct_per_link", 2.0) or 0.0)
        if not (0 <= losses_pct <= 100):
            errors.append("grid.losses_pct_per_link must be within [0, 100]")
    except Exception:
        errors.append("grid.losses_pct_per_link must be numeric")

    settlement = cfg.get("grid", {}).get("network_settlement") or {}
    if not isinstance(settlement, dict):
        errors.append("grid.network_settlement must be an object")
    else:
        extra_cost_mode = str(settlement.get("extra_cost_mode", "zonal_only")).strip().lower()
        if extra_cost_mode not in GRID_EXTRA_COST_MODES:
            errors.append("grid.network_settlement.extra_cost_mode invalid")
        allocation_target = str(settlement.get("cost_allocation_target", "consumers_only")).strip().lower()
        if allocation_target not in GRID_COST_TARGETS:
            errors.append("grid.network_settlement.cost_allocation_target invalid")
        shortfall_mode = str(settlement.get("shortfall_price_mode", "smp_multiplier")).strip().lower()
        if shortfall_mode not in GRID_SHORTFALL_PRICE_MODES:
            errors.append("grid.network_settlement.shortfall_price_mode invalid")
        try:
            shortfall_value = float(settlement.get("shortfall_price_value", 2.0) or 0.0)
            if shortfall_value <= 0:
                errors.append("grid.network_settlement.shortfall_price_value must be > 0")
        except Exception:
            errors.append("grid.network_settlement.shortfall_price_value must be numeric")

    curtailment_mode = str(cfg.get("grid", {}).get("generator_curtailment_mode", "pro_rata")).strip().lower()
    if curtailment_mode not in GRID_CURTAILMENT_MODES:
        errors.append("grid.generator_curtailment_mode invalid")

    _validate_mix_with_zone_distribution("environment.groups", cfg.get("environment", {}).get("groups"), int(zones), errors)
    _validate_mix_with_zone_distribution("market.generator_mix", cfg.get("market", {}).get("generator_mix"), int(zones), errors)
    _validate_mix_with_zone_distribution("market.consumer_mix", cfg.get("market", {}).get("consumer_mix"), int(zones), errors)
    market_cfg = cfg.get("market") or {}
    if isinstance(market_cfg, dict):
        for key in ("idm_production_forecast_change_max_pct", "idm_consumption_forecast_change_max_pct"):
            raw_value = market_cfg.get(key, 0)
            try:
                numeric_value = float(raw_value or 0)
                if numeric_value < 0 or numeric_value > 100:
                    errors.append(f"market.{key} must be within [0, 100]")
            except Exception:
                errors.append(f"market.{key} must be numeric")
    balancing = cfg.get("balancing") or {}
    if not isinstance(balancing, dict):
        errors.append("balancing must be an object")
    else:
        try:
            up_price = float(balancing.get("up_price_zar_per_mwh", 1200.0) or 0.0)
            if up_price <= 0:
                errors.append("balancing.up_price_zar_per_mwh must be > 0")
        except Exception:
            errors.append("balancing.up_price_zar_per_mwh must be numeric")
        try:
            down_price = float(balancing.get("down_price_zar_per_mwh", 800.0) or 0.0)
            if down_price <= 0:
                errors.append("balancing.down_price_zar_per_mwh must be > 0")
        except Exception:
            errors.append("balancing.down_price_zar_per_mwh must be numeric")
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

    freeze = cfg.get("general", {}).get("freeze_hours")
    if freeze is not None:
        try:
            if int(freeze) < 0 or int(freeze) > int(span):
                errors.append("general.freeze_hours must be in [0, round_span_hours]")
        except Exception:
            errors.append("general.freeze_hours must be numeric")

    # Validate gate timing fields
    general_cfg = cfg.get("general", {})
    for field, lo, hi in [
        ("day_ahead_gate_hour", 0, 23),
        ("id_gate_base_hour", 0, 23),
    ]:
        val = general_cfg.get(field)
        if val is not None:
            try:
                if not (lo <= int(val) <= hi):
                    errors.append(f"general.{field} must be in [{lo}, {hi}]")
            except Exception:
                errors.append(f"general.{field} must be an integer")
    id_interval = general_cfg.get("id_gate_interval_hours")
    if id_interval is not None:
        try:
            if not (1 <= int(id_interval) <= 24):
                errors.append("general.id_gate_interval_hours must be in [1, 24]")
        except Exception:
            errors.append("general.id_gate_interval_hours must be an integer")

    player_input = cfg.get("player_input") or {}
    if player_input and not isinstance(player_input, dict):
        errors.append("player_input must be an object")
    else:
        mode = str(player_input.get("mode") or "all_hours").strip().lower()
        if mode not in PLAYER_INPUT_SCOPE_MODES:
            errors.append("player_input.mode must be one of: all_hours, first_hour, first_two_hours, first_three_hours, custom_offsets")

        editable_offsets = player_input.get("editable_offsets", [])
        if editable_offsets is not None and not isinstance(editable_offsets, list):
            errors.append("player_input.editable_offsets must be a list")
        elif isinstance(editable_offsets, list):
            for offset in editable_offsets:
                try:
                    normalized_offset = int(offset)
                except Exception:
                    errors.append(f"player_input.editable_offsets contains non-integer value: {offset}")
                    continue
                if normalized_offset < 0:
                    errors.append("player_input.editable_offsets must be >= 0")
                elif span and normalized_offset >= int(span):
                    errors.append("player_input.editable_offsets must be smaller than round_span_hours")

        allow_other_rounds_editing = player_input.get("allow_other_rounds_editing", True)
        if allow_other_rounds_editing is not None and not isinstance(allow_other_rounds_editing, bool):
            errors.append("player_input.allow_other_rounds_editing must be a boolean")

        enable_smooth_drag = player_input.get("enable_smooth_drag", True)
        if enable_smooth_drag is not None and not isinstance(enable_smooth_drag, bool):
            errors.append("player_input.enable_smooth_drag must be a boolean")
    
    # Validate devices
    devices = cfg.get("devices", [])
    if isinstance(devices, list):
        seen_device_ids: set = set()
        for device in devices:
            if isinstance(device, dict):
                did = device.get("id")
                if did is not None:
                    if did in seen_device_ids:
                        errors.append(f"Duplicate device id: {did}")
                    seen_device_ids.add(did)
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
            device_map = {d.get("id"): d for d in (devices or []) if isinstance(d, dict)}
            
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
                if pt.get("zone") is not None:
                    try:
                        zone_value = int(pt.get("zone"))
                        if not (1 <= zone_value <= int(zones)):
                            errors.append(f"player_types[{tid}].zone must be within [1, zones]")
                    except Exception:
                        errors.append(f"player_types[{tid}].zone must be integer")
                dv = pt.get("devices", [])
                if not isinstance(dv, list):
                    errors.append(f"player_types[{tid}].devices must be a list")
                else:
                    unknown = [x for x in dv if x not in dev_ids]
                    if unknown:
                        errors.append(f"player_types[{tid}].devices unknown: {', '.join(map(str, unknown))}")
                    
                    # Validate role: must be pure producer or consumer (no prosumer)
                    if dv:
                        player_devices = [device_map.get(dev_id) for dev_id in dv if dev_id in device_map]
                        from .engine import detect_player_role
                        role = detect_player_role(player_devices)
                        if role == 'unknown':
                            errors.append(f"player_types[{tid}]: No valid devices or all devices are storage only.")

            if int(zones) > 1 and _is_zonal_pricing_v1_enabled(cfg):
                missing_zones = [
                    str(pt.get("name") or pt.get("id") or "unknown")
                    for pt in player_types
                    if isinstance(pt, dict)
                    and (pt.get("devices") or [])
                    and pt.get("zone") in (None, "")
                ]
                if missing_zones:
                    errors.append("V1 multi-zone scenarios require player_types[].zone for every configured player type")
                if cfg.get("general", {}).get("player_zone") not in (None, ""):
                    errors.append("general.player_zone is not allowed when zonal_pricing_v1_enabled is true")

    
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
    if pz is not None and not _is_zonal_pricing_v1_enabled(cfg):
        try:
            if not (1 <= int(pz) <= int(zones)):
                errors.append("general.player_zone must be within [1, zones]")
        except Exception:
            errors.append("general.player_zone must be integer")
    
    return errors


def sanitize_markets_config(cfg: dict) -> dict:
    """Normalize markets config to trading-only schema.

    Supported inputs:
    - Legacy array: markets.dam = [..]
    - Old object: markets.dam = {trading:[..], clearing:[..]}
    - Current object: markets.dam = {trading:[..]}
    """
    if not isinstance(cfg, dict):
        return cfg

    out = dict(cfg)
    markets = out.get("markets", {}) or {}

    def _sanitize_entry(entry):
        if isinstance(entry, list):
            return {"trading": list(entry)}
        if isinstance(entry, dict):
            trading = entry.get("trading")
            if isinstance(trading, list):
                return {"trading": list(trading)}
            legacy_clearing = entry.get("clearing")
            if isinstance(legacy_clearing, list):
                return {"trading": list(legacy_clearing)}
            return {"trading": []}
        return {"trading": []}

    def _sanitize_player_input(entry):
        if not isinstance(entry, dict):
            entry = {}
        mode = str(entry.get("mode") or "all_hours").strip().lower()
        if mode not in PLAYER_INPUT_SCOPE_MODES:
            mode = "all_hours"
        raw_offsets = entry.get("editable_offsets", [])
        offsets = []
        if isinstance(raw_offsets, list):
            for value in raw_offsets:
                try:
                    normalized = int(value)
                except Exception:
                    continue
                if normalized < 0:
                    continue
                if normalized not in offsets:
                    offsets.append(normalized)
        offsets.sort()
        return {
            "mode": mode,
            "editable_offsets": offsets,
            "hide_non_editable_hours": bool(entry.get("hide_non_editable_hours", False)),
            "allow_other_rounds_editing": entry.get("allow_other_rounds_editing", True) is not False,
            "enable_smooth_drag": entry.get("enable_smooth_drag", True) is not False,
        }

    out["markets"] = {
        "dam": _sanitize_entry(markets.get("dam", [])),
        "idm": _sanitize_entry(markets.get("idm", [])),
    }
    out["player_input"] = _sanitize_player_input(out.get("player_input"))
    return out


def _delete_session_dependents(session_ids: list[int]) -> None:
    if not session_ids:
        return

    SessionAllowedType.query.filter(
        SessionAllowedType.session_id.in_(session_ids)
    ).delete(synchronize_session=False)
    SessionPlayerType.query.filter(
        SessionPlayerType.session_id.in_(session_ids)
    ).delete(synchronize_session=False)
    Forecast.query.filter(Forecast.session_id.in_(session_ids)).delete(synchronize_session=False)
    Result.query.filter(Result.session_id.in_(session_ids)).delete(synchronize_session=False)
    PhaseResult.query.filter(PhaseResult.session_id.in_(session_ids)).delete(synchronize_session=False)


@ns.route("/campaigns")
class Campaigns(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self):
        rows = Campaign.query.order_by(Campaign.id.desc()).all()
        return [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "designer_id": c.designer_id,
                "seed": c.seed,
                "published": bool(c.published),
                "cover_image_url": c.cover_image_url,
            }
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
            seed=data.get("seed") or None,
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
        if "seed" in body:
            c.seed = (body.get("seed") or None)
        db.session.add(c)
        db.session.commit()
        return {"status": "ok"}

    @jwt_required()
    @role_required("designer", "admin")
    def delete(self, cid: int):
        """Delete a campaign. Removes all dependent data including scenarios, sessions, and progress."""
        c = Campaign.query.get_or_404(cid)
        
        # Collect scenario ids belonging to this campaign
        scenario_ids = [s.id for s in Scenario.query.filter_by(campaign_id=cid).all()]
        
        if scenario_ids:
            # Delete player progress entries for these scenarios
            PlayerProgress.query.filter(PlayerProgress.scenario_id.in_(scenario_ids)).delete(synchronize_session=False)
            
            # Delete session-scoped records from sessions using these scenarios
            session_ids = [s.id for s in Session.query.filter(Session.scenario_id.in_(scenario_ids)).all()]
            _delete_session_dependents(session_ids)
            
            # Delete sessions using these scenarios
            Session.query.filter(Session.scenario_id.in_(scenario_ids)).delete(synchronize_session=False)
            
            # Delete reference runs tied to scenarios
            ReferenceRun.query.filter(ReferenceRun.scenario_id.in_(scenario_ids)).delete(synchronize_session=False)
            
            # Delete scenarios
            Scenario.query.filter(Scenario.id.in_(scenario_ids)).delete(synchronize_session=False)
        
        # Delete player progress entries referencing this campaign directly
        PlayerProgress.query.filter_by(campaign_id=cid).delete(synchronize_session=False)
        
        # Remove campaign-scenario mappings
        from .models import CohortCampaign
        CampaignScenario.query.filter_by(campaign_id=cid).delete(synchronize_session=False)
        
        # Remove cohort-campaign visibility entries
        CohortCampaign.query.filter_by(campaign_id=cid).delete(synchronize_session=False)
        
        # Finally delete the campaign itself
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
        # Check system limit for max scenarios
        scenario_count = Scenario.query.count()
        if scenario_count >= Config.MAX_SCENARIOS:
            ns.abort(HTTPStatus.FORBIDDEN, f"System limit reached: maximum {Config.MAX_SCENARIOS} scenarios allowed")
        
        data = request.json
        cleaned_config = sanitize_markets_config(data.get("config", {}))
        errors = validate_config(cleaned_config)
        if errors:
            return {"ok": False, "errors": errors}, HTTPStatus.BAD_REQUEST
        s = Scenario(name=data["name"], campaign_id=data.get("campaign_id"), config=cleaned_config)
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
        cleaned_config = sanitize_markets_config(data.get("config", {}))
        errors = validate_config(cleaned_config)
        if errors:
            return {"ok": False, "errors": errors}, HTTPStatus.BAD_REQUEST
        s = Scenario.query.get_or_404(sid)
        s.name = data["name"]
        s.campaign_id = data.get("campaign_id")
        s.config = cleaned_config
        db.session.add(s)
        db.session.commit()
        return {"status": "ok"}

    @jwt_required()
    @role_required("designer", "admin")
    def delete(self, sid: int):
        s = Scenario.query.get_or_404(sid)
        
        # Delete dependent records first to avoid foreign key constraint violations
        # Delete player progress entries
        PlayerProgress.query.filter_by(scenario_id=sid).delete(synchronize_session=False)
        
        # Delete session-scoped records from sessions using this scenario
        session_ids = [session.id for session in Session.query.filter_by(scenario_id=sid).all()]
        _delete_session_dependents(session_ids)
        
        # Delete sessions using this scenario
        Session.query.filter_by(scenario_id=sid).delete(synchronize_session=False)
        
        # Delete campaign-scenario assignments
        CampaignScenario.query.filter_by(scenario_id=sid).delete(synchronize_session=False)
        
        # Delete reference runs
        ReferenceRun.query.filter_by(scenario_id=sid).delete(synchronize_session=False)
        
        # Finally delete the scenario itself
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
        config = sanitize_markets_config(data.get("config") or {})
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


@ns.route("/templates")
class Templates(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self):
        """List available scenario templates"""
        return list_templates()


@ns.route("/templates/<string:template_id>")
class TemplateDetail(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self, template_id: str):
        """Get a specific template configuration"""
        template = get_template(template_id)
        if not template:
            ns.abort(HTTPStatus.NOT_FOUND, f"Template '{template_id}' not found")
        return template
@ns.route("/images")
class ImageUpload(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def post(self):
        """Upload an image and return its public URL for Markdown usage.
        Accepts multipart/form-data with field name 'file'. Optionally supports 'max_width' to downscale.
        """
        if 'file' not in request.files:
            return {"error": "file required"}, HTTPStatus.BAD_REQUEST
        f = request.files['file']
        if not f or f.filename == '':
            return {"error": "empty file"}, HTTPStatus.BAD_REQUEST

        upload_dir = os.getenv('UPLOAD_DIR', '/app/uploads')
        dest_dir = os.path.join(upload_dir, 'images')
        os.makedirs(dest_dir, exist_ok=True)

        # Generate a random filename
        uid = uuid.uuid4().hex
        out_path = os.path.join(dest_dir, f"{uid}.png")
        max_width = None
        try:
            max_width_val = request.form.get('max_width')
            if max_width_val:
                max_width = int(max_width_val)
        except Exception:
            max_width = None

        # Try to process via Pillow; fallback to raw save
        try:
            if Image is None:
                raise RuntimeError("PIL unavailable")
            img = Image.open(f.stream)
            # convert to RGB for consistency; preserve alpha by converting to RGBA then to PNG
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGBA')
            # downscale if requested or if image is very large
            if max_width and img.width > max_width:
                ratio = max_width / float(img.width)
                img = img.resize((int(img.width * ratio), int(img.height * ratio)))
            elif img.width > 2400:
                ratio = 2400.0 / float(img.width)
                img = img.resize((int(img.width * ratio), int(img.height * ratio)))
            img.save(out_path, format='PNG')
        except Exception:
            # Fallback: save original bytes; ensure unique name and extension
            try:
                _, ext = os.path.splitext(f.filename or '')
                ext = (ext.lower() if ext.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.webp'] else '.bin')
                out_path = os.path.join(dest_dir, f"{uid}{ext}")
                f.stream.seek(0)
                with open(out_path, 'wb') as out:
                    out.write(f.read())
            except Exception:
                return {"error": "failed to save image"}, HTTPStatus.INTERNAL_SERVER_ERROR

        public_url = "/uploads/images/" + os.path.basename(out_path)
        return {"url": public_url}, HTTPStatus.CREATED



@ns.route("/scenarios/<int:sid>/sessions")
class ScenarioSessions(Resource):
    @jwt_required()
    @role_required("designer", "admin")
    def get(self, sid: int):
        """List sessions that used this scenario. Designers can only see sessions for scenarios mapped to their campaigns."""
        # If designer, ensure ownership via campaign mapping
        from flask_jwt_extended import get_jwt_identity
        user_id = int(get_jwt_identity())
        # Check if scenario exists
        Scenario.query.get_or_404(sid)
        
        # Ownership check: if role is designer, ensure scenario is in a campaign owned by this designer
        from .models import Campaign, User, Role as UserRole
        user = User.query.get(user_id)
        if user and user.role == UserRole.designer:
            mapped = (
                db.session.query(CampaignScenario)
                .join(Campaign, Campaign.id == CampaignScenario.campaign_id)
                .filter(CampaignScenario.scenario_id == sid, Campaign.designer_id == user_id)
                .count()
            )
            if mapped == 0:
                ns.abort(HTTPStatus.FORBIDDEN, "You do not own this scenario or it is not mapped to your campaign")

        limit = request.args.get("limit", 50, type=int)
        offset = request.args.get("offset", 0, type=int)
        
        q = Session.query.filter(Session.scenario_id == sid).order_by(Session.started_at.desc())
        total = q.count()
        rows = q.limit(limit).offset(offset).all()
        
        # Build response
        from .models import Cohort
        result = []
        for s in rows:
            cohort = Cohort.query.get(s.cohort_id) if s.cohort_id else None
            # Player count via PlayerProgress
            from .models import PlayerProgress
            pc = PlayerProgress.query.filter_by(session_id=s.id).count()
            result.append({
                "session_id": s.id,
                "cohort_name": cohort.name if cohort else ("Solo" if s.mode == "solo" else None),
                "status": s.status.value if s.status else None,
                "created_at": s.started_at.isoformat() + "Z" if s.started_at else None,
                "round": getattr(s, 'current_round', None) or getattr(s, 'round', None),
                "player_count": pc,
            })
        return {"sessions": result, "total": total, "limit": limit, "offset": offset}