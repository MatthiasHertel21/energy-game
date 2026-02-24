#!/usr/bin/env python3
from app import create_app
from app.models import Session, Scenario

app = create_app()

with app.app_context():
    s = Session.query.get(200)
    if s:
        print(f'Session 200 exists: {s.title}')
        print(f'Scenario ID: {s.scenario_id}')
        sc = Scenario.query.get(s.scenario_id)
        if sc:
            print(f'Scenario: {sc.title}')
            print(f'Has config: {bool(sc.config)}')
        else:
            print('Scenario NOT FOUND')
    else:
        print('Session 200 NOT FOUND')
