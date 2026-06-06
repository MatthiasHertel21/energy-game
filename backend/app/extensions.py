from flask import request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager, get_jwt_identity, verify_jwt_in_request
from flask_jwt_extended.exceptions import JWTExtendedException
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
_default_limit = os.getenv("RATELIMIT_DEFAULT", "600 per minute")


def _limiter_key() -> str:
	try:
		verify_jwt_in_request(optional=True)
		identity = get_jwt_identity()
		if identity is not None:
			return f"user:{identity}"
	except JWTExtendedException:
		pass

	forwarded_for = request.headers.get("X-Forwarded-For", "")
	if forwarded_for:
		client_ip = forwarded_for.split(",")[0].strip()
		if client_ip:
			return f"ip:{client_ip}"

	return f"ip:{get_remote_address() or 'unknown'}"


limiter = Limiter(key_func=_limiter_key, default_limits=[_default_limit], storage_uri=_redis_url)
# Allow all (per requirement); note: for production consider tightening
# force_https=False allows backend to work behind nginx reverse proxy
talisman = Talisman(content_security_policy=None, force_https=False)