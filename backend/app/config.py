import os


class Config:
    def __init__(self) -> None:
        # Allow instantiation without overriding attributes
        pass

    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret")
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