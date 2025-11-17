import pytest
from app import create_app, db
from app.models import User, Cohort, CohortMember
from unittest.mock import patch, MagicMock


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
def player_auth_headers(app):
    """Generate JWT auth headers for player user."""
    from flask_jwt_extended import create_access_token
    
    with app.app_context():
        player = User(email='player@test.com', role='player')
        player.set_password('test123')
        db.session.add(player)
        db.session.commit()
        
        token = create_access_token(identity=player.id)
        return {'Authorization': f'Bearer {token}'}, player.id


def test_navigate_endpoint_returns_null_when_no_navigation(app, client, player_auth_headers):
    """Test /api/me/navigate returns null when no force navigation active."""
    headers, player_id = player_auth_headers
    
    with app.app_context():
        # Create cohort and add player as member
        cohort = Cohort(name='Test Cohort')
        db.session.add(cohort)
        db.session.commit()
        
        member = CohortMember(cohort_id=cohort.id, user_id=player_id)
        db.session.add(member)
        db.session.commit()
        
        # Mock Redis to return None (no navigation key)
        with patch('app.me._redis_client') as mock_redis:
            mock_redis.get.return_value = None
            
            response = client.get('/api/me/navigate', headers=headers)
            
            assert response.status_code == 200
            data = response.get_json()
            assert data['url'] is None


def test_navigate_endpoint_returns_url_when_force_navigate_active(app, client, player_auth_headers):
    """Test /api/me/navigate returns URL when force navigation is set."""
    headers, player_id = player_auth_headers
    
    with app.app_context():
        # Create cohort and add player as member
        cohort = Cohort(name='Test Cohort')
        db.session.add(cohort)
        db.session.commit()
        
        member = CohortMember(cohort_id=cohort.id, user_id=player_id)
        db.session.add(member)
        db.session.commit()
        
        # Mock Redis to return navigation URL
        with patch('app.me._redis_client') as mock_redis:
            mock_redis.get.return_value = b'/briefing/42'
            
            response = client.get('/api/me/navigate', headers=headers)
            
            assert response.status_code == 200
            data = response.get_json()
            assert data['url'] == '/briefing/42'


def test_navigate_endpoint_checks_all_user_cohorts(app, client, player_auth_headers):
    """Test /api/me/navigate checks all cohorts the user belongs to."""
    headers, player_id = player_auth_headers
    
    with app.app_context():
        # Create multiple cohorts
        cohort1 = Cohort(name='Cohort 1')
        cohort2 = Cohort(name='Cohort 2')
        db.session.add_all([cohort1, cohort2])
        db.session.commit()
        
        # Add player to both cohorts
        member1 = CohortMember(cohort_id=cohort1.id, user_id=player_id)
        member2 = CohortMember(cohort_id=cohort2.id, user_id=player_id)
        db.session.add_all([member1, member2])
        db.session.commit()
        
        # Mock Redis: cohort1 has no navigation, cohort2 has navigation
        with patch('app.me._redis_client') as mock_redis:
            def get_side_effect(key):
                if key == f'cohort:{cohort2.id}:force_nav':
                    return b'/briefing/99'
                return None
            
            mock_redis.get.side_effect = get_side_effect
            
            response = client.get('/api/me/navigate', headers=headers)
            
            assert response.status_code == 200
            data = response.get_json()
            assert data['url'] == '/briefing/99'


def test_navigate_endpoint_requires_auth(app, client):
    """Test /api/me/navigate requires authentication."""
    response = client.get('/api/me/navigate')
    assert response.status_code == 401


def test_navigate_endpoint_handles_no_cohort_membership(app, client, player_auth_headers):
    """Test /api/me/navigate handles users not in any cohort."""
    headers, _ = player_auth_headers
    
    with app.app_context():
        # Don't add user to any cohort
        
        response = client.get('/api/me/navigate', headers=headers)
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['url'] is None


def test_navigate_endpoint_handles_redis_unavailable(app, client, player_auth_headers):
    """Test /api/me/navigate handles gracefully when Redis is unavailable."""
    headers, player_id = player_auth_headers
    
    with app.app_context():
        # Create cohort and add player
        cohort = Cohort(name='Test Cohort')
        db.session.add(cohort)
        db.session.commit()
        
        member = CohortMember(cohort_id=cohort.id, user_id=player_id)
        db.session.add(member)
        db.session.commit()
        
        # Mock Redis as None (unavailable)
        with patch('app.me._redis_client', None):
            response = client.get('/api/me/navigate', headers=headers)
            
            assert response.status_code == 200
            data = response.get_json()
            assert data['url'] is None
