import io
from flask import send_file, jsonify
from flask_restx import Namespace, Resource
from flask_jwt_extended import jwt_required

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .extensions import db
from .models import Session, Scenario, Result


ns = Namespace("export", description="Export JSON/PDF")


@ns.route("/sessions/<int:sid>/json")
class ExportJSON(Resource):
    @jwt_required()
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        sc = Scenario.query.get(s.scenario_id)
        results = [
            {"player_id": r.player_id, "round": r.round_num, **(r.data or {})}
            for r in Result.query.filter_by(session_id=sid).order_by(Result.player_id, Result.round_num).all()
        ]
        return jsonify({"session": {"id": s.id, "scenario": sc.name if sc else None}, "results": results})


@ns.route("/sessions/<int:sid>/pdf")
class ExportPDF(Resource):
    @jwt_required()
    def get(self, sid: int):
        s = Session.query.get_or_404(sid)
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        # Title
        c.setFont("Helvetica-Bold", 18)
        c.drawString(50, 800, f"EMSG Report – Session {s.id}")
        c.setFont("Helvetica", 10)
        # Leaderboard summary
        rows = (
            db.session.query(Result.player_id, Result.data)
            .filter(Result.session_id == sid)
            .all()
        )
        agg = {}
        for pid, data in rows:
            k = data.get("kpis") or {}
            a = agg.setdefault(pid, {"profit_zar": 0, "imbalance_cost_zar": 0, "curtailment_cost_zar": 0, "revenue_zar": 0, "rounds": 0})
            a["profit_zar"] += k.get("profit_zar", 0)
            a["imbalance_cost_zar"] += k.get("imbalance_cost_zar", 0)
            a["curtailment_cost_zar"] += k.get("curtailment_cost_zar", 0)
            a["revenue_zar"] += k.get("revenue_zar", 0)
            a["rounds"] += 1
        lb = [
            {"player_id": pid, **vals} for pid, vals in agg.items()
        ]
        lb.sort(key=lambda x: x["profit_zar"], reverse=True)
        y = 770
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "Leaderboard (Profit)")
        y -= 16
        c.setFont("Helvetica", 10)
        for row in lb[:20]:
            c.drawString(50, y, f"P{row['player_id']}: Profit {row['profit_zar']} ZAR, Rev {row['revenue_zar']} Imb {row['imbalance_cost_zar']} Curt {row['curtailment_cost_zar']}")
            y -= 12
            if y < 100:
                c.showPage(); y = 800
        # Round details
        y -= 8
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, "Round Details")
        y -= 16
        c.setFont("Helvetica", 10)
        for r in Result.query.filter_by(session_id=sid).order_by(Result.round_num, Result.player_id).all():
            k = r.data.get("kpis", {}) if r.data else {}
            line = f"R{r.round_num} P{r.player_id} – MCP {r.data.get('mcp','-')} Vol {r.data.get('volume','-')} Profit {k.get('profit_zar','-')}"
            c.drawString(50, y, line)
            y -= 12
            if y < 60:
                c.showPage(); y = 800
        c.save()
        buf.seek(0)
        return send_file(buf, as_attachment=True, download_name=f"emsg_session_{s.id}.pdf", mimetype="application/pdf")