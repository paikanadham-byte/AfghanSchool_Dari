# Architecture

## 1. Big picture

```
                    ┌────────────────────────────────────────────────┐
   Phone (PWA)      │  index.html + service worker + cached API data  │
   Android / iOS    │  vanilla JS shell: router · i18n · UI kit       │
   ── offline ──►   │  outbox: writes queued in localStorage          │
                    └───────────────┬────────────────────────────────┘
                                    │  HTTPS  (JSON, relative URLs)
                    ┌───────────────▼────────────────────────────────┐
   Node 22 server   │  Express:  /api/auth  /api/*  static PWA        │
   single process   │  auth guard → route module → SQLite             │
                    │  reminder scheduler (every 30 min)              │
                    └───────────────┬────────────────────────────────┘
                                    │
                    ┌───────────────▼────────────────────────────────┐
   SQLite file      │  data/app.db   +   data/uploads/                │
   (WAL)            │  orgs: type = 'school' | 'clinic'               │
                    └────────────────────────────────────────────────┘
```

* **One binary, no services to run.** No Redis, no Postgres, no Docker needed — the whole
  system is a Node process plus a SQLite file. Copy the folder to a small VPS (or a machine
  inside the school/clinic) and run `npm start`.
* **Two products, one core.** `orgs.type` decides whether an organisation is a school or a
  clinic. School tables and clinic tables never mix; the shared core (users, sessions,
  notifications, announcements, calendar, messages, files, AI chats) serves both.

## 2. Data model

### Core (shared)
| Table | Purpose |
|---|---|
| `orgs` | School / clinic with per-language name, province, settings JSON |
| `terms` | Academic terms (schools) |
| `users` | All people: `role`, `org_id`, scrypt password, preferred language, prefs |
| `sessions` | Token → user + **view_user_id** (the parent-viewing-as-child mechanism) |
| `guardians` | parent ⇄ student links, optional PIN for the child view |
| `announcements` / `announcement_reads` | Org-wide, class-scoped or role-scoped posts |
| `notifications` | Per-user inbox (title/body stored as `{fa,ps,en}` JSON) |
| `calendar_events` | Holidays, exam windows, campaigns (both modules) |
| `threads` / `messages` | Teacher ⇄ parent and internal messaging |
| `attachments` | Uploaded files (homework, submissions, encounters) |
| `audit_logs` | Every privileged action |
| `ai_conversations` / `ai_messages` / `ai_flags` | Tutor history + guardrail incidents |

### School
`classes`, `subjects`, `enrollments`, `teaching_assignments`, `timetable_slots`,
`homework`, `homework_submissions`, **`improvement_points`**, `tasks`, `attendance`,
`exams`, `exam_results`, `merit_points`, `student_badges`, `mood_checks`, `reports`,
`library_books`, `reading_logs`, `quizzes`, `quiz_attempts`, `meeting_requests`.

### Clinic
`departments`, `patients`, `patient_guardians`, `appointments`, `queue_tokens`, `encounters`,
`prescriptions`, `lab_orders`, `medications`, `stock_movements`, `vaccinations`, `pregnancies`.

### Conventions
* Any user-facing text stored in the database is a JSON object `{"fa":…,"ps":…,"en":…}`
  so the server never needs a translation table and notifications arrive in the user's language.
* Money-free, opaque ids: `<prefix>_<base36 time><random hex>` (e.g. `hw_mt9x…`).
* All timestamps ISO-8601 UTC; dates `YYYY-MM-DD`. Jalali conversion happens at the edges
  (server for notifications, client for display).

## 3. Request flow

```
fetch('/api/school/homework')
   → API client (public/js/api.js)
        • GET  → network first, cache in localStorage, serve cache when offline
        • POST/PATCH/DELETE → if offline: push to outbox, resolve {queued:true}
   → Express: morgan → JSON body → attach() session → requireAuth
   → module router: allow('teacher') / requireStudentAccess() / requirePatientAccess()
   → SQLite query → JSON
   → optional notify() writes notifications for parents/teachers/patients
   → audit log
```

