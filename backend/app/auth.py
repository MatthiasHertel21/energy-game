from datetime import datetime
from http import HTTPStatus

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)

from .extensions import db, bcrypt, jwt
from .models import User, Invite, Role
from .utils import log_activity


ns = Namespace("auth", description="Authentication & Invite")

login_model = ns.model(
    "LoginRequest",
    {
        "email": fields.String(required=True),
        "password": fields.String(required=True),
    },
)

register_model = ns.model(
    "RegisterRequest",
    {
        "email": fields.String(required=True),
        "password": fields.String(required=True, description="Min. 12 chars"),
        "invite_token": fields.String(required=False),
    },
)

token_response = ns.model(
    "TokenResponse",
    {
        "access_token": fields.String,
        "refresh_token": fields.String,
        "user": fields.Raw,
    },
)


@jwt.additional_claims_loader
def add_claims_to_access_token(identity):
    user = User.query.get(identity)
    role = user.role.value if user else "player"
    return {"role": role}


@ns.route("/login")
class Login(Resource):
    @ns.expect(login_model, validate=True)
    @ns.marshal_with(token_response)
    def post(self):
        data = request.json
        email = data["email"].strip().lower()
        password = data["password"]
        user = User.query.filter_by(email=email).first()
        if not user or not bcrypt.check_password_hash(user.password_hash, password):
            ns.abort(HTTPStatus.UNAUTHORIZED, "Invalid credentials")

        access = create_access_token(identity=str(user.id), additional_claims={"role": user.role.value})
        refresh = create_refresh_token(identity=str(user.id))
        
        # Log login activity
        try:
            log_activity(user.id, "login")
        except Exception:
            pass  # Don't fail login if logging fails
        
        return {"access_token": access, "refresh_token": refresh, "user": user.to_dict()}


@ns.route("/register")
class Register(Resource):
    @ns.expect(register_model, validate=True)
    @ns.marshal_with(token_response)
    def post(self):
        data = request.json
        email = data["email"].strip().lower()
        password = data["password"]
        invite_token = data.get("invite_token")

        if len(password) < 8:
            ns.abort(HTTPStatus.BAD_REQUEST, "Password too short")

        if User.query.filter_by(email=email).first():
            ns.abort(HTTPStatus.CONFLICT, "Email already registered")

        role = Role.player
        # Bootstrap: first ever user becomes admin
        if User.query.count() == 0:
            role = Role.admin
        if invite_token and role != Role.admin:
            inv = Invite.query.filter_by(token=invite_token).first()
            if not inv or not inv.is_valid() or inv.email.lower() != email:
                ns.abort(HTTPStatus.BAD_REQUEST, "Invalid or expired invite")
            role = inv.role
            inv.used = True
            db.session.add(inv)

        pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(email=email, password_hash=pw_hash, role=role)
        db.session.add(user)
        db.session.commit()

        access = create_access_token(identity=str(user.id), additional_claims={"role": user.role.value})
        refresh = create_refresh_token(identity=str(user.id))
        return {"access_token": access, "refresh_token": refresh, "user": user.to_dict()}


@ns.route("/refresh")
class Refresh(Resource):
    @jwt_required(refresh=True)
    @ns.marshal_with(token_response)
    def post(self):
        identity = get_jwt_identity()
        user = User.query.get(int(identity))
        if not user:
            ns.abort(HTTPStatus.UNAUTHORIZED, "User not found")
        access = create_access_token(identity=str(user.id), additional_claims={"role": user.role.value})
        refresh = create_refresh_token(identity=str(user.id))
        return {"access_token": access, "refresh_token": refresh, "user": user.to_dict()}


invite_response = ns.model(
    "InviteInfo",
    {
        "email": fields.String,
        "role": fields.String,
        "valid": fields.Boolean,
        "expires_at": fields.String,
    },
)


@ns.route("/invite/<string:token>")
class InviteInfo(Resource):
    @ns.marshal_with(invite_response)
    def get(self, token: str):
        inv = Invite.query.filter_by(token=token).first()
        if not inv:
            ns.abort(HTTPStatus.NOT_FOUND, "Invite not found")
        return {
            "email": inv.email,
            "role": inv.role.value,
            "valid": inv.is_valid(),
            "expires_at": inv.expires_at.isoformat() + "Z",
        }