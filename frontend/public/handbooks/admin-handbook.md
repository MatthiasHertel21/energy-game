# Admin Guide

Last updated: 2026-05-27
Audience: Platform Administrators

## 1) Admin mission

Admins keep the platform usable and trustworthy across four areas:
- access and role governance,
- operational stability,
- session and data hygiene,
- documentation and static-content upkeep.

## 2) What the admin UI currently includes

The main admin screen at `/admin` is organized into three tabs:
- `Users`
- `Activity Dashboard`
- `Sessions`

Use the admin UI for day-to-day administration. Use deployment scripts, backups, and backend tooling for infrastructure-level work.

## 3) Users tab

The `Users` tab is the main identity-management surface. It lets you:
- search users by email,
- review role, cohort membership, solo-session count, and created date,
- change a user's role,
- create users directly,
- assign users to cohorts,
- reset passwords,
- delete users.

### Practical notes

- Password reset generates a new password and shows it immediately to the admin.
- If email delivery is configured, the user can receive the new password by email.
- If email delivery is not configured, the admin must communicate the password manually.
- Direct user creation is the visible workflow in the current UI.

Role values are:
- `player`
- `trainer`
- `designer`
- `admin`

Apply least privilege and remove elevated access when it is no longer needed.

## 4) Activity Dashboard tab

The `Activity Dashboard` is the admin's system-behavior summary. It provides:
- a period selector for `7d`, `30d`, or `90d`,
- KPI cards for total users, active users, sessions started, and total forecasts,
- time-series charts for logins, registrations, and sessions,
- a recent-activity table with timestamp, user, action type, session, and raw detail payload.

Use this tab when you want to answer questions like:
- Is usage dropping unexpectedly?
- Did a deployment coincide with a behavior change?
- Which user or session generated a support issue?

## 5) Sessions tab

The `Sessions` tab is your operational cleanup and audit surface. It supports:
- filtering by status,
- filtering by scenario ID,
- date-range filtering,
- reviewing cohort, mode, round, and player count,
- deleting single sessions,
- bulk cleanup of all sessions after explicit `DELETE` confirmation.

This is the correct place to inspect stale or test sessions before touching database tooling directly.

## 6) Static pages and handbook governance

There are two different content systems in the product:

### Role handbooks

The handbook pages are loaded from `/handbooks/*.md`.
These are repository-backed markdown files and must be updated in the codebase and deployed.

### Editable static pages

The public pages `Did You Know` and `Course Materials` are backed by `/api/static-pages/:pageKey` and can be edited in the app.

Important current behavior:
- the edit route is `/admin/edit-page/:pageKey`,
- the visible entry points are the `Edit` buttons on the public `Did You Know` and `Course Materials` pages when you are logged in as admin,
- this editor is for general static pages, not for the handbook markdown files.

If a guide is wrong, fix the handbook file in the repo. If a public info page is stale, edit the static page.

## 7) Daily operating checklist

At minimum, check:
- service health,
- recent deployment status,
- active sessions for abnormal state patterns,
- backup success,
- unresolved incidents,
- whether documentation still matches the shipped UI.

## 8) Release verification checklist

After a deployment, verify at least:
- login and role landing pages,
- player round submission and shared-mode waiting,
- trainer controls and progression,
- round results and detail rendering,
- public handbook pages under `/docs/*`,
- static pages such as `Did You Know` and `Course Materials` if touched.

## 9) Session and support patterns

Common admin tasks are:
- correcting role assignments,
- assigning users to the right cohort,
- confirming whether a session is stale or live,
- cleaning up test sessions,
- clarifying why players wait for trainer progression in shared mode.

Standard support rule: collect session ID, user email, role, round number, and timestamp before escalating.

## 10) Incident response playbook

### Step 1: Triage

- determine whether the problem is user-specific, cohort-specific, or global,
- estimate severity,
- assign ownership.

### Step 2: Stabilize

- pause or contain the failing workflow,
- stop further damage,
- communicate a short status update.

### Step 3: Diagnose

- correlate UI symptom, logs, deployment timing, and affected session IDs,
- compare against recent activity and session records,
- reproduce outside production if possible.

### Step 4: Recover

- apply the smallest safe fix,
- validate critical flows,
- monitor for recurrence.

### Step 5: Close

- record the root cause,
- capture the user impact,
- note any handbook or runbook updates that are needed.

## 11) Security and recovery baseline

Maintain these baselines:
- protect admin accounts and SSH material,
- rotate secrets when compromise is suspected,
- keep backups and restore ownership clear,
- do not rely on untested backups,
- restrict access to logs and operational data.

If restore has not been tested recently, your backup confidence is incomplete.

## 12) Audit and change tracking

Keep a lightweight record of:
- production deployments,
- access changes for elevated roles,
- major incidents and their fixes,
- backup and restore verification,
- handbook and static-page changes that materially affect users.

## 13) Weekly review template

Review once per week:
- top incidents,
- unresolved risks,
- elevated-access changes,
- deleted or bulk-cleaned sessions,
- documentation that drifted from the product.

That review is usually enough to spot silent operational drift before it becomes a bigger problem.
