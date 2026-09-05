# 📚🏥 Afghan Care & School

**One offline-first phone app for schools, clinics and hospitals in Afghanistan.**
Homework, timetables, improvement points, attendance, clinic queue tokens, patient records,
pharmacy stock — plus an AI tutor that **explains without ever doing the work**.

**دری · پښتو · English** — every screen, every notification, in all three languages, with
Solar Hijri (Jalali) dates and the Afghan Saturday–Friday week.

---

## ✨ What it does

### 🎓 School module
| For | Highlights |
|---|---|
| **Students** | Homework list with countdowns, submit text / photo / file / **voice**, ask the AI tutor about the exact task, weekly timetable, holidays & exam calendar, "points of improvement" with progress sliders, marks & averages, attendance, merit points & badges, reading log, practice quizzes, personal tasks, daily mood check-in, safe "report a problem" |
| **Parents** | One login for all children, switch into a child's account (optional 4-digit PIN), see homework status, attendance, teacher feedback and improvement points, request meetings, message teachers, receive absence alerts |
| **Teachers** | Create homework once and send to several classes, mark submissions with score + rubric + feedback (or "please redo"), one-tap attendance that notifies parents of absences, write improvement points, class rosters with risk flags, announcements, timetable |
| **Principal / Admin** | Live statistics (submission rate, attendance today), users & CSV import, classes, subjects, **timetable builder**, holidays/events calendar, reports inbox, activity log |

### 🏥 Clinic / hospital module — separate system, separate login, separate data
| For | Highlights |
|---|---|
| **Reception** | Register patients (auto MRN), issue **queue tokens** with priority, appointment book, check-in that drops a patient into today's queue |
| **Doctor** | My queue, call next, full patient chart (vitals, SOAP notes, diagnosis, plan), prescriptions, lab orders, follow-up dates |
| **Nurse** | Vitals, vaccination (EPI) cards, queue support |
| **Pharmacist** | Medicine inventory with stock/expiry alerts, dispense prescriptions (stock auto-deducts), receive stock, movement history |
| **Lab** | Order tests, record results |
| **Patient** | Own (and family) records only: live token number with "people ahead", appointments, prescriptions, vaccination card, pregnancy week, **health assistant** that never diagnoses |

### 🤖 AI tutor with hard guardrails
* Explains what a task is asking, teaches the method, gives a **similar worked example with different numbers**, translates school vocabulary Dari ⇄ Pashto ⇄ English, reviews your own answer with a checklist.
* **Refuses** "solve it for me / give me the answer" in all three languages and explains why — then offers four ways to get real help. Every refusal is logged.
* Runs **fully offline** by default (built-in curriculum knowledge bank: algebra, fractions, geometry, photosynthesis, water cycle, essay writing, English grammar, history method + study coaching).
* Drop in `OPENAI_API_KEY` (or any OpenAI-compatible endpoint / local Ollama) and it upgrades to an LLM — the same guardrails still apply.
* Regenerate the icon set with `node testtools/gen-icons.js` (needs `lucide-static`).
* In the clinic module it becomes a **health-information assistant**: general guidance only, never a diagnosis, with red-flag detection (chest pain, breathing difficulty, fits, heavy bleeding, poisoning, pregnancy bleeding, high fever) that tells the user to go to the clinic now.

### 🌐 Built for Afghanistan's reality
* **Offline-first PWA** — install on the home screen; screens still open with no signal.
* **Outbox** — homework submissions and attendance taken offline queue locally and sync automatically when signal returns.
* **Low bandwidth** — no external fonts, no CDNs, no frameworks; "Lite mode" strips shadows and animation.
* **Accessibility** — large-text mode, read-aloud (speech) on tasks and tutor answers, big touch targets, works on cheap Android phones.
* **No tracking, no third-party SDKs** — everything can run on one server inside the country.

---

## 🚀 Quick start

```bash
git clone <this repo> && cd AfghanSchool_Dari
npm install
npm start               # http://localhost:4000
```

The database is created and **seeded with two demo organisations** on first run.

