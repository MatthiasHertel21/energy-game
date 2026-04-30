import pytest
from datetime import datetime, timedelta
from app import create_app, db
from app.models import User, Cohort, Campaign, Scenario, Session, SessionStatus, ActivityLog, CohortMember


@pytest.fixture
def app():
    """Create application for testing."""
    app = create_app()
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    """Test client for the application."""
    return app.test_client()


@pytest.fixture
def auth_headers(app):
    """Generate JWT auth headers for testing."""
    from flask_jwt_extended import create_access_token
    
    with app.app_context():
        # Create trainer user
        trainer = User(email='trainer@test.com', role='trainer')
        trainer.set_password('test123')
        db.session.add(trainer)
        db.session.commit()
        
        token = create_access_token(identity=str(trainer.id), additional_claims={'role': 'trainer'})
        return {'Authorization': f'Bearer {token}'}


def test_presence_endpoint_basic(app, client, auth_headers):
    """Test presence endpoint returns active users."""
    with app.app_context():
        trainer = User.query.filter_by(email='trainer@test.com').first()
        # Create cohort
        cohort = Cohort(name='Test Cohort', trainer_id=trainer.id)
        db.session.add(cohort)
        
        # Create student user
        student = User(email='student@test.com', role='player')
        student.set_password('test123')
        db.session.add(student)
        
        db.session.commit()
        
        # Add student to cohort
        member = CohortMember(cohort_id=cohort.id, user_id=student.id)
        db.session.add(member)
        
        # Create recent activity log entry
        activity = ActivityLog(
            user_id=student.id,
            action_type='page_view',
            cohort_id=cohort.id,
            details={'path': '/dashboard'},
            timestamp=datetime.utcnow()
        )
        db.session.add(activity)
        db.session.commit()
        
        # Call presence endpoint
        response = client.get('/api/trainer/presence', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()['users']

        assert len(data) == 1
        assert data[0]['email'] == 'student@test.com'
        assert data[0]['cohort_name'] == 'Test Cohort'
        assert data[0]['user_id'] == student.id


def test_presence_endpoint_filters_old_activity(app, client, auth_headers):
    """Test presence endpoint excludes users without recent activity."""
    with app.app_context():
        trainer = User.query.filter_by(email='trainer@test.com').first()
        # Create cohort and student
        cohort = Cohort(name='Test Cohort', trainer_id=trainer.id)
        student = User(email='student@test.com', role='player')
        student.set_password('test123')
        db.session.add(cohort)
        db.session.add(student)
        db.session.commit()
        
        member = CohortMember(cohort_id=cohort.id, user_id=student.id)
        db.session.add(member)
        
        # Create OLD activity log entry (10 minutes ago)
        old_activity = ActivityLog(
            user_id=student.id,
            action_type='page_view',
            cohort_id=cohort.id,
            details={'path': '/dashboard'},
            timestamp=datetime.utcnow() - timedelta(minutes=10)
        )
        db.session.add(old_activity)
        db.session.commit()
        
        # Call presence endpoint (default 5 min window)
        response = client.get('/api/trainer/presence', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()['users']
        
        # Should be empty since activity is too old
        assert len(data) == 0


def test_presence_endpoint_with_custom_window(app, client, auth_headers):
    """Test presence endpoint respects custom time window."""
    with app.app_context():
        trainer = User.query.filter_by(email='trainer@test.com').first()
        # Create cohort and student
        cohort = Cohort(name='Test Cohort', trainer_id=trainer.id)
        student = User(email='student@test.com', role='player')
        student.set_password('test123')
        db.session.add(cohort)
        db.session.add(student)
        db.session.commit()
        
        member = CohortMember(cohort_id=cohort.id, user_id=student.id)
        db.session.add(member)
        
        # Create activity 8 minutes ago
        activity = ActivityLog(
            user_id=student.id,
            action_type='page_view',
            cohort_id=cohort.id,
            details={'path': '/dashboard'},
            timestamp=datetime.utcnow() - timedelta(minutes=8)
        )
        db.session.add(activity)
        db.session.commit()
        
        # Call with default window (5 min) - should be empty
        response = client.get('/api/trainer/presence', headers=auth_headers)
        assert response.status_code == 200
        assert len(response.get_json()['users']) == 0
        
        # Call with custom window (10 min) - should find user
        response = client.get('/api/trainer/presence?window=600', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()['users']
        assert len(data) == 1
        assert data[0]['email'] == 'student@test.com'


def test_presence_endpoint_includes_session_info(app, client, auth_headers):
    """Test presence endpoint includes active session information."""
    with app.app_context():
        trainer = User.query.filter_by(email='trainer@test.com').first()
        # Create complete structure: cohort -> campaign -> scenario -> session
        cohort = Cohort(name='Test Cohort', trainer_id=trainer.id)
        campaign = Campaign(name='Test Campaign', description='Test', designer_id=trainer.id)
        scenario = Scenario(name='Test Scenario', campaign_id=None, config={})  # Will set after commit
        db.session.add_all([cohort, campaign, scenario])
        db.session.commit()
        
        scenario.campaign_id = campaign.id
        
        student = User(email='student@test.com', role='player')
        student.set_password('test123')
        db.session.add(student)
        db.session.commit()
        
        member = CohortMember(cohort_id=cohort.id, user_id=student.id)
        db.session.add(member)
        
        # Create active session
        session = Session(
            cohort_id=cohort.id,
            scenario_id=scenario.id,
            mode='shared_market',
            status=SessionStatus.running
        )
        db.session.add(session)
        db.session.commit()
        
        # Create recent activity
        activity = ActivityLog(
            user_id=student.id,
            action_type='game_action',
            session_id=session.id,
            cohort_id=cohort.id,
            details={'session_id': session.id},
            timestamp=datetime.utcnow()
        )
        db.session.add(activity)
        db.session.commit()
        
        # Call presence endpoint
        response = client.get('/api/trainer/presence', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()['users']
        
        assert len(data) == 1
        assert data[0]['campaign_name'] == 'Test Campaign'
        assert data[0]['scenario_name'] == 'Test Scenario'
        assert data[0]['session_id'] == session.id
        assert data[0]['status'] == 'playing'


def test_presence_endpoint_filters_by_cohort(app, client, auth_headers):
    """Test presence endpoint filters by cohort_id parameter."""
    with app.app_context():
        trainer = User.query.filter_by(email='trainer@test.com').first()
        # Create two cohorts
        cohort1 = Cohort(name='Cohort 1', trainer_id=trainer.id)
        cohort2 = Cohort(name='Cohort 2', trainer_id=trainer.id)
        db.session.add_all([cohort1, cohort2])
        db.session.commit()
        
        # Create students in different cohorts
        student1 = User(email='student1@test.com', role='player')
        student1.set_password('test123')
        student2 = User(email='student2@test.com', role='player')
        student2.set_password('test123')
        db.session.add_all([student1, student2])
        db.session.commit()
        
        member1 = CohortMember(cohort_id=cohort1.id, user_id=student1.id)
        member2 = CohortMember(cohort_id=cohort2.id, user_id=student2.id)
        db.session.add_all([member1, member2])
        
        # Create recent activity for both
        activity1 = ActivityLog(user_id=student1.id, cohort_id=cohort1.id, action_type='page_view', details={}, timestamp=datetime.utcnow())
        activity2 = ActivityLog(user_id=student2.id, cohort_id=cohort2.id, action_type='page_view', details={}, timestamp=datetime.utcnow())
        db.session.add_all([activity1, activity2])
        db.session.commit()
        
        # Filter by cohort1
        response = client.get(f'/api/trainer/presence?cohort_id={cohort1.id}', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()['users']
        
        # Should only return student1
        assert len(data) == 1
        assert data[0]['email'] == 'student1@test.com'
        assert data[0]['cohort_name'] == 'Cohort 1'


def test_presence_endpoint_unauthorized(app, client):
    """Test presence endpoint requires authentication."""
    response = client.get('/api/trainer/presence')
    assert response.status_code == 401