### Authorisation model
| Layer | Rule |
|---|---|
| Session | Cookie `acs_session` (httpOnly, SameSite=Lax) or `Authorization: Bearer <token>` |
| Roles | `admin`, `principal`, `teacher`, `student`, `parent` (school) · `clinic_admin`, `doctor`, `nurse`, `receptionist`, `pharmacist`, `lab_tech`, `patient` (clinic) |
| Org scoping | Every query is filtered by `user.org_id` — cross-tenant reads are impossible |
| Object scoping | `canViewStudent()` (self, own child, own class, admin) · `canViewPatient()` (self, guardian link, clinic staff) |
| Parent ⇄ child | Parent keeps their own role; `session.view_user_id` switches the *view*. Read routes see the child's data, but write routes that must be the child's own work (`allowReal('student')`) refuse the parent — a parent cannot submit homework |

## 4. Offline strategy

1. **App shell** is precached by the service worker (`/`, CSS, JS, manifest, icons) → the app
   opens instantly, with or without signal.
2. **API GETs** are network-first and stored in `localStorage` (`acs.cache.v2`, 30 min TTL,
   max 120 entries) → previously opened screens still render offline.
3. **Writes** go to the outbox (`acs.outbox.v2`). The UI shows "Saved — it will send when you
   are online", a status bar shows the pending count, and `API.outbox.flush()` replays the
   queue on the `online` event. Idempotency: submissions carry a `client_id` and are upserted.
4. **Media** (photo/audio homework) uploads while online; when offline the text answer is
   queued and the file can be re-attached when signal returns.

## 5. AI tutor design

```
question → detectIntent() ──► solve_request? ──► REFUSAL (fa/ps/en) + 4 offers + ai_flags row
                          └─► check_work?    ──► review checklist (never the answer)
                          └─► meaning?       ──► glossary lookup
                          └─► method?        ──► study coach
                          └─► otherwise      ──► topic match (keyword scoring)
   LLM configured?  system prompt (hard rules) → OpenAI-compatible /chat/completions
                    on failure or timeout → offline engine (never blocks the student)
```

* Guardrails are enforced **before** the LLM (intent detection) and **after** (the refusal is
  logged in `ai_flags`), so behaviour is identical with or without an API key.
* "How do I solve…?" is treated as a *learning* request, not a solve request — the tutor then
  teaches. Only requests to have *the student's own* work done are refused.
* The clinic variant has a separate system prompt, refuses to diagnose or prescribe, and
  detects danger signs with spelling-normalised matching ( Pashto `ې/ۍ`, `ګ`, `ډ` variants).

## 6. Notifications & reminders

`src/notify.js` creates in-app notifications directly from writes (homework assigned, submitted,
graded; absence recorded; improvement point added; token called; prescription created; …) and
runs a **reminder scheduler** every 30 minutes (`REMINDER_INTERVAL_MIN`) that is idempotent per
day:

* homework due tomorrow / due today,
* appointment reminders (T-1) and follow-up visits,
* pharmacy low-stock / expiring medicines,
* vaccination doses due within 14 days.

`push_subscriptions` already exists in the schema for Web Push; connect a `web-push` sender to
reach the browser when the app is closed.

## 7. Performance & size

* Client: ~120 KB of uncompressed JS/CSS total, no framework, no fonts, no images besides icons.
* SQLite in WAL mode with indexes on the hot paths (org, class, date, user).
* Uploads are streamed to `data/uploads` with a 20 MB cap (configurable) and executable
  extensions rejected.

## 8. Security notes

* scrypt password hashing with per-user salt; session tokens are 32 random bytes.
* All SQL is parameterised (no string concatenation of user input into SQL).
* Uploaded files are served through `/api/files/:id`, which re-checks the organisation.
* Audit log for privileged actions; reports (bullying, safety) are delivered to admins only.
* Set `COOKIE_SECURE=1` behind HTTPS. Rotate secrets in `.env`. Take nightly backups of
  `data/app.db` (see `docs/SETUP.md`).
