from http import HTTPStatus
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required

from .extensions import db, bcrypt
from .models import User, Invite, Role
from . import mailer
from .utils import role_required


ns = Namespace("admin", description="Admin endpoints")

user_out = ns.model(
    "User",
    {
        "id": fields.Integer,
        "email": fields.String,
        "role": fields.String,
        "created_at": fields.String,
    },
)

invite_in = ns.model(
    "InviteCreate",
    {
        "email": fields.String(required=True),
        "role": fields.String(required=True, enum=[r.value for r in Role]),
    },
)

role_patch = ns.model(
    "RolePatch",
    {"role": fields.String(required=True, enum=[r.value for r in Role])},
)


@ns.route("/users")
class Users(Resource):
    @jwt_required()
    @role_required("admin")
    @ns.marshal_list_with(user_out)
    def get(self):
        return [u.to_dict() for u in User.query.order_by(User.id.asc()).all()]

    create_in = ns.model(
        "UserCreate",
        {
            "email": fields.String(required=True),
            "role": fields.String(required=True, enum=[r.value for r in Role]),
            "password": fields.String(required=False, description="Temporary password (min 12 chars). If omitted, a strong password is generated."),
            "send_email": fields.Boolean(required=False, description="If true, send credentials via email (if SMTP configured).", default=True),
        },
    )

    @jwt_required()
    @role_required("admin")
    @ns.expect(create_in, validate=True)
    def post(self):
        body = request.json
        email = body.get("email", "").strip().lower()
        try:
            role = Role(body.get("role"))
        except Exception:
            ns.abort(HTTPStatus.BAD_REQUEST, "Invalid role")

        if not email:
            ns.abort(HTTPStatus.BAD_REQUEST, "Email required")

        if User.query.filter_by(email=email).first():
            ns.abort(HTTPStatus.CONFLICT, "Email already registered")

        password = body.get("password")
        if password and len(password) < 12:
            ns.abort(HTTPStatus.BAD_REQUEST, "Password too short (min 12)")

        # generate strong password if not provided
        if not password:
            import secrets, string
            alphabet = string.ascii_letters + string.digits + string.punctuation
            # Exclude whitespace-like chars that sometimes break copying
            alphabet = alphabet.replace("`", "").replace("\\", "")
            password = ''.join(secrets.choice(alphabet) for _ in range(16))

        pw_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(email=email, password_hash=pw_hash, role=role)
        db.session.add(user)
        db.session.commit()

        email_sent = False
        email_error = None
        if body.get("send_email", True):
            try:
                email_sent, email_error = mailer.send_account_created_email(email, email, password)
            except Exception as e:
                email_sent = False
                email_error = str(e)

        return {
            "status": "ok",
            "user": user.to_dict(),
            "email_sent": bool(email_sent),
            "email_error": (None if email_sent else email_error),
        }, HTTPStatus.CREATED


@ns.route("/users/<int:user_id>/role")
class UserRole(Resource):
    @jwt_required()
    @role_required("admin")
    @ns.expect(role_patch, validate=True)
    def post(self, user_id: int):
        body = request.json
        role_str = body.get("role")
        try:
            new_role = Role(role_str)
        except ValueError:
            ns.abort(HTTPStatus.BAD_REQUEST, "Invalid role")
        user = User.query.get_or_404(user_id)
        user.role = new_role
        db.session.commit()
        return {"status": "ok", "user": user.to_dict()}


@ns.route("/users/<int:user_id>")
class UserItem(Resource):
    @jwt_required()
    @role_required("admin")
    def delete(self, user_id: int):
        """Delete a user. Prevent deleting yourself."""
        user = User.query.get_or_404(user_id)

        # Prevent deleting yourself
        from flask_jwt_extended import get_jwt_identity
        current_user_id = int(get_jwt_identity())
        if user.id == current_user_id:
            ns.abort(HTTPStatus.BAD_REQUEST, "Cannot delete yourself")

        db.session.delete(user)
        db.session.commit()
        return {"status": "ok", "message": f"User {user.email} deleted"}


# (Removed duplicate UserDelete route with unreachable code)


@ns.route("/invites")
class Invites(Resource):
    @jwt_required()
    @role_required("admin")
    @ns.expect(invite_in, validate=True)
    def post(self):
        data = request.json
        email = data["email"].strip().lower()
        try:
            role = Role(data["role"])
        except ValueError:
            ns.abort(HTTPStatus.BAD_REQUEST, "Invalid role")

        inv = Invite.generate(email=email, role=role, days_valid=7)
        db.session.add(inv)
        db.session.commit()

        # try to send invite email (best-effort)
        email_sent, error = mailer.send_invite_email(inv.email, f"/register?token={inv.token}&email={inv.email}", inv.role.value)

        return {
            "status": "ok",
            "invite": {
                "email": inv.email,
                "role": inv.role.value,
                "token": inv.token,
                "expires_at": inv.expires_at.isoformat() + "Z",
                "link": f"/register?token={inv.token}&email={inv.email}",
                "email_sent": bool(email_sent),
                "email_error": (None if email_sent else error),
            },
        }, HTTPStatus.CREATED