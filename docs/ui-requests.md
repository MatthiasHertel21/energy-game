# EMSG UX Review and UI Change Requests (2025-11-10)

Purpose: Evaluate current UI/UX against Concept v1.0 and propose concrete, actionable changes. This list is prioritized and acceptance-criteria based. Where helpful, screenshots are requested.

Scope evaluated
- Frontend routes/components: `Login`, `Register`, `AdminUsers`, `KSE – Scenario Editor`, `Trainer – Session Control`, `Player – Round Editor`
- App shell: `App.jsx` AppBar and navigation, theme `src/theme.js`, router setup `src/main.jsx`

Summary
- The UI is functional but minimal. Core student/trainer flows are incomplete or hidden behind technical inputs. Visual hierarchy, feedback, and guidance need improvement. Several MVP screens from Concept 3.x are missing in the UI. Copy is mixed DE/EN; MVP states language English.

Top priorities (P0)
1) Student entry and navigation
- Issue: No Home/My Scenarios, no recognizable landing; players must know and navigate to `/player` and enter IDs manually.
- Change:
  - Add `Home / My Scenarios` with list of assigned/open scenarios and CTA buttons: “Briefing”, “Play/Resume”, “Reports”.
  - Default “/” route → If logged in and role=player: go to Home; admin/designer/trainer → keep role-specific entry.
- Acceptance:
  - After login as player, landing shows scenario cards (even placeholder/fake data now), no manual IDs needed to start.

2) Round Editor UX (Player)
- Issue: Manual `sessionId` and `round` inputs; no countdown timer; no chart feedback.
- Change:
  - Remove manual IDs; derive active session/round via API. Add countdown timer with warning at T-30s. Add simple chart (values over hours) and live KPIs placeholder.
  - Disable Submit until values valid; show success/error toast.
- Acceptance:
  - Player cannot submit without an active session/round; sees remaining time; gets visual feedback.

3) Error handling, feedback, and 404
- Issue: No global toast/snackbar patterns; form errors inline only; no 404 route.
- Change:
  - Introduce app-wide Snackbar/Alert provider; unify success/error messages.
  - Add `/404` route + fallback `*` to 404 component.
- Acceptance:
  - Network/API failures produce a consistent toast with retry guidance; unknown routes show a 404 with link Home.

4) Auth flow and copy consistency (English MVP)
- Issue: Mixed German/English labels; redirects differ by role; no hint about first-user-as-admin.
- Change:
  - Unify copy to English. Update Login/Register helper texts. On Register, small note: “The first user becomes admin.”
  - After login: role-based redirect with explicit destinations: player→Home, trainer→Trainer, designer→KSE, admin→Admin Users.
- Acceptance:
  - All visible labels/tooltips in English; post-login routing is deterministic per role.

High priority (P1)
5) AppBar and navigation clarity
- Issue: Top nav shows role tabs only when logged in; no profile menu or logout placement clarity; no active state.
- Change:
  - Add right-aligned user menu (email, role, logout). Highlight current route. Add Home item for players.
- Acceptance:
  - Active nav item visible, consistent place for logout via avatar/menu.

6) Admin Users table ergonomics
- Issue: No pagination/search; changing roles refreshes entire list.
- Change:
  - Add search by email, pagination (server-side later). Optimistic role update with inline success/error state.
- Acceptance:
  - Admin can find/change a user role quickly; table scales to 1000+ users.

7) Trainer – Live session control
- Issue: Log-only feedback; no player × round × status table; no disable states on buttons.
- Change:
  - Add status table: Player, Round, Status, Submitted. Disable controls appropriately; auto-scroll logs; show session meta (scenario, cohort, round).
- Acceptance:
  - Trainer sees real-time status and cannot apply invalid actions.

8) KSE – Scenario Editor usability
- Issue: Validation surfaced as a summary only; matrix editing lacks guides; events are minimal.
- Change:
  - Field-level validation hints; disable Save until valid. Add column/row headers for ATC, symmetric lock. Clarify Preview MCP output (units, assumptions).
- Acceptance:
  - Users can fix invalid fields without hunting; ATC feels safe and clear.

Medium priority (P2)
9) Global theming and readability
- Issue: Default MUI theme; no dark mode toggle; content width varies.
- Change:
  - Set consistent `Container` maxWidth, spacing scale, and typographic rhythm; optional dark mode toggle in header.
- Acceptance:
  - Layout feels consistent across pages; headings and spacing align.

10) Accessibility and keyboard support
- Issue: Focus indication and aria-labels not guaranteed everywhere.
- Change:
  - Ensure labels for all inputs, proper roles for interactive elements, visible focus; ESC closes dialogs; Enter submits.
- Acceptance:
  - Basic WCAG AA pass in forms and navigation.

