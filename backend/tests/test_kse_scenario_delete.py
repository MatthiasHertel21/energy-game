import pytest
from flask_jwt_extended import create_access_token

from app import create_app, db
from app.models import Cohort, Scenario, Session, SessionAllowedType, SessionPlayerType, User


@pytest.fixture
def app():
    app = create_app()
    app.config["TESTING"] = True
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def designer_headers(app):
    with app.app_context():
        designer = User(email="designer-delete-scenario@test.local", role="designer", password_hash="x")
        db.session.add(designer)
        db.session.commit()

        token = create_access_token(identity=str(designer.id), additional_claims={"role": "designer"})
        return {"Authorization": f"Bearer {token}"}, designer.id


def test_delete_scenario_removes_session_type_dependencies(app, client, designer_headers):
    headers, designer_id = designer_headers

    with app.app_context():
        cohort = Cohort(name="Delete Scenario Cohort", trainer_id=designer_id)
        db.session.add(cohort)
        db.session.commit()

        scenario = Scenario(name="xLevel1", config={"general": {"horizon_hours": 24, "round_span_hours": 6, "rounds": 4, "forecast_horizon_hours": 48}})
        db.session.add(scenario)
        db.session.commit()

        session = Session(cohort_id=cohort.id, scenario_id=scenario.id)
        db.session.add(session)
        db.session.commit()

        db.session.add(SessionAllowedType(session_id=session.id, type_id="producer", max_players=1))
        db.session.add(SessionPlayerType(session_id=session.id, user_id=designer_id, type_id="producer"))
        db.session.commit()

        scenario_id = scenario.id
        session_id = session.id

    response = client.delete(f"/api/kse/scenarios/{scenario_id}", headers=headers)

    assert response.status_code == 200, response.get_json()

    with app.app_context():
        assert Scenario.query.get(scenario_id) is None
        assert Session.query.get(session_id) is None
        assert SessionAllowedType.query.filter_by(session_id=session_id).count() == 0
        assert SessionPlayerType.query.filter_by(session_id=session_id).count() == 0