# API reference

All endpoints are prefixed with `/api`. Authentication uses either

* the session cookie `acs_session` (set by `/api/auth/login`), or
* `Authorization: Bearer <token>`.

Responses are JSON: `{ ok: true, … }` or `{ ok: false, error: "code" }`.
Localised strings are stored/returned as JSON objects `{"fa":…,"ps":…,"en":…}`; the client
picks the active language with `I18N.L()`.

---

## Auth — `/api/auth`
| Method | Path | Notes |
|---|---|---|
| POST | `/login` | `{username, password}` → session payload |
| POST | `/logout` | destroys the session |
| GET | `/me` | user, org, children / linked patients, unread counts |
| POST | `/switch-view` | `{userId, pin?}` parent opens a child's account |
| POST | `/clear-view` | back to the parent account |
| POST | `/child-pin` | set/clear the 4-digit PIN protecting a child view |
| POST | `/language` · `/prefs` | persist language and appearance prefs |
| POST | `/password` | `{current, next}` |
| POST | `/self-register` | clinic patient creates their own login |
| GET | `/demo` | list seeded demo accounts |
| POST | `/demo-login` | `{role}` quick demo sign-in |

## Core — `/api`
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | date, unread, announcements, upcoming events |
| GET/POST | `/announcements` | audience: `{roles[], classIds[], userIds[]}` |
| POST | `/announcements/:id/read` · DELETE | |
| GET/POST | `/calendar` | holidays, exam windows, campaigns |
| GET | `/notifications` · POST `/notifications/read` | |
| GET/POST | `/threads` · `/threads/:id/messages` | internal messaging |
| POST | `/files` (multipart) · GET `/files/:id` | uploads |
| GET/POST | `/users` · POST `/users/import` | admin: user management + CSV |
| GET | `/audit` | activity log |
| GET | `/search` | students / homework / books / patients |
| GET | `/health` | |

## School — `/api/school`
| Method | Path | Notes |
|---|---|---|
| GET | `/overview` | role-aware dashboard payload (student / teacher / parent / admin) |
| GET/POST | `/classes` · GET `/classes/:id/students` · POST `/classes/:id/students` | |
| GET/POST | `/subjects` | |
| GET/POST | `/homework` | teacher creates for several `class_ids` at once |
| GET/PATCH/DELETE | `/homework/:id` | detail: student sees their submission, teacher sees the roster + stats |
| POST | `/homework/:id/submit` | `{text, attachments[]}` — students only (parents blocked) |
| POST | `/homework/:id/grade` | `{student_id, score, feedback, status}` |
| GET/POST | `/timetable` | query `?class_id= | ?student_id= | ?teacher_id=`; POST replaces a class grid |
| GET/POST | `/attendance` | `?class_id&date` roster; POST upserts + notifies parents of absentees |
| POST | `/attendance/excuse` | parent excuse note |
| GET/POST/PATCH | `/improvement` · `/improvement/:id` | points of improvement (student can update progress) |
| GET/POST | `/exams` · POST `/exams/:id/results` | |
| GET | `/grades/:studentId` | results + per-subject averages |
| GET/POST | `/merit/:studentId` · `/merit` | merit points |
| GET/POST/PATCH/DELETE | `/tasks` · `/tasks/:id` | personal to-dos |
| POST/GET | `/mood` | daily check-in (flags counsellors) |
| POST/GET/PATCH | `/reports` | safe reporting |
| GET/POST | `/library` · `/reading-log` | |
| GET | `/quizzes` · `/quizzes/:id` · POST `/quizzes/:id/attempt` | |
| GET/POST/PATCH | `/meetings` | parent ⇄ teacher meeting requests |
| GET | `/stats` | admin dashboard numbers |

## Clinic — `/api/clinic`
| Method | Path | Notes |
|---|---|---|
| GET | `/overview` | role-aware (doctor / reception / nurse / pharmacist / admin / patient) |
| GET/POST/PATCH | `/queue` · `/queue/:id` | issue token, call, skip, complete |
| GET/POST/PATCH | `/patients` · `/patients/:id` | registration + full chart; POST `/patients/:id/link` |
| POST/PATCH | `/encounters` · `/encounters/:id` | SOAP note + vitals + follow-up |
| POST/GET | `/prescriptions` · POST `/prescriptions/:id/dispense` | dispensing deducts stock |
| POST/PATCH | `/labs` · `/labs/:id` | |
| GET/POST/PATCH | `/appointments` · `/appointments/:id` | `checked_in` also issues a queue token |
| GET/POST/PATCH | `/medications` · GET `/stock-movements` | |
| GET/POST/PATCH | `/vaccinations/:patientId` · `/vaccinations` | EPI schedule generated from date of birth |
| POST/PATCH | `/pregnancies` | LMP → EDD and gestational weeks |
| GET/POST | `/departments` | |

## AI — `/api/ai`
| Method | Path | Notes |
|---|---|---|
| POST | `/chat` | `{message, lang, module, conversation_id, homework_id}` → `{reply, meta, suggestions}` |
| GET | `/conversations` · `/conversations/:id` · DELETE | |
| POST | `/feedback` | thumbs up/down, report unsafe answers |
| GET | `/greeting` · `/status` | current mode (`offline` or `llm`) |

## Legacy
`GET /api/books` and `GET /api/quizzes` (the original prototype's JSON files) still work, and
the old interface is served at **`/legacy`**.

## Error codes
`auth_required` (401) · `forbidden` (403) · `not_found` (404) · `not_your_student` ·
`not_your_patient` · `parents_cannot_submit_homework` · `bad_credentials` · `username_taken` ·
`file_type_not_allowed`.

## Smoke test

```bash
npm install --no-save jsdom     # dev-only
node testtools/smoke.js         # walks every route as every demo role
```
(The script lives in this repo's test harness; it boots the real PWA in jsdom against a
running server and fails on any runtime error or empty screen.)
