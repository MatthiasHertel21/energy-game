from flask import Flask
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from .config import Config
from .extensions import db, migrate, bcrypt, jwt, api, socketio, limiter, talisman
from .auth import ns as auth_ns
from .admin import ns as admin_ns
from .kse import ns as kse_ns
from .ksechat import ns as ksechat_ns
from .sessions import ns as sessions_ns
from .player import ns as player_ns
from .engine_api import ns as engine_ns
from .cohorts import ns as cohorts_ns
from .me import ns as me_ns
from .leaderboard import ns as leaderboard_ns
from .export import ns as export_ns
from .health import bp as health_bp
from .catalog import ns as catalog_ns
from .trainer import ns as trainer_ns
from .static_pages import ns as static_pages_ns


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config())

    proxy_hops = int(app.config.get("TRUST_PROXY_HOPS", 0) or 0)
    if proxy_hops > 0:
        app.wsgi_app = ProxyFix(
            app.wsgi_app,
            x_for=proxy_hops,
            x_proto=proxy_hops,
            x_host=proxy_hops,
            x_port=proxy_hops,
        )

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    bcrypt.init_app(app)
    jwt.init_app(app)
    limiter.init_app(app)
    # Talisman: skip init when behind reverse proxy (nginx handles HTTPS)
    # talisman.init_app(app)
    # CORS: allow configured origins (comma-separated) or all for dev
    import os
    origins = os.getenv("CORS_ALLOW_ORIGINS", "*")
    CORS(app, resources={r"/api/*": {"origins": origins.split(",") if origins != "*" else "*"}})

    # Sentry SDK (optional)
    try:
        import sentry_sdk
        dsn = os.getenv("SENTRY_DSN")
        if dsn:
            sentry_sdk.init(dsn=dsn, traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")))
    except Exception:
        pass

    # Namespaces / API
    api.init_app(app)
    api.add_namespace(auth_ns)
    api.add_namespace(admin_ns)
    api.add_namespace(kse_ns)
    api.add_namespace(ksechat_ns)
    api.add_namespace(sessions_ns)
    api.add_namespace(player_ns)
    api.add_namespace(engine_ns)
    api.add_namespace(cohorts_ns)
    api.add_namespace(me_ns)
    api.add_namespace(leaderboard_ns)
    api.add_namespace(export_ns)
    api.add_namespace(catalog_ns)
    api.add_namespace(trainer_ns)
    api.add_namespace(static_pages_ns)

    # Blueprints
    app.register_blueprint(health_bp)

    # Static uploads route (/uploads/*)
    import os
    from flask import send_from_directory
    upload_dir = os.getenv("UPLOAD_DIR", "/app/uploads")

    @app.route('/uploads/<path:filename>')
    def uploads(filename: str):
        return send_from_directory(upload_dir, filename)

    # Ensure new tables exist if migrations are not available (fallback)
    try:
        from sqlalchemy import inspect
        from sqlalchemy import text
        from .models import (
            Cohort,
            CohortMember,
            SessionAllowedType,
            SessionPlayerType,
            CohortCampaign,
            Scenario,
            CampaignScenario,
            PasswordResetToken,
            PhaseResult,
        )
        from .static_pages import StaticPage
        
        with app.app_context():
            insp = inspect(db.engine)
            if not insp.has_table(Cohort.__tablename__):
                Cohort.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(CohortMember.__tablename__):
                CohortMember.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(SessionAllowedType.__tablename__):
                SessionAllowedType.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(SessionPlayerType.__tablename__):
                SessionPlayerType.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(CohortCampaign.__tablename__):
                CohortCampaign.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(Scenario.__tablename__):
                Scenario.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(CampaignScenario.__tablename__):
                CampaignScenario.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(StaticPage.__tablename__):
                StaticPage.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(PasswordResetToken.__tablename__):
                PasswordResetToken.__table__.create(bind=db.engine, checkfirst=True)
            if not insp.has_table(PhaseResult.__tablename__):
                PhaseResult.__table__.create(bind=db.engine, checkfirst=True)

            # Lightweight column backfill for campaigns to avoid 500s when migrations weren't run
            try:
                cols = {c['name'] for c in insp.get_columns('campaigns')}
                # Add seed column if missing
                if 'seed' not in cols:
                    db.session.execute(text("ALTER TABLE campaigns ADD COLUMN seed VARCHAR(128)"))
                # Add published column if missing
                if 'published' not in cols:
                    db.session.execute(text("ALTER TABLE campaigns ADD COLUMN published BOOLEAN DEFAULT FALSE NOT NULL"))
                # Add cover_image_url column if missing
                if 'cover_image_url' not in cols:
                    db.session.execute(text("ALTER TABLE campaigns ADD COLUMN cover_image_url VARCHAR(512)"))
                db.session.commit()
            except Exception:
                db.session.rollback()

            # Lightweight column backfill for two-phase rounds (additive, legacy-safe)
            try:
                session_cols = {c['name'] for c in insp.get_columns('sessions')}
                if 'market_phase' not in session_cols:
                    db.session.execute(text("ALTER TABLE sessions ADD COLUMN market_phase VARCHAR(16)"))
                if 'phase_index' not in session_cols:
                    db.session.execute(text("ALTER TABLE sessions ADD COLUMN phase_index INTEGER DEFAULT 0 NOT NULL"))
                forecast_cols = {c['name'] for c in insp.get_columns('forecasts')}
                if 'market_phase' not in forecast_cols:
                    db.session.execute(text("ALTER TABLE forecasts ADD COLUMN market_phase VARCHAR(16) DEFAULT 'single' NOT NULL"))
                db.session.commit()
            except Exception:
                db.session.rollback()
    except Exception:
        # Ignore any errors; migrations remain the primary path
        pass

    # attach socketio
    socketio.init_app(app)
    # register socket handlers (namespaces, join room, etc.)
    try:
        from . import socket_handlers  # noqa: F401
    except Exception:
        pass

    return app