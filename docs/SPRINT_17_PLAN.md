# Sprint 17 Plan – Final Polish & Production Readiness

Date: 2025-11-14
Duration: 5–7 Tage
Branch: feature/catalog-campaigns → main (merge preparation)

## Goal
Complete remaining use cases, finalize documentation, and prepare for production deployment. Focus on admin/designer workflows and system robustness.

## Scope

### 1. UC-17: Admin Session Cleanup (Backend + Frontend)
**Context**: Admins need ability to clean up old/stale sessions to maintain database health.

**Backend**: `backend/app/admin.py` (NEW endpoints)
- `GET /api/admin/sessions?status=&scenario_id=&date_from=&date_to=&limit=100&offset=0`
  - Returns: List of sessions with filters (status, scenario_id, date range)
  - Columns: id, scenario_id, scenario_name, cohort_id, cohort_name, status, created_at, updated_at, round, player_count
- `DELETE /api/admin/sessions/:id`
  - Soft delete or hard delete (configurable)
  - Returns: 204 No Content on success
- `POST /api/admin/sessions/cleanup`
  - Batch cleanup: { "status": "completed", "older_than_days": 90 }
  - Returns: { "deleted_count": N }

**Frontend**: `frontend/src/pages/AdminSessions.jsx` (NEW)
- **Table**: SessionID, Scenario, Cohort, Status, Created, Updated, Round, Players, Actions
- **Filters**: Status dropdown, Date range picker, Scenario select
- **Actions**: Delete button (single), Bulk cleanup button
- **Confirmation**: Dialog with session details before deletion
- **Pagination**: TablePagination component (10/25/50/100 per page)

**Acceptance**:
- ✅ Admin can view all sessions with filters
- ✅ Single session deletion with confirmation
- ✅ Bulk cleanup with criteria (status, age)
- ✅ Proper error handling and feedback

**Technical Approach**:
- Backend: role_required('admin'), SQLAlchemy query with filters
- Frontend: Material-UI Table, DateRangePicker, ConfirmDialog reuse
- State: useState for filters, useEffect for data loading

---

### 2. UC-18: Scenario→Sessions List (Designer View)
**Context**: Designers need to see which sessions have used their scenarios.

**Backend**: `backend/app/kse.py` (Enhanced)
- `GET /api/kse/scenarios/:id/sessions?limit=50&offset=0`
  - Returns: List of sessions that used this scenario
  - Columns: session_id, cohort_name, trainer_email, status, created_at, round, player_count
  - Only shows sessions from scenarios owned by current designer (designer_id check)

**Frontend**: `frontend/src/pages/KSE.jsx` (Enhanced)
- New Tab: "Usage" (9th tab)
- **Table**: SessionID, Cohort, Trainer, Status, Created, Round, Players
- **Empty State**: "No sessions have used this scenario yet"
- **Link**: Click session_id → navigate to /trainer (if trainer role) or show details dialog
- **Pagination**: TablePagination (10/25/50)

**Acceptance**:
- ✅ Designer sees all sessions using their scenarios
- ✅ Clear visibility into scenario adoption
- ✅ Empty state for unused scenarios
- ✅ Pagination for high-use scenarios

**Technical Approach**:
- Backend: JOIN sessions ON scenario_id, WHERE scenario.designer_id = current_user.id
- Frontend: Add "Usage" tab to KSE tabs, API service call
- State: useEffect when tab === 8 (Usage tab)

---

### 3. UC-19: Cascade Deletes (DB Migration + Backend)
**Context**: Deleting campaigns/scenarios should handle dependent records gracefully.

**Database Migration**: `backend/migrations/versions/XXX_cascade_deletes.py`
- Modify Foreign Keys:
  - `scenarios.campaign_id` → `ON DELETE CASCADE`
  - `campaign_cohorts.campaign_id` → `ON DELETE CASCADE`
  - `sessions.scenario_id` → `ON DELETE SET NULL` (preserve session history)
  - `player_progress.session_id` → `ON DELETE CASCADE`
  - `cohort_members.cohort_id` → `ON DELETE CASCADE`

**Backend**: `backend/app/kse.py`, `backend/app/cohorts.py`
- `DELETE /api/kse/campaigns/:id`
  - Currently returns 403 if scenarios exist
  - Enhanced: Cascade delete scenarios → update session.scenario_id to NULL
  - Returns: { "deleted": true, "scenarios_deleted": N, "sessions_updated": M }
- `DELETE /api/cohorts/:id`
  - Already implemented, verify cascade behavior
  - Ensure campaign_cohorts mappings removed

**Frontend**: `frontend/src/pages/KSE.jsx`
- Enhanced Delete Campaign Dialog
- Warning message: "This will delete X scenarios and unlink Y sessions. Sessions will be preserved but marked as 'scenario deleted'."
- Confirmation: Checkbox "I understand this action cannot be undone"

