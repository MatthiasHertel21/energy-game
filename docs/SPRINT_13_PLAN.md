# Sprint 13 Plan - Energy Market Simulation Game

**Date:** 2025-11-13  
**Focus:** P2 Priority - Activity Tracking & Visualization  
**Estimated Duration:** 3-5 days

---

## Sprint Goal

Implement activity tracking infrastructure and visualization features to provide trainers and admins with insights into user behavior and system usage. Add visual campaign timeline for players.

---

## Selected Use Cases

### 1. UC-23: Trainer – Zeitliche Übersicht zu Schüleraktivitäten (P2, CORE)
**Priority:** HIGH - Foundation for UC-24  
**Complexity:** MEDIUM - Requires DB migration + new table

**Problem:**  
Keine Einsicht, wann Spieler sich eingeloggt haben, Forecasts abgegeben, Runden abgeschlossen haben.

**Scope:**

**Backend:**
- New table: `activity_log`
  ```sql
  CREATE TABLE activity_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      cohort_id INTEGER REFERENCES cohorts(id) ON DELETE SET NULL,
      action_type VARCHAR(50) NOT NULL,  -- 'login', 'forecast_submit', 'round_complete', 'session_join', 'type_select'
      timestamp TIMESTAMP DEFAULT NOW(),
      details JSONB,  -- { round?, forecast_count?, device_type?, etc. }
      INDEX idx_activity_user (user_id, timestamp DESC),
      INDEX idx_activity_session (session_id, timestamp DESC),
      INDEX idx_activity_cohort (cohort_id, timestamp DESC),
      INDEX idx_activity_type (action_type, timestamp DESC)
  );
  ```

- New API endpoints in `backend/app/cohorts.py`:
  - `GET /api/cohorts/:id/activity?from=...&to=...&user_id=...&action_type=...&limit=50&offset=0`
    - Returns paginated activity timeline for cohort
    - Filters: date range, specific user, action type
    - Response: `{ activities: [{ id, user_email, user_name, action_type, timestamp, details }], total }`
  - `GET /api/cohorts/:id/activity/csv` - CSV export

- New API endpoints in `backend/app/sessions.py`:
  - `GET /api/sessions/:id/activity?action_type=...&limit=50&offset=0`
    - Returns activity timeline for specific session

- Activity logging integration:
  - `backend/app/auth.py` - Log 'login' on successful authentication
  - `backend/app/player.py` - Log 'forecast_submit' on POST /forecast
  - `backend/app/sessions.py` - Log 'session_join', 'type_select', 'round_complete'
  - Helper function: `log_activity(user_id, action_type, session_id=None, cohort_id=None, details=None)`

**Frontend:**
- **File:** `frontend/src/pages/Cohorts.jsx`
  - New Tab "Activity" (tab index 3, after Members)
  - Components:
    - Filter panel: DateRangePicker, UserSelect, ActionTypeSelect, "Export CSV" button
    - Activity table: Columns = Timestamp, User, Action, Session, Details
    - Pagination controls (limit=50, infinite scroll optional)
  - Features:
    - Real-time updates optional (polling every 30s when tab active)
    - Empty state when no activities

- **File:** `frontend/src/pages/Trainer.jsx`
  - New collapsible panel "Session Activity" (below Participants panel)
  - Mini-list showing recent 10 activities for current session
  - "View all" link to session detail or export

**Database Migration:**
- Script: `backend/scripts/migrate_activity_log.sh`
- Creates activity_log table with indexes
- No data migration needed (fresh tracking)

**Testing:**
- Cypress E2E: `cypress/e2e/trainer-activity.cy.js`
  - Test activity logging on login, forecast submit
  - Test activity filter and pagination
  - Test CSV export download

**Acceptance Criteria:**
- ✅ Trainer sieht zeitlich geordnete Aktivitäten pro Cohort
- ✅ Filter funktioniert (Spieler, Zeitraum, Aktionstyp)
- ✅ CSV-Export erzeugt lesbare Datei
- ✅ Performance: Pagination bei >1000 Events, query <500ms
- ✅ Activity logging für alle wichtigen Actions (login, forecast_submit, session_join, type_select, round_complete)

