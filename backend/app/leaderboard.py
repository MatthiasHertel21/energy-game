from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required

from .extensions import db
from .models import Result, User, Forecast
from .kpi_schema import canonicalize_kpis


ns = Namespace("leaderboard", description="Leaderboards & KPIs")


@ns.route("/sessions/<int:sid>")
class LeaderboardSession(Resource):
    @jwt_required()
    def get(self, sid: int):
        parser = reqparse.RequestParser()
        parser.add_argument('role', type=str, required=False)
        args = parser.parse_args()
        role_filter = args.get('role')
        subq = db.session.query(Result.player_id, Result.data).filter(Result.session_id == sid).subquery()
        rows = db.session.query(subq.c.player_id, subq.c.data, User.role, User.email).join(User, User.id == subq.c.player_id).all()
        agg = {}
        for pid, data, role, email in rows:
            k = canonicalize_kpis(data.get("kpis") or {})
            entry = agg.setdefault(pid, {
                "profit_zar": 0, 
                "imbalance_cost_zar": 0, 
                "curtailment_cost_zar": 0, 
                "revenue_zar": 0, 
                "rounds": 0, 
                "role": role.value if hasattr(role, 'value') else str(role),
                "email": email
            })
            entry["profit_zar"] += k.get("profit_zar", 0)
            entry["imbalance_cost_zar"] += k.get("imbalance_cost_zar", 0)
            entry["curtailment_cost_zar"] += k.get("curtailment_cost_zar", 0)
            entry["revenue_zar"] += k.get("revenue_zar", 0)
            entry["rounds"] += 1
        # simple score: profit
        leaderboard = [{"player_id": pid, **vals, "score": vals.get("profit_zar", 0)} for pid, vals in agg.items()]
        if role_filter:
            leaderboard = [r for r in leaderboard if r.get('role') == role_filter]
        leaderboard.sort(key=lambda x: x["score"], reverse=True)
        return leaderboard


@ns.route("/sessions/<int:sid>/market-breakdown")
class LeaderboardMarketBreakdown(Resource):
    """
    Market breakdown showing Day-Ahead vs Intraday volume and revenue attribution.
    
    This endpoint computes:
    - DA Volume: Total MWh from Round 1 (DA baseline) forecasts
    - ID Delta: Difference between final position and DA baseline
    - Revenue attribution based on SMP
    """
    @jwt_required()
    def get(self, sid: int):
        # Get all results for this session
        results = db.session.query(Result).filter(Result.session_id == sid).all()
        
        # Get all forecasts for this session to distinguish DA vs ID
        forecasts = db.session.query(Forecast).filter(Forecast.session_id == sid).all()
        
        def parse_devices(data):
            """Convert forecast data to device_id -> hours dict format"""
            devices = data.get('devices', [])
            if isinstance(devices, list):
                # List format: [{'device_id': 'xxx', 'hours': [...]}, ...]
                return {d['device_id']: d['hours'] for d in devices if 'device_id' in d and 'hours' in d}
            elif isinstance(devices, dict):
                # Dict format: {'device_id': {'hours': [...], ...}, ...}
                result = {}
                for dev_id, dev_data in devices.items():
                    if isinstance(dev_data, list):
                        result[dev_id] = dev_data
                    elif isinstance(dev_data, dict):
                        result[dev_id] = dev_data.get('hours', [])
                return result
            return {}
        
        # Build DA baseline per player (Round 1 or is_da_baseline=True)
        da_baseline = {}  # player_id -> {device_id -> hourly_values}
        final_position = {}  # player_id -> {device_id -> hourly_values} (latest round)
        player_rounds = {}  # player_id -> max round number
        
        for f in forecasts:
            pid = f.player_id
            
            # Skip round -1 (initial state)
            if f.round_num < 1:
                continue
            
            # Track max round per player
            if pid not in player_rounds or f.round_num > player_rounds[pid]:
                player_rounds[pid] = f.round_num
                final_position[pid] = parse_devices(f.data)
            
            # DA baseline is Round 1 or is_da_baseline=True
            if f.is_da_baseline or f.round_num == 1:
                da_baseline[pid] = parse_devices(f.data)
        
        # Get average SMP from results
        avg_mcp = 0.0
        mcp_count = 0
        for r in results:
            if r.data:
                # SMP can be in result data directly or in kpis
                smp = r.data.get('smp', 0)
                if smp:
                    avg_mcp += smp
                    mcp_count += 1
        avg_mcp = avg_mcp / mcp_count if mcp_count > 0 else 450.0  # Default SMP
        
        # Compute market breakdown per player
        breakdown = []
        for pid in set(list(da_baseline.keys()) + list(final_position.keys())):
            da_devices = da_baseline.get(pid, {})
            final_devices = final_position.get(pid, {})
            
            # Sum volumes across all devices and hours
            da_volume_mwh = 0.0
            final_volume_mwh = 0.0
            
            all_device_ids = set(list(da_devices.keys()) + list(final_devices.keys()))
            
            for dev_id in all_device_ids:
                da_hours = da_devices.get(dev_id, [0] * 24)
                final_hours = final_devices.get(dev_id, [0] * 24)
                
                # Ensure same length
                if not isinstance(da_hours, list):
                    da_hours = [0] * 24
                if not isinstance(final_hours, list):
                    final_hours = [0] * 24
                
                # Sum volumes (MWh = MW * 1 hour)
                da_volume_mwh += sum(abs(v) for v in da_hours if isinstance(v, (int, float)))
                final_volume_mwh += sum(abs(v) for v in final_hours if isinstance(v, (int, float)))
            
            # ID delta is the difference
            id_delta_mwh = final_volume_mwh - da_volume_mwh
            
            # Revenue attribution (simplified: DA gets base volume * SMP, ID gets delta * SMP)
            # In reality, this would be more complex with different prices
            da_revenue_zar = da_volume_mwh * avg_mcp
            id_revenue_zar = id_delta_mwh * avg_mcp
            total_revenue_zar = final_volume_mwh * avg_mcp
            
            # Get user email
            user = db.session.query(User).filter(User.id == pid).first()
            email = user.email if user else f"Player {pid}"
            
            breakdown.append({
                "player_id": pid,
                "email": email,
                "da_volume_mwh": round(da_volume_mwh, 2),
                "id_delta_mwh": round(id_delta_mwh, 2),
                "final_volume_mwh": round(final_volume_mwh, 2),
                "da_revenue_zar": round(da_revenue_zar, 0),
                "id_revenue_zar": round(id_revenue_zar, 0),
                "total_revenue_zar": round(total_revenue_zar, 0),
                "avg_mcp": round(avg_mcp, 2),
                "rounds_played": player_rounds.get(pid, 1)
            })
        
        breakdown.sort(key=lambda x: x["total_revenue_zar"], reverse=True)
        return breakdown