11) Microcopy and guidance
- Issue: Little guidance explaining actions/impact.
- Change:
  - Add helper texts/tooltips for key inputs (e.g., Round Editor, KSE Events). Provide empty states for tables (Admin/Trainer).
- Acceptance:
  - First-time users can proceed without external explanation.

New screens to implement (aligned with Concept 3.x)
- Student: Home/My Scenarios (P0), Scenario Briefing (P1), Evaluation Report (P1), Profile & Help (P2)
- Shared: 404 (P0)
- Trainer: Live Status Table (P1), Comparison Dashboard skeleton (P2)

Deliverables and target files (initial slices)
- App shell
  - `frontend/src/App.jsx`: role-based redirects, add Home route/link, user menu, 404 route
  - `frontend/src/components/*`: SnackbarProvider, NotFound, UserMenu
- Student
  - `frontend/src/pages/Home.jsx` (scenario list), `frontend/src/pages/Briefing.jsx` (placeholder), enhance `Player.jsx` (timer, chart, API-driven context)
- Trainer
  - `frontend/src/pages/Trainer.jsx`: add status table, disabled states
- Admin
  - `frontend/src/pages/AdminUsers.jsx`: search/pagination, optimistic role update
- Editor
  - `frontend/src/pages/KSE.jsx`: inline validation improvements, ATC headers

Copy cleanup (English, examples)
- AppBar: Home, Player, Trainer, Editor, Admin, Logout
- Login: “Sign in to EMSG”; Register: “Create your account – the first user becomes admin.”
- Player: “Round Editor”; “Time remaining”; “Submit forecast”

Requested screenshots (optional, to refine visual adjustments)
Please capture and share the following (direct URLs):
- Login: https://iq.2b6.de/login
- Register: https://iq.2b6.de/register
- Player – Round Editor: https://iq.2b6.de/player
- Trainer – Session Control: https://iq.2b6.de/trainer
- KSE – Scenario Editor: https://iq.2b6.de/kse
- Admin – User Management: https://iq.2b6.de/admin

If navigation is needed: Login with your user, then use the top AppBar links to each page.

Rollout notes
- Non-breaking: These changes can be rolled out incrementally behind routes/components.
- Start with P0 (Home, Round Editor improvements, 404, copy) → then P1 (Trainer table, Admin table UX, KSE validation) → P2 (theming/accessibility).

"Wow" enhancements (scoped, add-on to P1/P2)

Goal: Add selected high-impact polish without blocking MVP. Fit into existing MUI/React stack.

W1) Design tokens and theme (colors, type, spacing)
- Deliverables:
  - Extend `src/theme.js` with a tokenized palette (primary/secondary/neutral, success/warn/error), typography scale (h1–caption), spacing, shape (borderRadius), shadows.
  - Add `src/styles/tokens.css` (CSS variables) to allow chart/theming reuse beyond MUI.
- Acceptance:
  - All pages inherit typography and spacing consistently; primary/secondary colors applied across AppBar, buttons, links.

W2) Iconography and navigation affordances
- Deliverables:
  - Use Material Symbols (outlined) with consistent size/color in AppBar and key CTAs (Home, Player, Trainer, Editor, Admin, Logout).
  - Add contextual icons to tables/actions (edit, save, role, status).
- Acceptance:
  - Icons render crisp at 1x/2x; labels remain visible; keyboard focus includes icon buttons.

W3) Data visualization uplift (first slice)
- Deliverables:
  - KSE Preview: improve supply/demand chart styling (axes, gridlines, legend, tooltips, accessible colors).
  - Player Round: add a compact sparkline/area showing hour values with hover value and min/max.
- Acceptance:
  - Charts respond to theme colors; tooltips readable; no layout shift on resize; keyboard focusable data points where practical.

W4) Motion and micro-interactions (lightweight)
- Deliverables:
  - Add 150–250ms transitions for hover/active on buttons/cards; fade-in page transitions via `CSSTransition` or MUI `Fade`.
  - Submit success uses non-intrusive confetti burst (reduced motion respected).
- Acceptance:
  - Prefers-reduced-motion honored; interactions feel responsive without jank.

W5) Dark mode toggle
- Deliverables:
  - Add theme mode switcher in header; persist in `localStorage`.
- Acceptance:
  - All pages legible in dark mode; charts adopt dark palette; contrast AA maintained.

W6) Skeletons and empty states
- Deliverables:
  - Add MUI Skeleton for lists/tables; define empty-state components with icon, headline, action.
- Acceptance:
  - Loading and empty conditions are obvious and guided.

Implementation notes
- Target files (initial): `frontend/src/theme.js`, `frontend/src/styles/tokens.css` (new), `frontend/src/App.jsx` (icons, toggle), `frontend/src/pages/KSE.jsx` (chart styling), `frontend/src/pages/Player.jsx` (sparkline), `frontend/src/components/*` (Skeletons, EmptyState, Icon wrappers).
- Phasing: Integrate W1+W6 with P0/P1; W2+W3 with P1; W4+W5 as P2 polish.

