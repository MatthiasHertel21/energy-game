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
from .models import User, Invite, Role, PasswordResetToken
from .utils import log_activity
from .config import Config
from . import mailer


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

        # Update last login timestamp
        user.last_login = datetime.utcnow()
        db.session.commit()

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

        # Check system limit for max users (skip check if first user/admin bootstrap)
        user_count = User.query.count()
        if user_count > 0 and user_count >= Config.MAX_USERS:
            ns.abort(HTTPStatus.FORBIDDEN, f"System limit reached: maximum {Config.MAX_USERS} users allowed")

        role = Role.player
        cohort_id = None
        # Bootstrap: first ever user becomes admin
        if user_count == 0:
            role = Role.admin
        if invite_token and role != Role.admin:
            inv = Invite.query.filter_by(token=invite_token).first()
            # Allow empty email in invite for cohort-wide tokens
            if not inv:
                ns.abort(HTTPStatus.BAD_REQUEST, "Invalid invite token. Please request a new invitation link.")
            if not inv.is_valid():
                ns.abort(HTTPStatus.BAD_REQUEST, "Invite token has expired or has already been used. Please request a new invitation link.")
            if inv.email and inv.email.lower() != email:
                ns.abort(HTTPStatus.BAD_REQUEST, "This invite token is for a different email address.")
            role = inv.role
            cohort_id = inv.cohort_id
            # Only mark email-specific invites as used
            # Cohort-wide invites (empty email) can be reused
            if inv.email:
                inv.used = True
                db.session.add(inv)

        pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(email=email, password_hash=pw_hash, role=role)
        db.session.add(user)
        db.session.flush()  # Get user.id
        
        # Add user to cohort if invite had cohort_id
        if cohort_id:
            from .models import CohortMember
            member = CohortMember(cohort_id=cohort_id, user_id=user.id)
            db.session.add(member)
        
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


password_reset_request_model = ns.model(
    "PasswordResetRequest",
    {"email": fields.String(required=True)},
)

password_reset_confirm_model = ns.model(
    "PasswordResetConfirm",
    {
        "token": fields.String(required=True),
        "new_password": fields.String(required=True),
    },
)


@ns.route("/password-reset/request")
class PasswordResetRequest(Resource):
    @ns.expect(password_reset_request_model, validate=True)
    def post(self):
        """Request a password reset link. Always returns 200 to avoid email enumeration."""
        email = (request.json.get("email") or "").strip().lower()
        user = User.query.filter_by(email=email).first()
        if user:
            # Invalidate any existing unused tokens for this user
            PasswordResetToken.query.filter_by(user_id=user.id, used=False).update({"used": True})
            db.session.flush()
            prt = PasswordResetToken.generate(user.id)
            db.session.add(prt)
            db.session.commit()
            try:
                mailer.send_password_reset_link_email(user.email, prt.token)
            except Exception:
                pass  # Silent — don't leak SMTP errors to caller
        return {"message": "If that email is registered, a reset link has been sent."}, HTTPStatus.OK


@ns.route("/password-reset/confirm")
class PasswordResetConfirm(Resource):
    @ns.expect(password_reset_confirm_model, validate=True)
    def post(self):
        """Confirm a password reset using a token."""
        token_str = (request.json.get("token") or "").strip()
        new_password = request.json.get("new_password") or ""

        if len(new_password) < 8:
            ns.abort(HTTPStatus.BAD_REQUEST, "Password too short (min 8 characters)")

        prt = PasswordResetToken.query.filter_by(token=token_str).first()
        if not prt or not prt.is_valid:
            ns.abort(HTTPStatus.BAD_REQUEST, "Invalid or expired reset token")

        user = User.query.get(prt.user_id)
        if not user:
            ns.abort(HTTPStatus.BAD_REQUEST, "Invalid or expired reset token")

        user.set_password(new_password)
        prt.used = True
        db.session.commit()
        return {"message": "Password updated successfully."}, HTTPStatus.OK