**Acceptance**:
- ✅ Deleting campaign cascades to scenarios
- ✅ Sessions preserved with scenario_id=NULL (historical data)
- ✅ Deleting cohort removes members and campaign mappings
- ✅ Clear warnings in UI about cascade effects

**Technical Approach**:
- Migration: Alembic migration with foreign key alterations
- Backend: SQLAlchemy cascade options, session.scenario_id = NULL update
- Frontend: Enhanced confirmation dialog with impact preview

---

### 4. Documentation: Production Deployment Guide
**File**: `docs/DEPLOYMENT.md` (NEW)

**Content**:
- **Prerequisites**: Docker, docker-compose, SSL certificates, domain name
- **Environment Variables**: Complete .env.production template
  - Database: POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
  - Redis: REDIS_URL
  - Security: SECRET_KEY, JWT_SECRET_KEY
  - CORS: ALLOWED_ORIGINS (production domain)
  - Email: SMTP_* settings for mailer
  - PDF: PDF_PRIMARY_COLOR, PDF_SECONDARY_COLOR, PDF_LOGO_PATH
  - Limits: MAX_USERS, MAX_COHORTS, MAX_PLAYERS_PER_COHORT, MAX_SCENARIOS
- **SSL/TLS**: Traefik configuration, Let's Encrypt setup
- **Database Setup**: Initial migration, admin user creation
- **Backup Strategy**: PostgreSQL pg_dump schedule, uploads/ directory backup
- **Monitoring**: Netdata/Sentry integration (already configured in concept.md)
- **Updates**: Git pull, database migration, docker-compose restart
- **Troubleshooting**: Common issues (CORS, WebSocket, DB connection)

**Acceptance**:
- ✅ Step-by-step deployment instructions
- ✅ Complete .env.production template
- ✅ Backup and monitoring guidance
- ✅ Ready for production use

---

### 5. Performance Testing Execution
**Context**: Locust tests documented in PERFORMANCE_TESTING.md, need execution + results.

**Tasks**:
- Run Locust against staging/production-like environment
- Target: 100 concurrent users (concept.md requirement)
- Scenarios: Login, KSE Fetch, Session Join, Player Submit
- Success Criteria: p50 < 500ms, p95 < 2s, p99 < 5s, error rate < 1%
- Document Results: `docs/PERFORMANCE_RESULTS.md`

**Acceptance**:
- ✅ Locust tests executed with 100 concurrent users
- ✅ Results documented (response times, throughput, error rate)
- ✅ Performance meets concept.md requirements (p95 < 2s)
- ✅ Bottlenecks identified and addressed (if any)

**Technical Approach**:
- Setup: Production-like Docker environment (separate server)
- Execution: `locust -f backend/tests/perf/locustfile.py --host=http://staging`
- Monitoring: Track DB queries, Redis cache hits, CPU/memory usage
- Documentation: Screenshots, charts, recommendations

---

## Out of Scope (Post-MVP)
- **Visual Regression Tests**: Percy/Chromatic integration (separate DevOps sprint)
- **Advanced Analytics**: Player heatmaps, cohort comparison dashboards (future feature)
- **Multi-Language Support**: i18n (concept.md mentions English only for MVP)
- **Mobile App**: React Native version (separate project)

## Risks & Mitigation
- **Cascade Deletes**: DB migration must be tested thoroughly in staging
  - Mitigation: Backup before migration, test with sample data
- **Performance Testing**: May reveal bottlenecks requiring optimization
  - Mitigation: Run early in sprint, allocate time for fixes
- **Production Deployment**: SSL/domain configuration can be complex
  - Mitigation: Test with staging environment first

## Definition of Done
- ✅ UC-17: Admin Session Cleanup functional (backend + frontend)
- ✅ UC-18: Scenario→Sessions List visible to designers
- ✅ UC-19: Cascade Deletes implemented with proper warnings
- ✅ DEPLOYMENT.md complete and tested
- ✅ Performance tests executed, results documented
- ✅ All E2E tests green (Cypress suite)
- ✅ Code review completed
- ✅ Ready for production deployment

## Acceptance Summary
After Sprint 17:
- System 100% feature-complete per concept.md
- All use cases (UC-11 to UC-19) implemented
- Production deployment documented and validated
- Performance verified under load
- Ready for user acceptance testing (UAT)

## Metrics Target
- **Feature Completeness**: 100%
- **Test Coverage**: E2E (all flows), Unit (core engine), Performance (100 users)
- **Documentation**: Complete (concept, plan, deployment, performance)
- **Production Readiness**: ✅

## Next Steps (Post-Sprint 17)
1. **UAT**: User acceptance testing with real trainers/students
2. **Production Deployment**: Go-live on production server
3. **Monitoring Setup**: Netdata/Sentry alerts configured
4. **Feedback Loop**: Gather user feedback for iterative improvements
5. **Maintenance Plan**: Bug fixes, feature requests, security updates
