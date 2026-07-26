# SBMS Backend — Student Behavior Management System

A separate application from the main school-system backend, sharing the
same MySQL database. See the code comments in `src/models/reference/*.js`
for the reasoning behind each design decision — the short version is
below.

## How it shares the database safely

- SBMS owns exactly two new tables: `sbms_misconduct_types`,
  `sbms_misconduct_records`.
- Everything else (`schools`, `users`, `academic_years`, `terms`,
  `classes`, `students`) is treated as **read-only**. SBMS never creates,
  alters, or deletes rows in those tables, and never runs `sync()` on the
  whole Sequelize instance — only on its own two models
  (`scripts/setupSbmsTables.js`).
- In particular, SBMS never touches `users.role` — that column drives
  access control in the *main* system. It also never touches
  `users.disciplineRole`, even though that's the field it reads to
  determine someone's SBMS permissions. That field is written from the
  main system's dedicated Disciplinary Staff page only; SBMS reads it
  exactly like any other reference data.

## Setup

```bash
cp .env.example .env
# Fill in the SAME DB_* values as the main school-system backend's .env
# (same host/port/name/user/password — one database, two apps).
# Set SBMS_JWT_SECRET to a different random string than the main app's
# JWT_SECRET, so the two login sessions stay independent.

npm install
npm run setup-tables   # creates SBMS's two tables only — run once
npm run dev
```

## The workflow this models

1. **Report** (`POST /api/misconduct-records/report`) — a teacher or
   manager flags a mistake. No marks move yet (`status: pending`).
2. **Record / finalize** — a Dean of Discipline or Disciplinary Officer
   (patron/matron) either:
   - creates a record directly (`POST /api/misconduct-records`) — they
     caught the student themselves, marks deducted immediately, or
   - reviews a pending report and finalizes it
     (`PATCH /api/misconduct-records/:id/finalize`).
3. Only `finalized` records count toward a student's conduct score.

## Conduct scores (computed on the fly, never stored)

- **Per term**: 40 marks, minus finalized deductions that term. Flagged
  "at risk" if remaining < 20.
- **Per year**: 120 marks (3 terms × 40), minus finalized deductions
  across the whole year. Flagged "recommended dismissal" if remaining < 60
  — this is the number checked at year-end for the actual promote/dismiss
  decision, per the school's existing manual process.
- `GET /api/reports/class?classId=&termId=&academicYearId=` — every
  student in a class, both numbers side by side.
- `GET /api/reports/student/:studentId?termId=&academicYearId=` — one
  student's full picture.

## Effective SBMS roles (resolved at login, in the JWT)

| `users.role` | `users.disciplineRole` | SBMS role |
| --- | --- | --- |
| `superuser` | — | `superuser` — manages global misconduct-type templates, cross-school |
| `manager` | — | `manager` — can view records/reports for their school |
| `teacher` | `dean_of_discipline` | `dean_of_discipline` — also still a real teacher in the main system |
| `teacher` | `disciplinary_officer` | `disciplinary_officer` — also still a real teacher in the main system |
| `teacher` | `null` | `reporter` — can only submit a pending report |
| `discipline` | `dean_of_discipline` / `disciplinary_officer` | that role — an account that exists purely for SBMS, blocked from logging into the main system at all |
| `discipline` | `null` | `reporter` — a discipline-only account whose role was cleared; effectively dormant until reassigned |

`role: "discipline"` (as opposed to `role: "teacher"`) is what actually
keeps a discipline-only account out of the main system entirely — it's
blocked at login there, and every `authorize()` check in that system is an
explicit allow-list, so even a stale token couldn't reach a teacher-only
route. `disciplineRole` itself is set from the main school system's
dedicated Disciplinary Staff page — a separate section from the general
Teachers roster. SBMS only reads both fields
(`GET /reference/discipline-staff` shows the current assignments,
read-only). There's no assignment endpoint in SBMS at all.

## Password management (the one write exception)

SBMS is read-only against the shared `users` table with one deliberate
exception: `POST /api/auth/change-password` (authenticated). This exists
because a `role: "discipline"` account can *only* ever log into SBMS — the
main system blocks it — so SBMS is the only place such a person can ever
change their own temporary password. It's used both for the forced
first-login flow and the voluntary one from the Profile page; both hit the
same endpoint. It updates `passwordHash`, `mustChangePassword`,
`tokenVersion`, `passwordChangedAt`, and clears the temp-password fields —
mirroring the main system's own `change-password` endpoint field-for-field
so an account stays consistent no matter which app was used to change it.
`role`, `disciplineRole`, and every other field remain untouched from
here. See the comment on `models/reference/User.js` for the full
reasoning.

Because of this, `authenticate()` now also re-checks `status` and
`tokenVersion` against the database on every request (previously it only
verified the JWT signature) — otherwise a password change wouldn't
actually end an already-open SBMS session.

## Not yet built

- Student digital sign-off/acknowledgement — deferred on purpose;
  `acknowledgedAt` is already reserved on `MisconductRecord` so it's a pure
  addition later, not a migration.
