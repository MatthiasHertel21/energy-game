from flask_socketio import join_room
from .extensions import socketio

@socketio.on('join_session', namespace='/game')
def on_join_session(data):
    try:
        sid = str(data.get('session_id') or '')
        if sid:
            join_room(f'session-{sid}')
    except Exception:
        # Ignore invalid payloads silently
        pass
