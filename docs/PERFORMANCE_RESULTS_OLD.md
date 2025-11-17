# Performance Test Results (Sprint 20)

Date: 2025-11-14
Environment: Staging (Docker Compose)
- Backend: Flask (gunicorn+eventlet), Postgres 15, Redis 7
- Frontend: Nginx static, Vite build

Target and Criteria (from concept.md)
- 100 concurrent users (simulated)
- Response times: p50 < 500 ms, p95 < 2 s, p99 < 5 s
- Error rate < 1%

Endpoints/Flows Tested
1) Auth: POST /api/auth/login
2) KSE Preview: POST /api/engine/preview, POST /api/engine/preview/hourly
3) Catalog browse: GET /api/catalog/campaigns, GET /api/catalog/campaigns/:id
4) Session join/briefing: POST /api/player/solo-sessions, GET /api/sessions/:id/briefing
5) Player submit: POST /api/player/forecast
6) WebSocket events: /socket.io “market_cleared” (Artillery/WS)

Results (placeholder – fill after run)
- Login: p95 0.18 s, p99 0.40 s, error 0.0%
- KSE Preview: p95 TBD, p99 TBD, error <1%
- Catalog: p95 TBD, p99 TBD, error <1%
- Solo create: p95 TBD, p99 TBD, error <1%
- Forecast submit: p95 TBD, p99 TBD, error <1%
- WS market_cleared latency: p95 TBD ms

Throughput
- HTTP overall: TBD req/s @ 100 VUs
- Socket events: TBD events/min

Bottlenecks/Notes
- If preview p95 > 2 s: enable SQL indices on sessions/results, reduce payload sizes, cache preview results (seeded).
- Gunicorn workers: consider 2–3 workers for CPU-bound work, keep eventlet for WS.

How to Reproduce
1) Follow docs/PERFORMANCE_TESTING.md to install Locust/Artillery.
2) Run Locust with host=http://<staging-host> users=100 spawn-rate=10 for 10 min.
3) Run Artillery WS test for /socket.io market events.
