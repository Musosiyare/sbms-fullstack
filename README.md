# SBMS — Student Behavior Management System

A separate application from your main school-system, sharing the same
MySQL database. See `backend/README.md` for the full design rationale
(why it's structured this way, the report → finalize workflow, and how
conduct scores are calculated).

## Running it locally

```bash
# 1. Backend
cd backend
cp .env.example .env
# fill in the SAME DB_* values as the main school-system's .env
npm install
npm run setup-tables   # creates SBMS's own 2 tables — run once
npm run dev            # runs on http://localhost:4100

# 2. Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev             # runs on http://localhost:5174
```

Log in with the same email/password as an existing account in the main
system. What you can do depends on your role there:

| Main system role | What you see in SBMS |
| --- | --- |
| `superuser` | Manage global misconduct-type templates |
| `manager` | Report mistakes, browse records, view class reports, view who holds discipline roles |
| `teacher`, `disciplineRole` not set | Report mistakes only |
| `teacher`, `disciplineRole: dean_of_discipline` | Everything: finalize reports, record directly, manage misconduct types |
| `teacher`, `disciplineRole: disciplinary_officer` | Finalize reports, record directly, view class reports |

## Assigning Dean of Discipline / Disciplinary Officer

**This happens entirely in the main system, not in SBMS.** A manager opens
the **Disciplinary Staff** page there — a dedicated section, separate from
the general Teachers roster — and creates an account with a role attached
in one step (name, email, an SBMS role, done), or changes/removes an
existing person's role from the same page. That person doesn't need to
teach any classes; it's a regular account in this system either way, just
created and managed from its own page instead of being mixed into every
teacher's row.

SBMS's **Staff Roles** page is read-only — it just displays who currently
holds a role, as a convenience, and points back to the main system's
Teachers page for making changes. SBMS never writes to this field itself.

## What's built

- **Main system**: `users.disciplineRole` column, manager-only endpoints
  to create/change it (`POST /teachers` accepts an optional
  `disciplineRole`, `PATCH /teachers/:id/discipline-role` changes it later),
  and a dedicated **Disciplinary Staff** page (separate from the Teachers
  page) to create and manage these accounts. This is the *only* place
  discipline roles are ever assigned.
- **SBMS backend**: full API — auth (reading `disciplineRole` from the
  shared `users` table), misconduct types, the report → finalize
  workflow, termly/yearly conduct score calculation, class/student
  reports. Verified: every file syntax-checks, the full model graph
  loads, and the whole request chain (auth → role check → DB query) was
  tested end-to-end against an in-process server.
- **SBMS frontend**: Login, Dashboard, Report a Mistake, Records (list +
  finalize + direct record), Class Report, Misconduct Types, and a
  read-only Staff Roles view. Verified: clean `npm run build`, zero lint
  warnings, and the built app was served and smoke-tested.

## Deliberately not built yet

- Student digital sign-off/acknowledgement (you said add it later —
  `acknowledgedAt` is already reserved on the record model)
- A dedicated student-history page (single-student conduct timeline
  across years) — the API (`GET /api/reports/student/:studentId`)
  supports it, just no frontend page yet
- Year-end promotion/dismissal action (currently the Class Report page
  only *flags* recommended dismissals — nothing automatically dismisses
  a student; that final call stays with the Dean of Discipline)
