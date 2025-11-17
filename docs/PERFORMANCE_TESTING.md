# Performance Testing Guide

## Overview
This document describes how to run performance tests for the EMSG system using Locust.

## Requirements
- Python 3.11+
- Locust installed (`pip install locust`)
- Running backend instance (http://localhost:5000 or configured host)

## Setup

### 1. Install Locust
```bash
# Using pip in virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate
pip install locust

# Or using pipx (system-wide)
pipx install locust
```

### 2. Start Backend
Ensure the backend is running:
```bash
cd backend
python run.py
# Or using docker-compose
docker-compose up backend
```

## Running Tests

### Basic Test Run
```bash
cd backend/tests/perf
locust -f locustfile.py --host=http://localhost:5000
```

Then open http://localhost:8089 in your browser to configure:
- Number of users (concurrent)
- Spawn rate (users/second)
- Host URL

### Headless Mode (CI/CD)
```bash
locust -f locustfile.py \
  --host=http://localhost:5000 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m \
  --headless \
  --html=report.html
```

### Concept.md Target: 80 Players Scenario
To validate the requirement of ≥100 concurrent users with p95 < 2s:

```bash
locust -f locustfile.py \
  --host=http://localhost:5000 \
  --users 100 \
  --spawn-rate 20 \
  --run-time 10m \
  --headless \
  --csv=results \
  --html=results.html
```

## Test Scenarios

### Current Tests (locustfile.py)
1. **Health Check** (2x weight): GET /api/health
2. **Preview Engine** (1x weight): POST /api/engine/preview with sample config

### Recommended Additional Tests
Add these scenarios to locustfile.py for comprehensive testing:

```python
@task(3)
def player_forecast_submit(self):
    """Simulate player submitting round forecast"""
    # Requires auth token and active session
    headers = {"Authorization": f"Bearer {self.token}"}
    payload = {
        "session_id": 1,
        "round_num": 1,
        "hours": [100.0] * 6
    }
    self.client.post("/api/player/forecast", json=payload, headers=headers)

@task(2)
def trainer_status(self):
    """Simulate trainer checking session status"""
    headers = {"Authorization": f"Bearer {self.token}"}
    self.client.get("/api/sessions/1/status", headers=headers)
```

## Success Criteria (from concept.md)
- ✅ Support ≥100 concurrent users
- ✅ p95 response time < 2,000 ms
- ✅ 500 WebSocket connections

## Interpreting Results

### Key Metrics
- **Response Time (p95)**: Must be < 2,000 ms for concept compliance
- **Requests/second**: Throughput indicator
- **Failure Rate**: Should be < 1% under normal load

### Example Good Result
```
Type     Name                          # reqs   # fails  Avg    Min    Max  Median  p95
------------------------------------------------------------------------
POST     /api/engine/preview           5000     0        450    120    1800  400     980
GET      /api/health                   10000    0        12     5      50    10      25
------------------------------------------------------------------------
Aggregated                             15000    0        180    5      1800  95      980
```

## Troubleshooting

### Backend Not Responding
- Check if backend is running: `curl http://localhost:5000/api/health`
- Check Docker logs: `docker-compose logs backend`
- Verify DATABASE_URL and REDIS_URL environment variables

### High Failure Rate
- Check backend error logs
- Reduce spawn rate (users added per second)
- Verify database connections are not exhausted

### WebSocket Tests
For Socket.IO performance testing, use a separate tool like `artillery`:
```yaml
# artillery.yml
config:
  target: "http://localhost:5000"
  socketio:
    transports: ["websocket"]
  phases:
    - duration: 300
      arrivalRate: 10
      name: "Warm up"
scenarios:
  - engine: socketio
    flow:
      - emit:
          channel: "connect"
          namespace: "/game/1"
```

Run: `artillery run artillery.yml`

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Performance Tests

on:
  schedule:
    - cron: '0 2 * * 1' # Weekly on Monday 2am

jobs:
  perf:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v3
      - name: Start Backend
        run: docker-compose up -d backend
      - name: Install Locust
        run: pip install locust
      - name: Run Tests
        run: |
          cd backend/tests/perf
          locust -f locustfile.py \
            --host=http://localhost:5000 \
            --users 100 \
            --spawn-rate 20 \
            --run-time 5m \
            --headless \
            --html=report.html \
            --exit-code-on-error
      - name: Upload Report
        uses: actions/upload-artifact@v3
        with:
          name: perf-report
          path: backend/tests/perf/report.html
```

## Next Steps
1. Extend locustfile.py with authenticated user flows
2. Add WebSocket load testing with artillery
3. Set up automated performance regression tests
4. Document baseline metrics for comparison

## References
- Locust Documentation: https://docs.locust.io/
- Concept.md Section 3.6: Performance Requirements
- REQUIREMENTS_CHECK.md: Performance section
