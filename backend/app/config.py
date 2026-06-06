import os
from datetime import timedelta


class Config:
    def __init__(self) -> None:
        # Allow instantiation without overriding attributes
        pass

    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(seconds=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES", "3600")))  # 1 hour default
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(seconds=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES", "2592000")))  # 30 days default
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///emsg.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    PROPAGATE_EXCEPTIONS = True

    # Flask-RESTX
    RESTX_MASK_SWAGGER = False
    RESTX_VALIDATE = True
    ERROR_404_HELP = False

    # Swagger settings
    SWAGGER_UI_DOC_EXPANSION = "list"
    API_TITLE = "EMSG API"
    API_VERSION = "0.1.0"
    TRUST_PROXY_HOPS = int(os.getenv("TRUST_PROXY_HOPS", "1"))

    # System Limits (from concept.md)
    MAX_USERS = int(os.getenv("MAX_USERS", "1000"))
    MAX_COHORTS = int(os.getenv("MAX_COHORTS", "10"))
    MAX_PLAYERS_PER_COHORT = int(os.getenv("MAX_PLAYERS_PER_COHORT", "150"))
    MAX_SCENARIOS = int(os.getenv("MAX_SCENARIOS", "100"))