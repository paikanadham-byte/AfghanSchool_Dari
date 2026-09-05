# Feature inventory

Everything below is implemented in this repository (not a wish list). Ideas for future
releases are marked **🔜**.

## 🌍 Platform
- [x] Mobile-first installable PWA (Add to Home Screen, standalone, splash, theme colour)
- [x] Three languages: **Dari, Pashto, English** — switchable per user, persisted
- [x] Full RTL layout using logical CSS properties (flips automatically for English)
- [x] **Solar Hijri (Jalali) dates** everywhere, with Afghan month names in all three languages
- [x] Afghan week (Saturday → Friday, Friday shown as the weekend)
- [x] Offline app shell, cached API reads, and an **outbox** for writes made without signal
- [x] Lite mode (no shadows/animation), large-text mode, high-contrast touch targets
- [x] Read-aloud (speech synthesis) for tasks, announcements and tutor answers
- [x] Session works with cookie **or** `Bearer` token (ready for a native wrapper)
- [x] Audit log of privileged actions
- [x] Full-text-ish search across students/homework/books (school) and patients (clinic)
- [x] CSV export of users; CSV import of users with class + parent links

## 👩‍🎓 Student
- [x] Home dashboard: greeting, today's date, current/next lesson, counts, due-soon card
- [x] Homework list with status tabs (to do / submitted / marked / redo) and live countdowns
- [x] Homework detail: instructions, attachments, due date, difficulty, estimated minutes
- [x] Submit **text, photo (camera), file, or voice recording**; resubmit after "please redo"
- [x] Score + teacher feedback visible after marking
- [x] **Ask the tutor about this exact task** (context is attached to the chat)
- [x] Weekly timetable grid + today's lesson list with the current period highlighted
- [x] Calendar: holidays, exam windows, events, campaigns (Jalali + Gregorian)
- [x] **Points of improvement** with category, goal, severity and a progress slider the
      student can update themselves
- [x] Marks & subject averages with bar charts; exam schedule
- [x] Attendance history with per-day chips and an attendance percentage
- [x] Merit points and badges
- [x] Personal task list with due dates and priorities
- [x] Library: Ministry books (from `books.json`) + reading log in minutes
- [x] Practice quizzes with instant explanations
- [x] Daily mood check-in (flags counsellors when a student is sad/worried/sick)
- [x] Safe "report a problem" (bullying, safety, facility) routed to admins
- [x] Messaging with teachers

## 👨‍👩‍👧 Parent
- [x] One login, many children; child switcher at the top
- [x] **Enter the app as the child** (optional 4-digit PIN protects the switch)
- [x] Per-child dashboard: pending/overdue homework, attendance, merit, next task
- [x] Read-only view of a child's submissions, feedback and improvement points
- [x] Cannot submit homework for the child (enforced server-side)
- [x] Absence **excuse note** sent to the teacher
- [x] Meeting requests with preferred time slots
- [x] Notifications: absence, new homework, marking, improvement points

## 👩‍🏫 Teacher
- [x] Home: today's lessons, submissions to mark, absences today, at-risk students (3+ absences)
- [x] Create homework for **several classes at once** with trilingual title/instructions,
      due date, points, estimated time, difficulty, allowed submission types
- [x] Marking screen per student: score, feedback, mark as "redo"
- [x] Grading notifies the student **and** the parents
- [x] Attendance taking with one tap per student; "all present" shortcut; parents of absent
      students are notified immediately
- [x] Write **points of improvement** (strength / focus / behaviour / skill / attendance)
- [x] Class rosters with absence counts and submission counts
- [x] Announcements to the school, a class, a role or specific users
- [x] Timetable view, exam creation, result entry
- [x] Merit points (positive and negative)
- [x] Messaging with parents

## 🏫 Principal / school admin
- [x] Dashboard: students, teachers, parents, classes, submission rate, attendance today
- [x] Users: create, list, filter by role, CSV import/export
- [x] Classes & subjects; enrol students
- [x] **Timetable builder** (class × 6 days × 6 periods → subject + teacher)
- [x] Holidays and events calendar with audience targeting
- [x] Reports inbox (categories + severity) with respond/close
- [x] Activity log

## 🏥 Clinic & hospital (separate module, separate login, separate data)
### Reception
- [x] Patient registration with auto MRN, guardian, allergies, chronic conditions, blood group
- [x] **Queue tokens**: issue (with priority for urgent/elderly/child), call, skip, complete
- [x] Live queue with waiting/serving/done counts and average wait time
- [x] Appointments book; **check-in converts an appointment into a queue token**
- [x] **Display board** (`#/board`) — big "now serving" screen for the waiting room TV
### Doctor
- [x] My queue, call next, jump to the patient chart
- [x] Encounter record: complaints, history, examination, vitals, diagnosis, plan, follow-up
- [x] Prescriptions with dose / frequency / days / quantity
- [x] Lab orders and results
- [x] Follow-up list, vaccination records, pregnancy record (EDD + gestational weeks)
### Nurse
- [x] Vitals capture, vaccination (EPI) card, queue support
### Pharmacist
- [x] Inventory with low-stock and expiry alerts (expired / expiring in 60–90 days)
- [x] Pending prescriptions queue; **dispensing deducts stock** automatically
- [x] Receive/adjust stock with movement history
### Lab
- [x] Test orders, result entry, status flow
### Patient
- [x] Own + family records only (server-side enforced)
- [x] Live token with "people ahead" count, appointments, prescriptions, vaccination card,
      pregnancy progress
- [x] **Health assistant** (general information, never a diagnosis, red-flag escalation)
- [x] 🔜 Self-registration flow (endpoint `/api/auth/self-register` exists, no UI yet)

## 🤖 AI tutor / health assistant
- [x] Explains the task, teaches the method, gives a **similar worked example with different numbers**
- [x] Step frameworks, guiding questions, study coaching (memorising, planning, exam prep, focus, notes)
- [x] Dari ⇄ Pashto ⇄ English school glossary (40 terms)
- [x] Reviews the student's own answer with a checklist instead of writing the answer
- [x] Refuses "do my homework / give me the answer" in all three languages and explains why
- [x] Refusals are stored in `ai_flags` so staff can see who needs help
- [x] Conversation history per user; feedback (wrong/unsafe) reporting
- [x] Works with **no API key** (offline knowledge bank) and upgrades to an LLM when
      `OPENAI_API_KEY` (or any OpenAI-compatible `AI_BASE_URL`) is set
- [x] Clinic mode: never diagnoses, never prescribes, red-flag detection with Pashto spelling variants

## 🔜 Natural next releases
1. **Web Push** — schema (`push_subscriptions`) ready; add a `web-push` sender so homework and
   token notifications reach the phone when the app is closed.
2. **SMS reminders** — pluggable gateway adapter for appointment and homework reminders
   (feature phones, no data).
3. **Weekly parent digest** — one message per child per week (Dari/Pashto), opt-in.
4. **Offline PDFs** — cache library books in the service worker for true offline reading.
5. **Native wrapper** — Capacitor/Expo shell reusing the same API for Play Store distribution.
6. **District dashboard** — one login supervising many schools and clinics.
7. **Transport & canteen** modules, library loans, staff leave.
