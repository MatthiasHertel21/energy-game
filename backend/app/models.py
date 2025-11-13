from datetime import datetime, timedelta
import enum
import uuid

from .extensions import db


class Role(enum.Enum):
    player = "player"
    trainer = "trainer"
    designer = "designer"
    admin = "admin"


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum(Role), nullable=False, default=Role.player)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "role": self.role.value,
            "created_at": self.created_at.isoformat() + "Z",
        }


class Invite(db.Model):
    __tablename__ = "invites"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    role = db.Column(db.Enum(Role), nullable=False, default=Role.player)
    token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    cohort_id = db.Column(db.Integer, db.ForeignKey("cohorts.id"), nullable=True)

    @staticmethod
    def generate(email: str, role: Role, days_valid: int = 7) -> "Invite":
        token = uuid.uuid4().hex
        expires = datetime.utcnow() + timedelta(days=days_valid)
        return Invite(email=email.lower().strip(), role=role, token=token, expires_at=expires)

    def is_valid(self) -> bool:
        return (not self.used) and (self.expires_at >= datetime.utcnow())


class Cohort(db.Model):
    __tablename__ = "cohorts"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    trainer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class CohortMember(db.Model):
    __tablename__ = "cohort_members"

    id = db.Column(db.Integer, primary_key=True)
    cohort_id = db.Column(db.Integer, db.ForeignKey("cohorts.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    __table_args__ = (db.UniqueConstraint("cohort_id", "user_id", name="uq_cohort_user"),)


class CohortCampaign(db.Model):
    __tablename__ = "cohort_campaigns"

    id = db.Column(db.Integer, primary_key=True)
    cohort_id = db.Column(db.Integer, db.ForeignKey("cohorts.id"), nullable=False, index=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey("campaigns.id"), nullable=False, index=True)
    visible = db.Column(db.Boolean, nullable=False, default=False)
    active = db.Column(db.Boolean, nullable=False, default=False)

    __table_args__ = (
        db.UniqueConstraint("cohort_id", "campaign_id", name="uq_cohort_campaign"),
    )


class Campaign(db.Model):
    __tablename__ = "campaigns"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, default="")
    designer_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    cover_image_url = db.Column(db.String(512))
    published = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Scenario(db.Model):
    __tablename__ = "scenarios"

    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey("campaigns.id"), nullable=True)
    name = db.Column(db.String(200), nullable=False)
    config = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class CampaignScenario(db.Model):
    __tablename__ = "campaign_scenarios"

    id = db.Column(db.Integer, primary_key=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey("campaigns.id"), nullable=False, index=True)
    scenario_id = db.Column(db.Integer, db.ForeignKey("scenarios.id"), nullable=False, index=True)
    order_index = db.Column(db.Integer, nullable=False, default=0)
    solo_enabled = db.Column(db.Boolean, nullable=False, default=True)
    cohort_enabled = db.Column(db.Boolean, nullable=False, default=True)

    __table_args__ = (
        db.UniqueConstraint("campaign_id", "scenario_id", name="uq_campaign_scenario"),
    )


class SessionStatus(enum.Enum):
    created = "created"
    running = "running"
    paused = "paused"
    ended = "ended"


class Session(db.Model):
    __tablename__ = "sessions"

    id = db.Column(db.Integer, primary_key=True)
    cohort_id = db.Column(db.Integer, db.ForeignKey("cohorts.id"), nullable=False)
    scenario_id = db.Column(db.Integer, db.ForeignKey("scenarios.id"), nullable=False)
    status = db.Column(db.Enum(SessionStatus), nullable=False, default=SessionStatus.created)
    current_round = db.Column(db.Integer, default=1, nullable=False)
    started_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    mode = db.Column(db.String(32), default="isolated_per_player", nullable=False)


class SessionAllowedType(db.Model):
    __tablename__ = "session_allowed_types"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("sessions.id"), nullable=False, index=True)
    type_id = db.Column(db.String(120), nullable=False)
    max_players = db.Column(db.Integer, nullable=True)

    __table_args__ = (
        db.UniqueConstraint("session_id", "type_id", name="uq_session_type"),
    )


class SessionPlayerType(db.Model):
    __tablename__ = "session_player_types"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("sessions.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    type_id = db.Column(db.String(120), nullable=False)
    selected_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("session_id", "user_id", name="uq_session_user_type"),
    )


class Forecast(db.Model):
    __tablename__ = "forecasts"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("sessions.id"), nullable=False, index=True)
    player_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    round_num = db.Column(db.Integer, nullable=False, index=True)
    data = db.Column(db.JSON, nullable=False)
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Result(db.Model):
    __tablename__ = "results"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey("sessions.id"), nullable=False, index=True)
    player_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    round_num = db.Column(db.Integer, nullable=False, index=True)
    data = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class PlayerProgressStatus(enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"


class PlayerProgress(db.Model):
    __tablename__ = "player_progress"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    campaign_id = db.Column(db.Integer, db.ForeignKey("campaigns.id"), nullable=False, index=True)
    scenario_id = db.Column(db.Integer, db.ForeignKey("scenarios.id"), nullable=False, index=True)
    status = db.Column(db.Enum(PlayerProgressStatus), nullable=False, default=PlayerProgressStatus.not_started)
    started_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime)

    __table_args__ = (
        db.UniqueConstraint("user_id", "campaign_id", "scenario_id", name="uq_progress_user_campaign_scenario"),
    )


class ReferenceRun(db.Model):
    __tablename__ = "reference_runs"

    id = db.Column(db.Integer, primary_key=True)
    scenario_id = db.Column(db.Integer, db.ForeignKey("scenarios.id"), nullable=False, index=True)
    name = db.Column(db.String(200), nullable=False)
    data = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)