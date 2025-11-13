from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_restx import Api
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
from flask_socketio import SocketIO


db = SQLAlchemy()
migrate = Migrate()
bcrypt = Bcrypt()
jwt = JWTManager()
api = Api(title="EMSG API", version="0.1.0", doc="/api/docs", prefix="/api")
socketio = SocketIO(cors_allowed_origins="*", message_queue="redis://redis:6379/0")
import os
_redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
limiter = Limiter(key_func=get_remote_address, default_limits=["200 per minute"], storage_uri=_redis_url)
# Allow all (per requirement); note: for production consider tightening
# force_https=False allows backend to work behind nginx reverse proxy
talisman = Talisman(content_security_policy=None, force_https=False)