Wow backlog (excluding i18n; UI remains English)

WB1) Brand & Landing (M)
- Deliverables: logo + favicon, brand color scale (primary 10-step), typography pairing, landing/hero with campaign teaser and CTA.
- Files: `/public/*` (assets), `src/theme.js`, `src/pages/Landing.jsx` (new), `src/App.jsx` (route).
- Acceptance: distinct visual identity; lighthouse a11y ≥ 90 on landing.
- Priority: High
- Effort: 3–5 person-days

WB2) Advanced data visualization (L)
- Deliverables: combined DA/IDM/Balancing chart with brush/zoom, cohort/reference overlays; export to PNG/CSV; event annotations; zonal ATC map (interactive).
- Files: `src/components/charts/*` (new), `src/pages/KSE.jsx` (hook-in), `src/pages/Trainer.jsx` (dashboard stub).
- Acceptance: 60fps pan/zoom on desktop; clear legends; exports accurate; colors meet contrast.
- Priority: High (slice 1), Medium (slice 2)
- Effort: 6–12 person-days (deliver in 2 slices)

WB3) Onboarding & guidance (M)
- Deliverables: guided walkthrough for first round (stepper overlays), contextual tooltips, empty-state patterns with next-actions.
- Files: `src/components/onboarding/*` (new), integrate in `Player.jsx`, `KSE.jsx`.
- Acceptance: walkthrough skippable, progress saved; no obtrusive blocking.
- Priority: Medium
- Effort: 3–4 person-days

WB4) Gamification & feedback (S)
- Deliverables: campaign/Scenario progress bars, lightweight celebration animation on submit/complete (respects reduced motion), optional subtle sounds with mute toggle.
- Files: `src/components/celebrate/*` (new), `App.jsx` (sound toggle).
- Acceptance: animations < 1s, can be disabled; no layout shift.
- Priority: Low–Medium
- Effort: 1–2 person-days

WB5) Motion system (S)
- Deliverables: page transitions, list sort/filter animations using MUI transitions/Framer Motion.
- Files: `src/components/animations/*` (new), wrappers in route layouts.
- Acceptance: smooth transitions 150–250ms; prefers-reduced-motion honored.
- Priority: Low–Medium
- Effort: 1–2 person-days

WB6) A11y & mobile polish (M)
- Deliverables: WCAG AA pass on forms/nav; keyboard shortcuts (Submit forecast, Pause), refined mobile breakpoints and touch targets ≥ 44px.
- Files: global pass across `src/pages/*`, `src/components/*`.
- Acceptance: axe-core audit passes critical; shortcuts documented in Help.
- Priority: High (MVP-quality)
- Effort: 2–4 person-days

WB7) Robustness & performance (M)
- Deliverables: ErrorBoundary + 404/500 illustrations, code-splitting critical routes, image optimization, LCP/CLS tuning.
- Files: `src/components/ErrorBoundary.jsx` (new), `src/pages/NotFound.jsx` (new), routing updates, vite config tweaks if needed.
- Acceptance: Web Vitals LCP < 2.5s on 3G Fast; CLS < 0.1.
- Priority: High
- Effort: 2–4 person-days

WB8) PWA & analytics (M)
- Deliverables: Web manifest, service worker (Workbox) for offline shell, privacy-conscious analytics + Web Vitals logging.
- Files: `/public/manifest.webmanifest`, `src/sw.js` (or Workbox plugin), minimal analytics hook.
- Acceptance: installable PWA; offline landing + shell load; no PII collected.
- Priority: Medium
- Effort: 2–3 person-days

WB9) Design system docs (S)
- Deliverables: lightweight Storybook (or MUI Docs page) for components and tokens; usage guidelines.
- Files: Storybook config under `/.storybook`, stories in `src/components/**/__stories__`.
- Acceptance: key components documented with controls; tokens referenced consistently.
- Priority: Low–Medium
- Effort: 1–2 person-days

Prioritized phasing (2–3 weeks, parallelizable)
- Sprint A (week 1): WB1 Brand & Landing, WB6 A11y & mobile polish, WB7 Robustness & performance, W1/W6 integration from earlier scope.
- Sprint B (week 2): WB2 Advanced data vis (slice 1: DA/IDM/Balance combined chart + tooltips/legend/export), WB3 Onboarding & guidance.
- Sprint C (week 3): WB2 slice 2 (ATC map + annotations), WB4 Gamification & feedback, WB5 Motion system, WB9 Design system docs; WB8 PWA optional.

Notes
- UI remains English only (no i18n planned).
- Keep each item behind feature flags or route-level toggles where feasible.