---

### 2. UC-27: Player – Grafische Timeline der Kampagnen-Szenarien mit Fortschritt (P2, VISUALIZATION)
**Priority:** HIGH - Player engagement feature  
**Complexity:** MEDIUM - Frontend-only, d3.js/SVG visualization

**Problem:**  
Spieler sehen Szenarien nur als Kartenliste; keine schnelle visuelle Übersicht über Kampagnen-Fortschritt.

**Scope:**

**Frontend:**
- **File:** `frontend/src/pages/CampaignDetail.jsx`
  - New component: `CampaignTimeline` (below campaign header, above scenario cards)
  - Technology: SVG with d3.js (or pure React SVG if simpler)

- **Timeline Design:**
  - Horizontal layout with bubbles (circles) for each scenario
  - Bubble order: Left-to-right by `order_index`
  - Bubble colors:
    - Green (#4caf50): status = 'completed'
    - Orange (#ff9800): status = 'in_progress'
    - Gray (#9e9e9e): status = 'not_started'
  - Bubble size: Uniform 40px diameter (or 48px for active scenario)
  - Connecting line: Gray dashed line between bubbles
  - Labels:
    - Inside bubble: Scenario number (#1, #2, ...)
    - Tooltip on hover: Scenario name, status, started/completed dates
  - Click: Scroll to corresponding scenario card or expand it
  
- **Responsive:**
  - Desktop (>960px): Full horizontal timeline, max 15 scenarios visible, overflow-x: auto
  - Tablet (768-960px): Smaller bubbles (32px), horizontal scroll
  - Mobile (<768px): Fallback to vertical list or simplified dots

- **Accessibility:**
  - ARIA labels: `aria-label="Campaign timeline with {count} scenarios"`
  - Keyboard navigation: Tab to focus bubbles, Enter to scroll to card
  - Screen reader: Announce status for each bubble
  
- **Animation (optional):**
  - Fade-in bubbles on mount (stagger 50ms each)
  - Line draws from left-to-right (CSS animation)
  - Reduced motion: `prefers-reduced-motion` disables animations

**No Backend Changes:**
- Uses existing `GET /api/catalog/campaigns/:id` endpoint
- Progress data already includes scenario status (not_started | in_progress | completed)

**Testing:**
- Cypress E2E: `cypress/e2e/campaign-timeline.cy.js`
  - Test timeline renders with correct bubble colors
  - Test click on bubble scrolls to scenario card
  - Test keyboard navigation (Tab, Enter)
  - Test responsive layout (viewport resize)

**Acceptance Criteria:**
- ✅ Timeline zeigt alle Szenarien in korrekter Reihenfolge mit Farbkodierung
- ✅ Klick auf Bubble führt zur entsprechenden Karte (smooth scroll)
- ✅ Funktioniert auf Desktop/Tablet (768px+); Mobile zeigt alternative Ansicht
- ✅ Performance: <200ms Rendering bei 20 Szenarien
- ✅ Accessibility: WCAG AA keyboard navigation, ARIA labels

---

### 3. UC-24: Admin – Gesamtübersicht zur Benutzeraktivität (P2, ANALYTICS)
**Priority:** MEDIUM - Depends on UC-23  
**Complexity:** MEDIUM - Backend aggregation + Frontend charts

**Problem:**  
Keine systemweite Sicht auf Benutzeraktivität (Registrierungen, Logins, Sessions, Forecasts).

**Scope:**

**Backend:**
- **File:** `backend/app/admin.py` (new namespace `/api/admin/activity`)

- New endpoints:
  - `GET /api/admin/activity/summary?period=7d|30d|90d`
    - Response:
      ```json
      {
        "total_users": 150,
        "active_users_7d": 45,
        "active_users_30d": 89,
        "sessions_started": 320,
        "sessions_completed": 280,
        "avg_forecasts_per_session": 12.5,
        "total_forecasts": 4000,
        "period": "30d"
      }
      ```
  
  - `GET /api/admin/activity/timeseries?metric=logins|sessions|registrations&period=30d&interval=daily`
    - Response:
      ```json
      {
        "metric": "logins",
        "interval": "daily",
        "data": [
          { "date": "2025-11-01", "count": 12 },
          { "date": "2025-11-02", "count": 15 },
          ...
        ]
      }
      ```
  
  - `GET /api/admin/activity/recent?limit=50`
    - Returns recent 50 activities across all users/sessions
    - Response: Same structure as cohort activity endpoint

- Queries:
  - Summary: Aggregate from `users`, `activity_log`, `sessions`
  - Timeseries: GROUP BY DATE_TRUNC('day', timestamp) from activity_log
  - Recent: SELECT from activity_log ORDER BY timestamp DESC LIMIT 50

**Frontend:**
- **File:** `frontend/src/pages/AdminUsers.jsx`
  - New Tab "Activity Dashboard" (tab index 1, after Users)

- **Components:**
  - KPI Cards (Grid 2x2):
    - Total Users (count)
    - Active Users 7d/30d (with percentage change)
    - Sessions Started (with completion rate)
    - Avg Forecasts per Session
  
  - Charts (using recharts or d3.js):
    - Line chart: Registrations over time (last 30d)
    - Line chart: Logins over time (last 30d)
    - Bar chart: Sessions started over time (last 30d)
    - Period selector: 7d | 30d | 90d
  
  - Recent Activity Table:
    - Columns: Timestamp, User, Action, Session/Cohort
    - Limit 50, no pagination (for overview)

- **Performance:**
  - Cache summary data (5min TTL)
  - Lazy load charts (only when tab active)
  - Loading skeleton during fetch

**Testing:**
- Cypress E2E: `cypress/e2e/admin-activity.cy.js`
  - Test KPI cards render
  - Test charts render with mock data
  - Test period selector updates charts

**Acceptance Criteria:**
- ✅ Admin sieht KPIs und Charts auf einen Blick
- ✅ Zeitreihen laden performant (max 2s bei 10k Events)
- ✅ Period selector funktioniert (7d/30d/90d)
- ✅ Datenschutz: Optional anonymisierte Ansicht (future enhancement)

---

### 4. Accessibility Pass (EXTENSION)
**Priority:** MEDIUM - Cross-cutting improvement  
**Complexity:** LOW

**Scope:**
- Review and add missing ARIA labels across all pages
- Ensure keyboard navigation works (Tab, Enter, ESC)
- Focus visible on all interactive elements
- Dialog/Drawer closes on ESC
- Form submit on Enter where applicable

**Files:**
- `frontend/src/pages/Cohorts.jsx` - Activity tab accessibility
- `frontend/src/pages/AdminUsers.jsx` - Activity Dashboard accessibility
- `frontend/src/pages/CampaignDetail.jsx` - Timeline accessibility

**Testing:**
- Manual testing with keyboard only
- Lighthouse accessibility audit (score >90)
- Axe DevTools audit (0 critical issues)

**Acceptance Criteria:**
- ✅ All interactive elements have ARIA labels
- ✅ Keyboard navigation works across all new features
- ✅ Focus indicators visible
- ✅ Lighthouse accessibility score >90

---

## Out of Scope (Deferred)

### UC-25: Trainer – Session-Teilnehmer und Spielertypen live sehen
**Reason:** Requires real-time WebSocket infrastructure, more complex than activity log polling. Defer to Sprint 14.

### UC-21: Player – Drag&Drop Forecast Chart Editor
**Reason:** Complex d3.js interaction logic, requires extensive testing. Defer to Sprint 14 or later.

### UC-28: Admin – Verwaiste Sessions aufräumen
**Reason:** Database cleanup feature, lower priority. Defer to Sprint 14.

### UC-29: Designer – Sessions zu einem Scenario ansehen
**Reason:** Designer analytics feature, lower priority than trainer/admin. Defer to Sprint 14.

### UC-30: Designer – Kampagnen und Szenarien löschen mit Cascade
**Reason:** Requires careful foreign key migration, potential data loss. Needs dedicated sprint. Defer to Sprint 14.

---

## Technical Dependencies

### Database Migration
- `backend/scripts/migrate_activity_log.sh` - Create activity_log table
- Run before deployment: `docker-compose exec backend bash scripts/migrate_activity_log.sh`

### New Dependencies
- Frontend: None (use existing recharts from package.json)
- Backend: None (use existing SQLAlchemy)

### Performance Considerations
- Activity log table will grow continuously - plan for periodic archival (future)
- Indexes on timestamp, user_id, session_id ensure fast queries
- Pagination mandatory for activity lists (limit=50 default)
- Timeseries queries use DATE_TRUNC for efficient aggregation

---

## Implementation Order

1. **UC-23 Backend (Day 1)**
   - Create migration script
   - Implement activity_log table
   - Add log_activity() helper
   - Integrate logging in auth.py, player.py, sessions.py
   - Implement GET /api/cohorts/:id/activity endpoints
   - Test with manual DB inserts

2. **UC-23 Frontend (Day 1-2)**
   - Add Activity tab to Cohorts.jsx
   - Implement filter panel
   - Implement activity table with pagination
   - Add CSV export
   - Test with real activity data

3. **UC-27 Frontend (Day 2)**
   - Create CampaignTimeline component
   - Implement SVG bubble timeline
   - Add click handlers and scroll logic
   - Add keyboard navigation
   - Responsive design testing

4. **UC-24 Backend (Day 2-3)**
   - Create admin.py namespace
   - Implement summary endpoint
   - Implement timeseries endpoint
   - Implement recent activity endpoint
   - Test aggregation queries

5. **UC-24 Frontend (Day 3)**
   - Add Activity Dashboard tab to AdminUsers.jsx
   - Implement KPI cards
   - Implement charts (recharts)
   - Add period selector
   - Test with real data

6. **Accessibility Pass (Day 3)**
   - ARIA label review
   - Keyboard navigation testing
   - Lighthouse/Axe audit
   - Fix identified issues

7. **Testing & Documentation (Day 4)**
   - Cypress E2E tests
   - Manual testing all features
   - Update SPRINT_13_SUMMARY.md
   - Update backlog.md status

8. **Deployment (Day 4)**
   - Run database migration
   - Build frontend
   - Build Docker images
   - Deploy containers
   - Smoke test production
   - Git commit & push

---

## Success Metrics

- ✅ Activity logging captures all 5 action types
- ✅ Activity queries return in <500ms for 10k rows
- ✅ Timeline renders in <200ms for 20 scenarios
- ✅ KPI dashboard loads in <2s
- ✅ CSV export works for 1000+ activity rows
- ✅ Zero critical accessibility issues (Axe audit)
- ✅ All Cypress E2E tests green

---

## Risk Assessment

**Risks:**
1. **Database migration failure** - Mitigation: Test migration script locally first
2. **Activity log table growth** - Mitigation: Add indexes, plan archival strategy
3. **Timeline rendering performance** - Mitigation: Use virtualization or limit visible scenarios
4. **Chart library compatibility** - Mitigation: Use existing recharts, fallback to simple tables

**Dependencies:**
- No external API dependencies
- No breaking changes to existing features
- Can be deployed incrementally (UC-23 → UC-27 → UC-24)

---

## Next Steps After Sprint 13

**Sprint 14 Candidates:**
- UC-25: Trainer live participant view (WebSocket)
- UC-21: Player drag&drop forecast editor (d3.js)
- UC-28: Admin orphaned session cleanup
- UC-29: Designer scenario session analytics
- UC-30: Designer cascade delete with migrations
- Performance optimization (activity log archival, indexing)
- Advanced data visualization (forecast comparison charts)

---

## Notes

- Sprint 12 completed UC-20, UC-22, UC-26 + Accessibility
- Sprint 13 builds on activity tracking foundation
- UC-23 is prerequisite for UC-24 (share same activity_log table)
- UC-27 is independent, can be parallelized with UC-23/24
- Focus on data quality: Ensure activity logging is accurate and complete
- Consider privacy: Activity logs may contain PII, ensure GDPR compliance (future)
