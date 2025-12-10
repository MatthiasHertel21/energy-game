from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required

from .extensions import db
from .models import Result, User


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
            k = data.get("kpis") or {}
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