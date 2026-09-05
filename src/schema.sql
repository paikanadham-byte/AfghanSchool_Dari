-- ============================================================================
-- Afghan Care & School — schema
-- Two isolated products share one core: orgs of type "school" and "clinic".
-- Localised user content is stored as JSON: {"fa":"...","ps":"...","en":"..."}
-- ============================================================================

-- ---------------------------------------------------------------- CORE ------
CREATE TABLE IF NOT EXISTS orgs (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('school','clinic')),
  name_fa     TEXT, name_ps TEXT, name_en TEXT,
  province    TEXT, city TEXT, address TEXT, phone TEXT,
  settings    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS terms (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name_fa     TEXT, name_ps TEXT, name_en TEXT,
  start_date  TEXT NOT NULL, end_date TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  username     TEXT NOT NULL UNIQUE,
  phone        TEXT,
  pass_hash    TEXT NOT NULL,
  pass_salt    TEXT NOT NULL,
  name_fa      TEXT, name_ps TEXT, name_en TEXT,
  email        TEXT,
  avatar       TEXT,
  lang         TEXT NOT NULL DEFAULT 'fa',
  prefs        TEXT NOT NULL DEFAULT '{}',
  is_active    INTEGER NOT NULL DEFAULT 1,
  last_login   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  token        TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_user_id TEXT,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- parent <-> student links (a parent may have several children in one login)
CREATE TABLE IF NOT EXISTS guardians (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation    TEXT NOT NULL DEFAULT 'parent',
  pin_hash    TEXT,
  can_message INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  UNIQUE (parent_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_guardians_parent ON guardians(parent_id);

CREATE TABLE IF NOT EXISTS announcements (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  module       TEXT NOT NULL DEFAULT 'school',
  scope        TEXT NOT NULL DEFAULT 'org',   -- org | class | subject | role | user
  audience     TEXT NOT NULL DEFAULT '{}',    -- json: classIds[], role, userIds[]
  title        TEXT NOT NULL,                 -- json
  body         TEXT NOT NULL,                 -- json
  priority     TEXT NOT NULL DEFAULT 'normal',-- low|normal|high|urgent
  is_pinned    INTEGER NOT NULL DEFAULT 0,
  published_at TEXT NOT NULL,
  expires_at   TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ann_org ON announcements(org_id, module);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TEXT NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module     TEXT NOT NULL DEFAULT 'school',
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,   -- json
  body       TEXT NOT NULL,   -- json
  data       TEXT NOT NULL DEFAULT '{}',
  priority   TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  read_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS calendar_events (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  module     TEXT NOT NULL DEFAULT 'school',
  date       TEXT NOT NULL,       -- ISO yyyy-mm-dd
  end_date   TEXT,
  type       TEXT NOT NULL,       -- holiday | exam | event | vacation | deadline | camp
  title      TEXT NOT NULL,       -- json
  body       TEXT,                -- json
  audience   TEXT NOT NULL DEFAULT '{}',
  all_day    INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cal_org ON calendar_events(org_id, module, date);

CREATE TABLE IF NOT EXISTS threads (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  module          TEXT NOT NULL DEFAULT 'school',
  subject         TEXT,
  participants    TEXT NOT NULL,  -- json array of user ids
  created_by      TEXT,
  created_at      TEXT NOT NULL,
  last_message_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_threads_org ON threads(org_id, module);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  module      TEXT NOT NULL DEFAULT 'school',
  ref_type    TEXT NOT NULL,
  ref_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  mime        TEXT,
  size        INTEGER NOT NULL DEFAULT 0,
  path        TEXT NOT NULL,
  uploaded_by TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_ref ON attachments(ref_type, ref_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  user_id    TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(org_id, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  keys       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, endpoint)
);

-- ------------------------------------------------------------- SCHOOL -------
CREATE TABLE IF NOT EXISTS classes (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  term_id    TEXT,
  grade      INTEGER NOT NULL,          -- 1..12
  section    TEXT NOT NULL DEFAULT 'الف',
  name_fa    TEXT, name_ps TEXT, name_en TEXT,
  room       TEXT,
  capacity   INTEGER NOT NULL DEFAULT 40,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_classes_org ON classes(org_id);

CREATE TABLE IF NOT EXISTS subjects (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  code       TEXT,
  name_fa    TEXT, name_ps TEXT, name_en TEXT,
  grade_min  INTEGER, grade_max INTEGER,
  color      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id    TEXT,
  roll_no    INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_id);

CREATE TABLE IF NOT EXISTS teaching_assignments (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id    TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (class_id, subject_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  day        INTEGER NOT NULL,     -- 0=Saturday .. 6=Friday (Afghan week)
  period     INTEGER NOT NULL,
  start_time TEXT NOT NULL,        -- "08:00"
  end_time   TEXT NOT NULL,
  room       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tt_class ON timetable_slots(class_id, day);

CREATE TABLE IF NOT EXISTS homework (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  class_id     TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id   TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  instructions TEXT,
  assigned_at  TEXT NOT NULL,
  due_at       TEXT NOT NULL,
  max_points   INTEGER NOT NULL DEFAULT 10,
  est_minutes  INTEGER NOT NULL DEFAULT 30,
  difficulty   TEXT NOT NULL DEFAULT 'medium',   -- easy|medium|hard
  allow_text   INTEGER NOT NULL DEFAULT 1,
  allow_file   INTEGER NOT NULL DEFAULT 1,
  allow_audio  INTEGER NOT NULL DEFAULT 1,
  requires_upload INTEGER NOT NULL DEFAULT 0,
  ai_help      TEXT NOT NULL DEFAULT 'explain',  -- explain|hints|off
  status       TEXT NOT NULL DEFAULT 'published',-- draft|published|closed
  client_id    TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hw_class ON homework(class_id, due_at);
CREATE INDEX IF NOT EXISTS idx_hw_teacher ON homework(teacher_id);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id           TEXT PRIMARY KEY,
  homework_id  TEXT NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text         TEXT,
  attachments  TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'submitted', -- submitted|late|graded|returned
  submitted_at TEXT NOT NULL,
  is_late      INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 1,
  score        REAL,
  feedback     TEXT,
  rubric       TEXT,
  graded_by    TEXT,
  graded_at    TEXT,
  parent_seen  INTEGER NOT NULL DEFAULT 0,
  client_id    TEXT,
  UNIQUE (homework_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_sub_hw ON homework_submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_sub_student ON homework_submissions(student_id);

-- "points of improvement" — growth notes shared with student + parent
CREATE TABLE IF NOT EXISTS improvement_points (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id   TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL DEFAULT 'focus', -- strength|focus|behavior|skill|attendance
  text       TEXT NOT NULL,
  goal       TEXT,
  severity   TEXT NOT NULL DEFAULT 'normal', -- low|normal|high
  due_date   TEXT,
  status     TEXT NOT NULL DEFAULT 'open',   -- open|improving|achieved|closed
  progress   INTEGER NOT NULL DEFAULT 0,
  parent_seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ip_student ON improvement_points(student_id, created_at);

-- personal task list (student / teacher / anyone)
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  owner_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  notes      TEXT,
  due_date   TEXT,
  priority   TEXT NOT NULL DEFAULT 'normal',
  is_done    INTEGER NOT NULL DEFAULT 0,
  ref_type   TEXT, ref_id TEXT,
  created_at TEXT NOT NULL,
  done_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id, is_done);

CREATE TABLE IF NOT EXISTS attendance (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  status      TEXT NOT NULL,      -- present|absent|late|excused
  note        TEXT,
  recorded_by TEXT,
  parent_seen INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  UNIQUE (class_id, student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_class_date ON attendance(class_id, date);

CREATE TABLE IF NOT EXISTS exams (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  term_id    TEXT,
  name       TEXT NOT NULL,   -- json
  date       TEXT NOT NULL,
  max_marks  INTEGER NOT NULL DEFAULT 100,
  pass_marks INTEGER NOT NULL DEFAULT 40,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exam_results (
  id         TEXT PRIMARY KEY,
  exam_id    TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marks      REAL NOT NULL,
  remarks    TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS merit_points (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id TEXT,
  kind       TEXT NOT NULL,     -- positive|negative
  category   TEXT NOT NULL DEFAULT 'participation',
  points     INTEGER NOT NULL DEFAULT 1,
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_merit_student ON merit_points(student_id);

CREATE TABLE IF NOT EXISTS student_badges (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  awarded_at TEXT NOT NULL,
  awarded_by TEXT,
  UNIQUE (student_id, code)
);

CREATE TABLE IF NOT EXISTS mood_checks (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  mood       TEXT NOT NULL,   -- great|ok|tired|sad|worried|sick
  note       TEXT,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (student_id, date)
);

CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  reporter_id TEXT,
  category   TEXT NOT NULL,  -- bullying|safety|health|facility|other
  text       TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'normal',
  status     TEXT NOT NULL DEFAULT 'open',
  handled_by TEXT,
  response   TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS library_books (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  title      TEXT NOT NULL,
  grade      INTEGER,
  subject    TEXT,
  language   TEXT,
  source     TEXT,
  url        TEXT,
  local_file TEXT,
  cover      TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_logs (
  id         TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    TEXT REFERENCES library_books(id) ON DELETE CASCADE,
  minutes    INTEGER NOT NULL DEFAULT 0,
  pages      INTEGER NOT NULL DEFAULT 0,
  date       TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quizzes (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  grade      INTEGER,
  title      TEXT NOT NULL,
  questions  TEXT NOT NULL,   -- json array
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          TEXT PRIMARY KEY,
  quiz_id     TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers     TEXT NOT NULL,
  score       INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  completed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qa_student ON quiz_attempts(student_id);

CREATE TABLE IF NOT EXISTS meeting_requests (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  parent_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
  student_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT,
  slots       TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|declined|done
  scheduled_at TEXT,
  created_at  TEXT NOT NULL
);

-- ------------------------------------------------------------- CLINIC -------
CREATE TABLE IF NOT EXISTS departments (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name_fa    TEXT, name_ps TEXT, name_en TEXT,
  code       TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patients (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  mrn          TEXT NOT NULL,
  user_id      TEXT,                        -- optional app login
  full_name    TEXT NOT NULL,
  guardian_name TEXT,
  phone        TEXT,
  sex          TEXT,                        -- male|female|other
  dob          TEXT,
  blood_group  TEXT,
  province     TEXT, city TEXT, village TEXT,
  allergies    TEXT NOT NULL DEFAULT '[]',
  conditions   TEXT NOT NULL DEFAULT '[]',
  notes        TEXT,
  is_pregnant  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  UNIQUE (org_id, mrn)
);
CREATE INDEX IF NOT EXISTS idx_patients_org ON patients(org_id);
CREATE INDEX IF NOT EXISTS idx_patients_user ON patients(user_id);

CREATE TABLE IF NOT EXISTS patient_guardians (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relation   TEXT NOT NULL DEFAULT 'guardian',
  created_at TEXT NOT NULL,
  UNIQUE (patient_id, user_id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  department  TEXT,
  date        TEXT NOT NULL,
  time_slot   TEXT,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'booked', -- booked|checked_in|in_consult|seen|cancelled|no_show
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(org_id, date);

CREATE TABLE IF NOT EXISTS queue_tokens (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  department  TEXT,
  date        TEXT NOT NULL,
  token_no    INTEGER NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 0,   -- 1 = urgent / elderly / child
  status      TEXT NOT NULL DEFAULT 'waiting', -- waiting|called|in_consult|done|skipped
  issued_at   TEXT NOT NULL,
  called_at   TEXT,
  done_at     TEXT,
  UNIQUE (org_id, date, token_no)
);
CREATE INDEX IF NOT EXISTS idx_queue_date ON queue_tokens(org_id, date, status);

CREATE TABLE IF NOT EXISTS encounters (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  patient_id    TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id     TEXT,
  date          TEXT NOT NULL,
  complaints    TEXT,
  history       TEXT,
  exam          TEXT,
  diagnosis     TEXT,
  plan          TEXT,
  vitals        TEXT NOT NULL DEFAULT '{}',   -- json: bp, temp, pulse, weight, height, spo2, rr
  follow_up_date TEXT,
  attachments   TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enc_patient ON encounters(patient_id, date);

CREATE TABLE IF NOT EXISTS prescriptions (
  id           TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  org_id       TEXT NOT NULL,
  patient_id   TEXT NOT NULL,
  doctor_id    TEXT,
  items        TEXT NOT NULL DEFAULT '[]',  -- [{name,dose,freq,days,qty,note}]
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending|dispensed|partial
  dispensed_by TEXT,
  dispensed_at TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescriptions(patient_id);

CREATE TABLE IF NOT EXISTS lab_orders (
  id           TEXT PRIMARY KEY,
  encounter_id TEXT REFERENCES encounters(id) ON DELETE CASCADE,
  org_id       TEXT NOT NULL,
  patient_id   TEXT NOT NULL,
  test_name    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ordered', -- ordered|collected|resulted
  result       TEXT,
  notes        TEXT,
  ordered_by   TEXT,
  resulted_at  TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS medications (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  name_fa      TEXT, name_ps TEXT,
  generic      TEXT,
  form         TEXT,           -- tablet|syrup|injection|ointment|drops|capsule
  strength     TEXT,
  unit         TEXT NOT NULL DEFAULT 'unit',
  stock_qty    REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 10,
  batch_no     TEXT,
  expiry_date  TEXT,
  storage      TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meds_org ON medications(org_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  change_qty REAL NOT NULL,
  reason     TEXT,     -- received|dispensed|expired|adjusted|lost
  ref_type   TEXT, ref_id TEXT,
  user_id    TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vaccinations (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  vaccine    TEXT NOT NULL,
  dose_no    INTEGER NOT NULL DEFAULT 1,
  due_date   TEXT,
  given_date TEXT,
  batch_no   TEXT,
  given_by   TEXT,
  note       TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vac_patient ON vaccinations(patient_id);

CREATE TABLE IF NOT EXISTS pregnancies (
  id          TEXT PRIMARY KEY,
  patient_id  TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lmp_date    TEXT NOT NULL,
  edd         TEXT NOT NULL,
  risk_flags  TEXT NOT NULL DEFAULT '[]',
  visits      TEXT NOT NULL DEFAULT '[]',
  outcome     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module     TEXT NOT NULL DEFAULT 'school',
  title      TEXT,
  context    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id, module);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,   -- user|assistant|system
  content         TEXT NOT NULL,
  meta            TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversation_id);

CREATE TABLE IF NOT EXISTS ai_flags (
  id         TEXT PRIMARY KEY,
  org_id     TEXT,
  user_id    TEXT,
  message_id TEXT REFERENCES ai_messages(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,   -- homework_solve|medical_advice|unsafe|wrong
  detail     TEXT,
  created_at TEXT NOT NULL
);