| Demo account | Role | What you see |
|---|---|---|
| `demo.admin` | School admin | Statistics, users, timetable builder, calendar |
| `demo.principal` | Principal | Same as admin |
| `demo.teacher` | Teacher (Math) | 3 classes, homework to mark, attendance |
| `demo.teacher2` | Teacher (Dari) | Another teacher's view |
| `demo.student5a1` | Student (grade 5-A) | Homework, timetable, improvement points, tutor |
| `demo.parent` | Parent of 3 children | Children switcher, switch into child's account |
| `demo.doctor` | Clinic doctor | Queue, patient charts, prescriptions |
| `demo.nurse` / `demo.reception` / `demo.pharmacist` / `demo.lab` | Clinic staff | Their own workflows |
| `demo.patient` | Patient | Own token, appointments, prescriptions, vaccination card |

**Password for every demo account: `demo1234`** — they are also one-tap buttons on the sign-in screen.

Reset the demo data at any time:

```bash
npm run reset     # clears + reseeds
```

---

## 🧪 Testing

```bash
npm test    # self test: boots the app on a random port, 26 checks (auth, homework
            # lifecycle, parent guardrail, attendance notifications, clinic queue,
            # prescriptions, stock, patient isolation, triage) — no network needed
```

Two optional harnesses in `testtools/` drive a running server and need `npm i --no-save jsdom`:
`smoke.js` walks every route as all 8 demo roles looking for runtime errors, and `flows.js`
runs the end-to-end write flows. See [`testtools/README.md`](testtools/README.md).

---

## 🧱 Stack

* **Backend** Node.js 22 + Express + SQLite (`node:sqlite`, no native build step) — one file-based database, WAL mode.
* **Frontend** Zero-build vanilla JS PWA (service worker + cache + outbox). No bundler, no npm install to deploy the client.
* **Design** One token-based design system in `public/css/styles.css`: light + dark themes, school (indigo) and clinic (teal) palettes, low-end "lite" mode and large-text mode. Every icon is an inline SVG from `public/js/icons.js` — the interface contains **no emoji**, and no fonts or images are fetched at runtime.
* **Auth** Session cookie (`httpOnly`) or `Authorization: Bearer` token, scrypt password hashing, role + organisation scoping on every query.
* **AI** Pluggable: offline rule engine ⇢ optional OpenAI-compatible LLM.

---

## 📖 Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, data model, request flow, offline strategy, security model |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Complete feature inventory + ideas for the next releases |
| [`docs/SETUP.md`](docs/SETUP.md) | Installation, environment variables, deployment, backups, SMS gateway, AI setup, CSV import |
| [`docs/API.md`](docs/API.md) | REST endpoint reference |

---

## 🗂 Repository layout

```
server.js               Express entry point (API + static PWA + reminder scheduler)
src/
  db.js                 SQLite connection + query helpers
  schema.sql            Full data model (core / school / clinic / ai)
  seed.js               Demo organisations (school + clinic)
  auth.js               Sessions, roles, parent⇄child switching, access guards
  notify.js             Notifications, reminders engine, audit log
  util.js               Dates (Jalali), hashing, CSV, pregnancy/vaccination helpers
  ai/engine.js          Socratic tutor: guardrails, intents, offline knowledge, LLM bridge
  ai/topics.js          Curriculum knowledge bank + glossary (Dari/Pashto/English)
  routes/               auth · core · school · clinic · ai
public/
  index.html            PWA shell
  sw.js                 Service worker (offline shell, cached GETs)
  manifest.webmanifest  Install metadata
  css/styles.css        RTL-aware mobile design, lite & large-text modes
  js/                   app shell, router, i18n, UI kit, views (school/clinic/tutor)
  js/icons.js           generated stroke-icon set (no emoji anywhere in the UI)
  icons/                App icons
  design-preview.html   Component gallery (light + dark), served at /design-preview.html
data/                   app.db + uploads (git-ignored)
```

## 🧭 Roadmap ideas already scaffolded in the code

Web push notifications (schema has `push_subscriptions`), SMS appointment reminders
(pluggable gateway), parent weekly digest email, native wrapper (Capacitor) reusing the same
API, library offline PDFs, transport tracking, and a district-level dashboard across many
schools and clinics.

---

## ⚠️ Notes

* The seeded Ministry of Education book links point at public URLs already used by this repo
  (`books.json`, `quizzes.json`); the original prototype is still served at **`/legacy`**.
* Not a medical device: the clinic assistant gives general information only and never diagnoses.
* Change the demo passwords (or delete the demo accounts) before any real deployment.

## 📄 License

Add your licence here. Content from `books.json`/`quizzes.json` belongs to its original
publishers — make sure you have the right to host any material you upload.
