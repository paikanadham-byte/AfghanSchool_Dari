'use strict';
const express = require('express');
const { get, all, insert, update, run, remove, upsert } = require('../db');
const U = require('../util');
const A = require('../auth');
const N = require('../notify');
const { ok, fail, wrap, q, logAction } = require('../http');

const router = express.Router();
const STAFF = ['admin', 'principal', 'teacher'];
const ADMIN = ['admin', 'principal'];

const j = (v, def) => (typeof v === 'string' ? U.J.parse(v, def) : (v === undefined || v === null ? def : v));

// ------------------------------------------------------------- overviews ----
function studentOverview(studentId, lang) {
  const today = U.ymd();
  const classes = all(`SELECT c.* FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE e.student_id = ?`, [studentId]);
  const classIds = classes.map((c) => c.id);
  const weekDay = U.afWeekday();
  const todaySlots = classIds.length ? all(
    `SELECT s.*, sub.name_fa AS subject_fa, u.name_fa AS teacher_fa FROM timetable_slots s
     LEFT JOIN subjects sub ON sub.id = s.subject_id LEFT JOIN users u ON u.id = s.teacher_id
     WHERE s.class_id IN (${classIds.map(() => '?').join(',')}) AND s.day = ? ORDER BY s.period`,
    [...classIds, weekDay]
  ) : [];

  const homework = classIds.length ? all(
    `SELECT h.*, sub.name_fa AS subject_fa,
            (SELECT status FROM homework_submissions s WHERE s.homework_id = h.id AND s.student_id = ?) AS sub_status,
            (SELECT score FROM homework_submissions s WHERE s.homework_id = h.id AND s.student_id = ?) AS score
     FROM homework h LEFT JOIN subjects sub ON sub.id = h.subject_id
     WHERE h.class_id IN (${classIds.map(() => '?').join(',')}) AND h.status = 'published'
     ORDER BY h.due_at ASC LIMIT 60`,
    [studentId, studentId, ...classIds]
  ) : [];

  const pending = homework.filter((h) => !h.sub_status);
  const returned = homework.filter((h) => h.sub_status === 'returned');
  const graded = homework.filter((h) => h.sub_status === 'graded');
  const overdue = pending.filter((h) => Date.parse(h.due_at) < Date.now());

  const merit = get('SELECT SUM(CASE WHEN kind = \'positive\' THEN points ELSE -points END) AS total FROM merit_points WHERE student_id = ?', [studentId])?.total || 0;
  const improvements = all(`SELECT i.*, sub.name_fa AS subject_fa, u.name_fa AS teacher_fa FROM improvement_points i
    LEFT JOIN subjects sub ON sub.id = i.subject_id LEFT JOIN users u ON u.id = i.teacher_id
    WHERE i.student_id = ? AND i.status != 'closed' ORDER BY i.created_at DESC LIMIT 20`, [studentId]);

  const att = all(`SELECT status, date FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 30`, [studentId]);
  const present = att.filter((a) => a.status === 'present' || a.status === 'late').length;
  const attendancePct = att.length ? Math.round((present / att.length) * 100) : null;

  const tasks = all(`SELECT * FROM tasks WHERE owner_id = ? AND is_done = 0 ORDER BY due_date IS NULL, due_date ASC LIMIT 20`, [studentId]);
  const badges = all(`SELECT * FROM student_badges WHERE student_id = ? ORDER BY awarded_at DESC LIMIT 12`, [studentId]);
  const upcomingExams = classIds.length ? all(
    `SELECT e.*, sub.name_fa AS subject_fa FROM exams e LEFT JOIN subjects sub ON sub.id = e.subject_id
     WHERE e.class_id IN (${classIds.map(() => '?').join(',')}) AND e.date >= ? ORDER BY e.date ASC LIMIT 5`,
    [...classIds, today]
  ) : [];

  return {
    kind: 'student',
    classes,
    today_slots: todaySlots,
    homework: { pending, returned, graded, overdue, all: homework },
    merit_total: merit,
    improvements,
    attendance_pct: attendancePct,
    recent_attendance: att.slice(0, 10),
    tasks,
    badges,
    upcoming_exams: upcomingExams,
    next_up: pending[0] || null
  };
}

function teacherOverview(teacherId) {
  const today = U.ymd();
  const classIds = A.classIdsForTeacher(teacherId);
  const classes = classIds.length ? all(`SELECT * FROM classes WHERE id IN (${classIds.map(() => '?').join(',')})`, classIds) : [];
  const weekDay = U.afWeekday();
  const todaySlots = classIds.length ? all(
    `SELECT s.*, sub.name_fa AS subject_fa, c.grade, c.section FROM timetable_slots s
     LEFT JOIN subjects sub ON sub.id = s.subject_id JOIN classes c ON c.id = s.class_id
     WHERE s.teacher_id = ? AND s.day = ? ORDER BY s.period`, [teacherId, weekDay]
  ) : [];
  const myHomework = all(`SELECT h.*, (SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id) AS submissions
    FROM homework h WHERE h.teacher_id = ? ORDER BY h.due_at DESC LIMIT 40`, [teacherId]);
  const toGrade = all(
    `SELECT s.*, h.title AS hw_title, u.name_fa AS student_fa FROM homework_submissions s
     JOIN homework h ON h.id = s.homework_id JOIN users u ON u.id = s.student_id
     WHERE h.teacher_id = ? AND (s.status IN ('submitted','late')) ORDER BY s.submitted_at ASC LIMIT 40`, [teacherId]
  );
  const studentIds = classIds.length
    ? all(`SELECT student_id FROM enrollments WHERE class_id IN (${classIds.map(() => '?').join(',')})`, classIds).map((r) => r.student_id)
    : [];
  const absentToday = studentIds.length ? all(
    `SELECT a.*, u.name_fa FROM attendance a JOIN users u ON u.id = a.student_id
     WHERE a.date = ? AND a.status = 'absent' AND a.student_id IN (${studentIds.map(() => '?').join(',')})`, [today, ...studentIds]
  ) : [];
  // students with 3+ absences in the last 14 days
  const atRisk = studentIds.length ? all(
    `SELECT student_id, COUNT(*) AS c FROM attendance WHERE date >= ? AND status = 'absent'
     AND student_id IN (${studentIds.map(() => '?').join(',')}) GROUP BY student_id HAVING c >= 3 ORDER BY c DESC LIMIT 10`,
    [U.ymdPlus(-14), ...studentIds]
  ).map((r) => ({ student_id: r.student_id, absences: r.c, name: get('SELECT name_fa FROM users WHERE id = ?', [r.student_id])?.name_fa })) : [];

  return {
    kind: 'teacher', classes, today_slots: todaySlots,
    homework: myHomework, to_grade: toGrade,
    absent_today: absentToday, at_risk: atRisk,
    students_count: studentIds.length
  };
}

function adminOverview(orgId) {
  const today = U.ymd();
  const students = get(`SELECT COUNT(*) AS c FROM users WHERE org_id = ? AND role = 'student' AND is_active = 1`, [orgId]).c;
  const teachers = get(`SELECT COUNT(*) AS c FROM users WHERE org_id = ? AND role = 'teacher' AND is_active = 1`, [orgId]).c;
  const parents = get(`SELECT COUNT(*) AS c FROM users WHERE org_id = ? AND role = 'parent' AND is_active = 1`, [orgId]).c;
  const classes = get(`SELECT COUNT(*) AS c FROM classes WHERE org_id = ?`, [orgId]).c;
  const activeHomework = get(`SELECT COUNT(*) AS c FROM homework WHERE org_id = ? AND status = 'published' AND due_at >= ?`, [orgId, today]).c;
  const weekAgo = U.ymdPlus(-7);
  const hwRecent = get(`SELECT COUNT(*) AS c FROM homework WHERE org_id = ? AND assigned_at >= ?`, [orgId, weekAgo]).c;
  const subs = get(`SELECT COUNT(*) AS c FROM homework_submissions s JOIN homework h ON h.id = s.homework_id WHERE h.org_id = ? AND h.assigned_at >= ?`, [orgId, weekAgo]).c;
  const expected = all(`SELECT h.id, (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = h.class_id) AS n FROM homework h WHERE h.org_id = ? AND h.assigned_at >= ?`, [orgId, weekAgo])
    .reduce((sum, r) => sum + (r.n || 0), 0);
  const att = get(`SELECT COUNT(*) AS c FROM attendance WHERE org_id = ? AND date = ?`, [orgId, today]).c;
  const attPresent = get(`SELECT COUNT(*) AS c FROM attendance WHERE org_id = ? AND date = ? AND status IN ('present','late')`, [orgId, today]).c;
  const openReports = get(`SELECT COUNT(*) AS c FROM reports WHERE org_id = ? AND status = 'open'`, [orgId]).c;
  const perClass = all(
    `SELECT c.id, c.grade, c.section,
      (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS students,
      (SELECT COUNT(*) FROM homework_submissions s JOIN homework h ON h.id = s.homework_id WHERE h.class_id = c.id) AS submissions,
      (SELECT COUNT(*) FROM attendance a WHERE a.class_id = c.id AND a.date = ? AND a.status IN ('present','late')) AS present_today
     FROM classes c WHERE c.org_id = ? ORDER BY c.grade, c.section`, [today, orgId]
  );
  return {
    kind: 'admin',
    counts: { students, teachers, parents, classes, active_homework: activeHomework, open_reports: openReports },
    submission_rate: expected ? Math.round((subs / expected) * 100) : null,
    attendance_today: att ? Math.round((attPresent / att) * 100) : null,
    per_class: perClass
  };
}

function parentOverview(parentId) {
  const kids = A.studentIdsForParent(parentId);
  return {
    kind: 'parent',
    children: kids.map((kid) => {
      const o = studentOverview(kid, 'fa');
      const user = get('SELECT id, name_fa, name_ps, name_en, avatar FROM users WHERE id = ?', [kid]);
      return {
        ...user,
        pending: o.homework.pending.length,
        overdue: o.homework.overdue.length,
        returned: o.homework.returned.length,
        attendance_pct: o.attendance_pct,
        merit_total: o.merit_total,
        improvements_open: o.improvements.filter((i) => i.status === 'open').length,
        next_up: o.next_up
      };
    })
  };
}

router.get('/overview', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, view } = req.auth;
  const role = view.role; // when a parent views as a child, this is 'student'
  let data;
  if (role === 'student') data = studentOverview(view.id, q.str(req.query.lang, user.lang));
  else if (role === 'teacher') data = teacherOverview(view.id);
  else if (role === 'parent') data = parentOverview(user.id);
  else data = adminOverview(user.org_id);
  return ok(res, { overview: data, role });
}));

// --------------------------------------------------------------- classes ----
router.get('/classes', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, view } = req.auth;
  let rows;
  if (view.role === 'teacher') {
    const ids = A.classIdsForTeacher(view.id);
    rows = ids.length ? all(`SELECT * FROM classes WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY grade, section`, ids) : [];
  } else if (view.role === 'student') {
    rows = all(`SELECT c.* FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE e.student_id = ? ORDER BY c.grade`, [view.id]);
  } else if (user.role === 'parent') {
    const kids = A.studentIdsForParent(user.id);
    rows = kids.length
      ? all(`SELECT DISTINCT c.* FROM enrollments e JOIN classes c ON c.id = e.class_id WHERE e.student_id IN (${kids.map(() => '?').join(',')}) ORDER BY c.grade`, kids)
      : [];
  } else {
    rows = all(`SELECT * FROM classes WHERE org_id = ? ORDER BY grade, section`, [user.org_id]);
  }
  const withCounts = rows.map((c) => ({ ...c, students: get('SELECT COUNT(*) AS c FROM enrollments WHERE class_id = ?', [c.id]).c }));
  return ok(res, { classes: withCounts });
}));

router.post('/classes', wrap((req, res) => {
  if (!req.auth || !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const row = insert('classes', {
    id: U.id('cls'), org_id: req.auth.user.org_id, term_id: req.body.term_id || null,
    grade: q.int(req.body.grade, 1), section: q.str(req.body.section, 'الف'),
    name_fa: q.str(req.body.name_fa), name_ps: q.str(req.body.name_ps), name_en: q.str(req.body.name_en),
    room: q.str(req.body.room), capacity: q.int(req.body.capacity, 40), created_at: U.nowISO()
  });
  return ok(res, { class: row }, 201);
}));

router.get('/classes/:id/students', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const cls = get('SELECT * FROM classes WHERE id = ?', [req.params.id]);
  if (!cls || cls.org_id !== req.auth.user.org_id) return fail(res, 'not_found', 404);
  if (req.auth.view.role === 'teacher' && !A.classIdsForTeacher(req.auth.view.id).includes(cls.id)) return fail(res, 'forbidden', 403);
  const rows = all(
    `SELECT u.id, u.name_fa, u.name_ps, u.name_en, u.avatar, u.username, e.roll_no,
      (SELECT COUNT(*) FROM homework_submissions s JOIN homework h ON h.id = s.homework_id WHERE s.student_id = u.id) AS submissions,
      (SELECT COUNT(*) FROM attendance a WHERE a.student_id = u.id AND a.status='absent' AND a.date >= ?) AS absences
     FROM enrollments e JOIN users u ON u.id = e.student_id
     WHERE e.class_id = ? ORDER BY e.roll_no IS NULL, e.roll_no, u.name_fa`,
    [U.ymdPlus(-30), cls.id]
  );
  return ok(res, { class: cls, students: rows });
}));

router.post('/classes/:id/students', wrap((req, res) => {
  if (!req.auth || !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const ids = req.body.student_ids || [];
  ids.forEach((sid, i) => upsert('enrollments', { id: U.id('enr'), class_id: req.params.id, student_id: sid, roll_no: i + 1, created_at: U.nowISO() }, ['class_id', 'student_id']));
  return ok(res, { enrolled: ids.length });
}));

router.get('/subjects', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  return ok(res, { subjects: all('SELECT * FROM subjects WHERE org_id = ? ORDER BY name_fa', [req.auth.user.org_id]) });
}));

router.post('/subjects', wrap((req, res) => {
  if (!req.auth || !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const row = insert('subjects', {
    id: U.id('sub'), org_id: req.auth.user.org_id, code: q.str(req.body.code),
    name_fa: q.str(req.body.name), name_ps: q.str(req.body.name_ps, q.str(req.body.name)),
    name_en: q.str(req.body.name_en, q.str(req.body.name)),
    grade_min: req.body.grade_min ?? null, grade_max: req.body.grade_max ?? null,
    color: q.str(req.body.color, '#2563eb'), created_at: U.nowISO()
  });
  return ok(res, { subject: row }, 201);
}));

// -------------------------------------------------------------- homework ----
router.get('/homework', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, view } = req.auth;
  const status = q.str(req.query.status); // pending | submitted | graded | returned | all
  if (view.role === 'student') {
    const o = studentOverview(view.id, user.lang);
    let list = o.homework.all;
    if (status === 'pending') list = o.homework.pending;
    if (status === 'graded') list = o.homework.graded;
    if (status === 'returned') list = o.homework.returned;
    return ok(res, { homework: list });
  }
  if (view.role === 'teacher') {
    const rows = all(
      `SELECT h.*, c.grade, c.section, sub.name_fa AS subject_fa,
        (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = h.class_id) AS enrolled,
        (SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id) AS submissions,
        (SELECT COUNT(*) FROM homework_submissions s WHERE s.homework_id = h.id AND s.status IN ('graded','returned')) AS graded
       FROM homework h JOIN classes c ON c.id = h.class_id LEFT JOIN subjects sub ON sub.id = h.subject_id
       WHERE h.teacher_id = ? ORDER BY h.due_at DESC LIMIT 100`, [view.id]
    );
    return ok(res, { homework: rows });
  }
  if (user.role === 'parent') {
    const kids = A.studentIdsForParent(user.id);
    const out = [];
    kids.forEach((kid) => {
      studentOverview(kid, user.lang).homework.all.forEach((h) => out.push({ ...h, student_id: kid, student_name: get('SELECT name_fa FROM users WHERE id = ?', [kid])?.name_fa }));
    });
    out.sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
    return ok(res, { homework: out });
  }
  const rows = all(`SELECT h.*, c.grade, c.section, u.name_fa AS teacher_fa FROM homework h JOIN classes c ON c.id = h.class_id JOIN users u ON u.id = h.teacher_id WHERE h.org_id = ? ORDER BY h.due_at DESC LIMIT 100`, [user.org_id]);
  return ok(res, { homework: rows });
}));

router.get('/homework/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, view } = req.auth;
  const hw = get(`SELECT h.*, c.grade, c.section, sub.name_fa AS subject_fa, u.name_fa AS teacher_fa
    FROM homework h JOIN classes c ON c.id = h.class_id LEFT JOIN subjects sub ON sub.id = h.subject_id JOIN users u ON u.id = h.teacher_id
    WHERE h.id = ?`, [req.params.id]);
  if (!hw || hw.org_id !== user.org_id) return fail(res, 'not_found', 404);
  const attachments = all('SELECT id, name, mime, size FROM attachments WHERE ref_type = \'homework\' AND ref_id = ?', [hw.id]);
  const payload = { homework: hw, attachments };

  if (view.role === 'student') {
    payload.submission = get('SELECT * FROM homework_submissions WHERE homework_id = ? AND student_id = ?', [hw.id, view.id]);
    const allowed = A.classIdsForStudent(view.id).includes(hw.class_id);
    if (!allowed) return fail(res, 'forbidden', 403);
  } else if (view.role === 'teacher') {
    const students = all(
      `SELECT u.id, u.name_fa, u.name_ps, u.avatar, e.roll_no,
        s.id AS submission_id, s.status, s.score, s.feedback, s.submitted_at, s.is_late, s.text, s.attachments
       FROM enrollments e JOIN users u ON u.id = e.student_id
       LEFT JOIN homework_submissions s ON s.homework_id = ? AND s.student_id = u.id
       WHERE e.class_id = ? ORDER BY e.roll_no IS NULL, e.roll_no, u.name_fa`, [hw.id, hw.class_id]
    ).map((s) => ({ ...s, attachments: j(s.attachments, []) }));
    payload.submissions = students;
    payload.stats = {
      total: students.length,
      submitted: students.filter((s) => s.submission_id).length,
      graded: students.filter((s) => ['graded', 'returned'].includes(s.status)).length,
      missing: students.filter((s) => !s.submission_id).length
    };
  } else if (user.role === 'parent') {
    const kids = A.studentIdsForParent(user.id);
    payload.children = kids.map((kid) => ({
      student_id: kid,
      name: get('SELECT name_fa FROM users WHERE id = ?', [kid])?.name_fa,
      submission: get('SELECT * FROM homework_submissions WHERE homework_id = ? AND student_id = ?', [hw.id, kid])
    }));
  }
  return ok(res, payload);
}));

router.post('/homework', wrap((req, res) => {
  if (!req.auth || !STAFF.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const { user } = req.auth;
  const classIds = req.body.class_ids || (req.body.class_id ? [req.body.class_id] : []);
  if (!classIds.length) return fail(res, 'class_required');
  if (!req.body.title) return fail(res, 'title_required');
  const created = [];
  for (const classId of classIds) {
    const cls = get('SELECT * FROM classes WHERE id = ? AND org_id = ?', [classId, user.org_id]);
    if (!cls) continue;
    const row = insert('homework', {
      id: U.id('hw'), org_id: user.org_id, class_id: classId, subject_id: req.body.subject_id || null,
      teacher_id: req.body.teacher_id || user.id,
      title: typeof req.body.title === 'string' ? req.body.title : U.J.stringify(req.body.title),
      instructions: typeof req.body.instructions === 'string' ? req.body.instructions : U.J.stringify(req.body.instructions || {}),
      assigned_at: U.nowISO(),
      due_at: q.str(req.body.due_at, new Date(Date.now() + 3 * 86400000).toISOString()),
      max_points: q.int(req.body.max_points, 10),
      est_minutes: q.int(req.body.est_minutes, 30),
      difficulty: q.str(req.body.difficulty, 'medium'),
      allow_text: q.bool(req.body.allow_text, true) ? 1 : 0,
      allow_file: q.bool(req.body.allow_file, true) ? 1 : 0,
      allow_audio: q.bool(req.body.allow_audio, true) ? 1 : 0,
      requires_upload: q.bool(req.body.requires_upload) ? 1 : 0,
      ai_help: q.str(req.body.ai_help, 'explain'),
      status: q.str(req.body.status, 'published'),
      client_id: q.str(req.body.client_id) || null,
      created_at: U.nowISO()
    });
    (req.body.attachments || []).forEach((aid) => run('UPDATE attachments SET ref_type = ?, ref_id = ? WHERE id = ?', ['homework', row.id, aid]));
    created.push(row);
    if (row.status === 'published') {
      const students = all('SELECT student_id FROM enrollments WHERE class_id = ?', [classId]).map((r) => r.student_id);
      N.notifyParentsOf(students, {
        module: 'school', kind: 'homework_assigned',
        title: U.ltext('کار خانهٔ جدید', 'نوې کورنۍ دنده', 'New homework'),
        body: row.title,
        data: { homeworkId: row.id, classId }
      });
    }
  }
  logAction(req.auth, 'homework_created', 'homework', created[0]?.id, { classes: classIds.length });
  return ok(res, { homework: created }, 201);
}));

router.patch('/homework/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const hw = get('SELECT * FROM homework WHERE id = ?', [req.params.id]);
  if (!hw) return fail(res, 'not_found', 404);
  if (hw.teacher_id !== req.auth.user.id && !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const patch = {};
  ['title', 'instructions', 'due_at', 'max_points', 'est_minutes', 'difficulty', 'status', 'ai_help', 'subject_id'].forEach((f) => {
    if (req.body[f] !== undefined) patch[f] = (f === 'title' || f === 'instructions') && typeof req.body[f] !== 'string' ? U.J.stringify(req.body[f]) : req.body[f];
  });
  const row = update('homework', hw.id, patch);
  return ok(res, { homework: row });
}));

router.delete('/homework/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const hw = get('SELECT * FROM homework WHERE id = ?', [req.params.id]);
  if (!hw) return fail(res, 'not_found', 404);
  if (hw.teacher_id !== req.auth.user.id && !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  remove('homework', hw.id);
  return ok(res, { deleted: true });
}));

router.post('/homework/:id/submit', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, view } = req.auth;
  if (user.role !== 'student' && view.role !== 'student') return fail(res, 'only_students_submit', 403);
  if (user.role === 'parent' && view.role === 'student') return fail(res, 'parents_cannot_submit_homework', 403);
  const studentId = view.role === 'student' ? view.id : user.id;
  const hw = get('SELECT * FROM homework WHERE id = ?', [req.params.id]);
  if (!hw) return fail(res, 'not_found', 404);
  if (!A.classIdsForStudent(studentId).includes(hw.class_id)) return fail(res, 'forbidden', 403);
  const late = Date.now() > Date.parse(hw.due_at);
  const existing = get('SELECT * FROM homework_submissions WHERE homework_id = ? AND student_id = ?', [hw.id, studentId]);
  const attachments = req.body.attachments || [];
  attachments.forEach((aid) => run('UPDATE attachments SET ref_type = ?, ref_id = ? WHERE id = ?', ['submission', existing?.id || hw.id + ':' + studentId, aid]));
  const row = existing
    ? update('homework_submissions', existing.id, {
      text: req.body.text ?? existing.text,
      attachments: U.J.stringify([...(j(existing.attachments, []) || []), ...attachments]),
      submitted_at: U.nowISO(),
      is_late: late ? 1 : 0,
      attempts: (existing.attempts || 1) + 1,
      status: existing.status === 'returned' ? 'submitted' : (existing.score !== null ? existing.status : (late ? 'late' : 'submitted'))
    })
    : insert('homework_submissions', {
      id: U.id('sub'), homework_id: hw.id, student_id: studentId,
      text: req.body.text || null,
      attachments: U.J.stringify(attachments),
      status: late ? 'late' : 'submitted',
      submitted_at: U.nowISO(), is_late: late ? 1 : 0, attempts: 1,
      client_id: q.str(req.body.client_id) || null
    });
  // notify the teacher
  N.notify([hw.teacher_id], {
    module: 'school', kind: 'homework_submitted',
    title: U.ltext('تسلیمی جدید', 'نوې سپارنه', 'New submission'),
    body: U.ltext(
      `${get('SELECT name_fa FROM users WHERE id = ?', [studentId])?.name_fa} وظیفه را تسلیم داد.`,
      `${get('SELECT name_fa FROM users WHERE id = ?', [studentId])?.name_fa} دنده وسپارله.`,
      `${get('SELECT name_en FROM users WHERE id = ?', [studentId])?.name_en || 'A student'} submitted work.`
    ),
    data: { homeworkId: hw.id, studentId }
  });
  logAction(req.auth, 'homework_submitted', 'homework', hw.id, { late });
  return ok(res, { submission: row, late }, existing ? 200 : 201);
}));

router.post('/homework/:id/grade', wrap((req, res) => {
  if (!req.auth || !STAFF.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const hw = get('SELECT * FROM homework WHERE id = ?', [req.params.id]);
  if (!hw) return fail(res, 'not_found', 404);
  if (hw.teacher_id !== req.auth.user.id && !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const studentId = q.str(req.body.student_id);
  const sub = get('SELECT * FROM homework_submissions WHERE homework_id = ? AND student_id = ?', [hw.id, studentId]);
  if (!sub) return fail(res, 'no_submission', 404);
  const row = update('homework_submissions', sub.id, {
    score: req.body.score === undefined || req.body.score === null ? null : q.num(req.body.score),
    feedback: req.body.feedback ?? sub.feedback,
    rubric: req.body.rubric ? U.J.stringify(req.body.rubric) : sub.rubric,
    status: q.str(req.body.status, 'graded'),
    graded_by: req.auth.user.id,
    graded_at: U.nowISO()
  });
  N.notifyParentsOf([studentId], {
    module: 'school', kind: 'homework_graded',
    title: U.ltext('نمره و نظر معلم', 'د ښوونکي نمره او نظر', 'Marked by your teacher'),
    body: U.ltext(`${U.tr(hw.title, 'fa')} — ${row.score ?? '—'}/${hw.max_points}`, `${U.tr(hw.title, 'ps')} — ${row.score ?? '—'}/${hw.max_points}`, `${U.tr(hw.title, 'en')} — ${row.score ?? '—'}/${hw.max_points}`),
    data: { homeworkId: hw.id }
  });
  logAction(req.auth, 'homework_graded', 'homework', hw.id, { studentId, score: row.score });
  return ok(res, { submission: row });
}));

// ------------------------------------------------------------- timetable ----
router.get('/timetable', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, view } = req.auth;
  let classId = req.query.class_id;
  if (!classId && view.role === 'student' && !req.query.teacher_id) {
    classId = A.classIdsForStudent(view.id)[0];
  }
  let rows = [];
  if (req.query.teacher_id) {
    rows = all(
      `SELECT s.*, c.grade, c.section, sub.name_fa AS subject_fa, sub.color FROM timetable_slots s
       JOIN classes c ON c.id = s.class_id LEFT JOIN subjects sub ON sub.id = s.subject_id
       WHERE s.teacher_id = ? ORDER BY s.day, s.period`, [req.query.teacher_id]
    );
  } else if (classId) {
    rows = all(
      `SELECT s.*, sub.name_fa AS subject_fa, sub.color, u.name_fa AS teacher_fa FROM timetable_slots s
       LEFT JOIN subjects sub ON sub.id = s.subject_id LEFT JOIN users u ON u.id = s.teacher_id
       WHERE s.class_id = ? ORDER BY s.day, s.period`, [classId]
    );
  } else if (req.query.student_id) {
    const cid = A.classIdsForStudent(req.query.student_id)[0];
    if (cid) {
      rows = all(
        `SELECT s.*, sub.name_fa AS subject_fa, sub.color, u.name_fa AS teacher_fa FROM timetable_slots s
         LEFT JOIN subjects sub ON sub.id = s.subject_id LEFT JOIN users u ON u.id = s.teacher_id
         WHERE s.class_id = ? ORDER BY s.day, s.period`, [cid]
      );
      classId = cid;
    }
  }
  const classes = all('SELECT id, grade, section FROM classes WHERE org_id = ? ORDER BY grade, section', [user.org_id]);
  return ok(res, { slots: rows, class_id: classId || null, classes, week: U.weekRange() });
}));

router.post('/timetable', wrap((req, res) => {
  if (!req.auth || !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const classId = q.str(req.body.class_id);
  const cls = get('SELECT * FROM classes WHERE id = ? AND org_id = ?', [classId, req.auth.user.org_id]);
  if (!cls) return fail(res, 'class_not_found', 404);
  const replaceAll = q.bool(req.body.replace, true);
  if (replaceAll) run('DELETE FROM timetable_slots WHERE class_id = ?', [classId]);
  (req.body.slots || []).forEach((s) => {
    insert('timetable_slots', {
      id: U.id('tt'), class_id: classId, subject_id: s.subject_id || null, teacher_id: s.teacher_id || null,
      day: q.int(s.day), period: q.int(s.period), start_time: q.str(s.start_time, '08:00'), end_time: q.str(s.end_time, '08:45'),
      room: q.str(s.room), created_at: U.nowISO()
    });
  });
  logAction(req.auth, 'timetable_saved', 'class', classId, { slots: (req.body.slots || []).length });
  return ok(res, { saved: true });
}));

// ------------------------------------------------------------- attendance ---
router.get('/attendance', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const classId = q.str(req.query.class_id);
  const date = q.str(req.query.date, U.ymd());
  if (req.query.student_id) {
    if (!A.canViewStudent(req.auth, req.query.student_id)) return fail(res, 'forbidden', 403);
    const rows = all('SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 120', [req.query.student_id]);
    return ok(res, { records: rows, date });
  }
  if (!classId) return fail(res, 'class_required');
  const cls = get('SELECT * FROM classes WHERE id = ?', [classId]);
  if (!cls || cls.org_id !== req.auth.user.org_id) return fail(res, 'not_found', 404);
  const students = all(
    `SELECT u.id, u.name_fa, u.name_ps, u.avatar, e.roll_no,
      (SELECT a.status FROM attendance a WHERE a.class_id = ? AND a.student_id = u.id AND a.date = ?) AS status,
      (SELECT a.note FROM attendance a WHERE a.class_id = ? AND a.student_id = u.id AND a.date = ?) AS note
     FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.class_id = ? ORDER BY e.roll_no IS NULL, e.roll_no, u.name_fa`,
    [classId, date, classId, date, classId]
  );
  return ok(res, { class: cls, date, students });
}));

router.post('/attendance', wrap((req, res) => {
  if (!req.auth || !STAFF.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const classId = q.str(req.body.class_id);
  const date = q.str(req.body.date, U.ymd()).slice(0, 10);
  const entries = req.body.entries || [];
  const absent = [];
  for (const e of entries) {
    const status = q.str(e.status, 'present');
    upsert('attendance', {
      id: U.id('att'), org_id: req.auth.user.org_id, class_id: classId, student_id: e.student_id, date,
      status, note: q.str(e.note), recorded_by: req.auth.user.id, created_at: U.nowISO()
    }, ['class_id', 'student_id', 'date']);
    if (status === 'absent') absent.push(e.student_id);
  }
  if (absent.length) {
    N.notifyParentsOf(absent, {
      module: 'school', kind: 'absence', priority: 'high',
      title: U.ltext('غیرحاضری امروز', 'نن غیرحاضري', 'Absent today'),
      body: U.ltext('فرزند شما امروز در مکتب حاضر نبود.', 'ستاسو ماشوم نن په ښوونځي کې حاضر نه و.', 'Your child was marked absent today.'),
      data: { date, classId }
    });
  }
  logAction(req.auth, 'attendance_saved', 'class', classId, { date, count: entries.length, absent: absent.length });
  return ok(res, { saved: entries.length, absent: absent.length });
}));

router.post('/attendance/excuse', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user } = req.auth;
  if (user.role !== 'parent') return fail(res, 'only_parents', 403);
  const studentId = q.str(req.body.student_id);
  if (!A.studentIdsForParent(user.id).includes(studentId)) return fail(res, 'not_your_child', 403);
  const date = q.str(req.body.date, U.ymd()).slice(0, 10);
  const rec = get('SELECT * FROM attendance WHERE student_id = ? AND date = ?', [studentId, date]);
  if (!rec) return fail(res, 'no_record', 404);
  update('attendance', rec.id, { status: 'excused', note: `${rec.note || ''} | عذر والدین: ${q.str(req.body.note)}`.slice(0, 300) });
  const cls = all('SELECT teacher_id FROM teaching_assignments WHERE class_id = ?', [rec.class_id]).map((r) => r.teacher_id);
  N.notify(cls, {
    module: 'school', kind: 'absence_excuse',
    title: U.ltext('عذر غیرحاضری', 'د غیرحاضرۍ عذر', 'Absence excused'),
    body: U.ltext('والدین عذر فرستادند.', 'مور او پلار عذر راولېږه.', 'A parent submitted an excuse note.'),
    data: { studentId, date }
  });
  return ok(res, { excused: true });
}));

// --------------------------------------------------- points of improvement --
router.get('/improvement', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const studentId = q.str(req.query.student_id, req.auth.view.role === 'student' ? req.auth.view.id : '');
  if (!studentId) return fail(res, 'student_required');
  if (!A.canViewStudent(req.auth, studentId)) return fail(res, 'forbidden', 403);
  const rows = all(
    `SELECT i.*, sub.name_fa AS subject_fa, u.name_fa AS teacher_fa FROM improvement_points i
     LEFT JOIN subjects sub ON sub.id = i.subject_id LEFT JOIN users u ON u.id = i.teacher_id
     WHERE i.student_id = ? ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'improving' THEN 1 WHEN 'achieved' THEN 2 ELSE 3 END, i.created_at DESC`,
    [studentId]
  );
  if (req.auth.view.role === 'student' || req.auth.user.role === 'parent') {
    rows.forEach((r) => run('UPDATE improvement_points SET parent_seen = 1 WHERE id = ?', [r.id]));
  }
  return ok(res, { improvements: rows });
}));

router.post('/improvement', wrap((req, res) => {
  if (!req.auth || !STAFF.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  if (!req.body.student_id || !req.body.text) return fail(res, 'student_and_text_required');
  const row = insert('improvement_points', {
    id: U.id('imp'), org_id: req.auth.user.org_id, student_id: q.str(req.body.student_id),
    class_id: req.body.class_id || null, subject_id: req.body.subject_id || null, teacher_id: req.auth.user.id,
    category: q.str(req.body.category, 'focus'),
    text: U.J.stringify(req.body.text), goal: req.body.goal ? U.J.stringify(req.body.goal) : null,
    severity: q.str(req.body.severity, 'normal'), due_date: req.body.due_date || null,
    status: 'open', progress: q.int(req.body.progress, 0),
    created_at: U.nowISO(), updated_at: U.nowISO()
  });
  N.notifyParentsOf([row.student_id], {
    module: 'school', kind: 'improvement_point',
    title: U.ltext('نکتهٔ بهبود تازه', 'د ښه والي نوې نکته', 'New improvement point'),
    body: U.ltext('معلم یک نکته برای پیشرفت نوشته است.', 'ښوونکي د پرمختګ لپاره یوه نکته لیکلې ده.', 'A teacher wrote a new improvement point.'),
    data: { improvementId: row.id, studentId: row.student_id }
  });
  logAction(req.auth, 'improvement_created', 'improvement_point', row.id, { category: row.category });
  return ok(res, { improvement: row }, 201);
}));

router.patch('/improvement/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const row = get('SELECT * FROM improvement_points WHERE id = ?', [req.params.id]);
  if (!row) return fail(res, 'not_found', 404);
  const isOwner = row.teacher_id === req.auth.user.id;
  const isStudent = req.auth.view.id === row.student_id;
  if (!isOwner && !isStudent && !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const patch = { updated_at: U.nowISO() };
  if (isStudent) {
    if (req.body.progress !== undefined) patch.progress = U.clamp(q.int(req.body.progress, 0), 0, 100);
    if (req.body.status === 'achieved') patch.status = 'achieved';
  } else {
    ['status', 'category', 'severity', 'due_date', 'progress'].forEach((f) => { if (req.body[f] !== undefined) patch[f] = req.body[f]; });
    if (req.body.text) patch.text = U.J.stringify(req.body.text);
    if (req.body.goal) patch.goal = U.J.stringify(req.body.goal);
  }
  const updated = update('improvement_points', row.id, patch);
  if (isStudent) {
    N.notify([row.teacher_id], {
      module: 'school', kind: 'improvement_progress',
      title: U.ltext('پیشرفت شاگرد', 'د زده کوونکي پرمختګ', 'Student progress'),
      body: U.ltext('شاگرد روی نکتهٔ بهبود کار کرده است.', 'زده کوونکي د ښه والي پر نکته کار کړی دی.', 'A student worked on their improvement point.'),
      data: { improvementId: row.id }
    });
  }
  return ok(res, { improvement: updated });
}));

// ------------------------------------------------------- exams and grades ---
router.get('/exams', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const rows = all(
    `SELECT e.*, c.grade, c.section, sub.name_fa AS subject_fa FROM exams e
     JOIN classes c ON c.id = e.class_id LEFT JOIN subjects sub ON sub.id = e.subject_id
     WHERE e.org_id = ? ORDER BY e.date DESC LIMIT 60`, [req.auth.user.org_id]
  );
  return ok(res, { exams: rows });
}));

router.post('/exams', wrap((req, res) => {
  if (!req.auth || !STAFF.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const row = insert('exams', {
    id: U.id('exm'), org_id: req.auth.user.org_id, class_id: q.str(req.body.class_id), subject_id: req.body.subject_id || null,
    term_id: req.body.term_id || null, name: typeof req.body.name === 'string' ? req.body.name : U.J.stringify(req.body.name),
    date: q.str(req.body.date, U.ymd()), max_marks: q.int(req.body.max_marks, 100), pass_marks: q.int(req.body.pass_marks, 40),
    created_at: U.nowISO()
  });
  N.notifyAudience(req.auth.user.org_id, { classIds: [row.class_id] }, {
    module: 'school', kind: 'exam_scheduled', priority: 'high',
    title: U.ltext('امتحان جدید', 'نوې ازموینه', 'New exam scheduled'),
    body: row.name,
    data: { examId: row.id }
  });
  return ok(res, { exam: row }, 201);
}));

router.post('/exams/:id/results', wrap((req, res) => {
  if (!req.auth || !STAFF.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const exam = get('SELECT * FROM exams WHERE id = ?', [req.params.id]);
  if (!exam) return fail(res, 'not_found', 404);
  (req.body.results || []).forEach((r) => {
    upsert('exam_results', {
      id: U.id('res'), exam_id: exam.id, student_id: r.student_id, marks: q.num(r.marks, 0),
      remarks: q.str(r.remarks), created_at: U.nowISO()
    }, ['exam_id', 'student_id']);
  });
  N.notifyParentsOf((req.body.results || []).map((r) => r.student_id), {
    module: 'school', kind: 'exam_result',
    title: U.ltext('نتیجهٔ امتحان', 'د ازموینې پایله', 'Exam result published'),
    body: exam.name,
    data: { examId: exam.id }
  });
  return ok(res, { saved: (req.body.results || []).length });
}));

router.get('/grades/:studentId', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const studentId = req.params.studentId;
  if (!A.canViewStudent(req.auth, studentId)) return fail(res, 'forbidden', 403);
  const rows = all(
    `SELECT r.*, e.name AS exam_name, e.date, e.max_marks, e.pass_marks, sub.name_fa AS subject_fa
     FROM exam_results r JOIN exams e ON e.id = r.exam_id LEFT JOIN subjects sub ON sub.id = e.subject_id
     WHERE r.student_id = ? ORDER BY e.date DESC`, [studentId]
  );
  const bySubject = {};
  rows.forEach((r) => {
    const key = r.subject_fa || '—';
    bySubject[key] = bySubject[key] || { subject: key, marks: [], total: 0, count: 0 };
    bySubject[key].marks.push(r.marks);
    bySubject[key].total += r.marks;
    bySubject[key].count += 1;
  });
  const subjects = Object.values(bySubject).map((s) => ({
    subject: s.subject,
    average: Math.round(s.total / s.count),
    count: s.count,
    best: Math.max(...s.marks),
    latest: s.marks[0]
  }));
  return ok(res, { results: rows, by_subject: subjects, average: rows.length ? Math.round(rows.reduce((a, b) => a + b.marks, 0) / rows.length) : null });
}));

// ------------------------------------------------------------ merit points --
router.get('/merit/:studentId', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!A.canViewStudent(req.auth, req.params.studentId)) return fail(res, 'forbidden', 403);
  const rows = all(
    `SELECT m.*, u.name_fa AS teacher_fa FROM merit_points m LEFT JOIN users u ON u.id = m.teacher_id
     WHERE m.student_id = ? ORDER BY m.created_at DESC LIMIT 50`, [req.params.studentId]
  );
  const total = rows.reduce((a, b) => a + (b.kind === 'positive' ? b.points : -b.points), 0);
  return ok(res, { entries: rows, total });
}));

router.post('/merit', wrap((req, res) => {
  if (!req.auth || !STAFF.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const row = insert('merit_points', {
    id: U.id('mrt'), org_id: req.auth.user.org_id, student_id: q.str(req.body.student_id), teacher_id: req.auth.user.id,
    kind: q.str(req.body.kind, 'positive'), category: q.str(req.body.category, 'participation'),
    points: Math.abs(q.int(req.body.points, 1)), note: q.str(req.body.note), created_at: U.nowISO()
  });
  if (row.kind === 'positive') {
    N.notifyParentsOf([row.student_id], {
      module: 'school', kind: 'merit',
      title: U.ltext('تحسین!', 'آفرین!', 'Well done!'),
      body: U.ltext('معلم یک امتیاز مثبت ثبت کرد.', 'ښوونکي یوه مثبته نمره ثبت کړه.', 'A teacher awarded positive points.'),
      data: { studentId: row.student_id }
    });
  }
  return ok(res, { entry: row }, 201);
}));

// ------------------------------------------------------------------ tasks ---
router.get('/tasks', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const ownerId = q.str(req.query.owner_id, req.auth.view.id);
  if (ownerId !== req.auth.view.id && ownerId !== req.auth.user.id) return fail(res, 'forbidden', 403);
  return ok(res, { tasks: all('SELECT * FROM tasks WHERE owner_id = ? ORDER BY is_done, due_date IS NULL, due_date LIMIT 100', [ownerId]) });
}));

router.post('/tasks', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const row = insert('tasks', {
    id: U.id('tsk'), org_id: req.auth.user.org_id, owner_id: q.str(req.body.owner_id, req.auth.view.id),
    title: q.str(req.body.title), notes: q.str(req.body.notes), due_date: req.body.due_date || null,
    priority: q.str(req.body.priority, 'normal'), is_done: 0,
    ref_type: req.body.ref_type || null, ref_id: req.body.ref_id || null, created_at: U.nowISO()
  });
  return ok(res, { task: row }, 201);
}));

router.patch('/tasks/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const task = get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!task || (task.owner_id !== req.auth.view.id && task.owner_id !== req.auth.user.id)) return fail(res, 'forbidden', 403);
  const patch = {};
  ['title', 'notes', 'due_date', 'priority'].forEach((f) => { if (req.body[f] !== undefined) patch[f] = req.body[f]; });
  if (req.body.is_done !== undefined) { patch.is_done = q.bool(req.body.is_done) ? 1 : 0; patch.done_at = patch.is_done ? U.nowISO() : null; }
  return ok(res, { task: update('tasks', task.id, patch) });
}));

router.delete('/tasks/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const task = get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!task || task.owner_id !== req.auth.view.id) return fail(res, 'forbidden', 403);
  remove('tasks', task.id);
  return ok(res, { deleted: true });
}));

// ------------------------------------------------------------------- mood ---
router.post('/mood', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const studentId = req.auth.view.role === 'student' ? req.auth.view.id : q.str(req.body.student_id);
  if (!studentId) return fail(res, 'student_required');
  const mood = q.str(req.body.mood, 'ok');
  const flagged = ['sad', 'worried', 'sick'].includes(mood) ? 1 : 0;
  upsert('mood_checks', {
    id: U.id('mod'), student_id: studentId, date: U.ymd(), mood, note: q.str(req.body.note),
    is_flagged: flagged, created_at: U.nowISO()
  }, ['student_id', 'date']);
  if (flagged) {
    const counselors = all(`SELECT id FROM users WHERE org_id = ? AND role IN ('counselor','principal','admin')`, [req.auth.user.org_id]).map((r) => r.id);
    N.notify(counselors, {
      module: 'school', kind: 'wellbeing', priority: 'high',
      title: U.ltext('نیاز به توجه', 'پاملرنې ته اړتیا', 'Wellbeing check-in'),
      body: U.ltext('یک شاگرد امروز حالش خوب نیست.', 'یو زده کوونکی نن ښه نه دی.', 'A student reported feeling unwell today.'),
      data: { studentId }
    });
  }
  return ok(res, { saved: true, flagged: Boolean(flagged) });
}));

router.get('/mood', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!ADMIN.includes(req.auth.user.role) && req.auth.user.role !== 'counselor') return fail(res, 'forbidden', 403);
  return ok(res, { entries: all(`SELECT m.*, u.name_fa FROM mood_checks m JOIN users u ON u.id = m.student_id WHERE m.is_flagged = 1 ORDER BY m.date DESC LIMIT 50`) });
}));

// ---------------------------------------------------------------- reports ---
router.post('/reports', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!q.str(req.body.text)) return fail(res, 'text_required');
  const row = insert('reports', {
    id: U.id('rep'), org_id: req.auth.user.org_id, reporter_id: req.auth.user.id,
    category: q.str(req.body.category, 'other'), text: q.str(req.body.text),
    severity: q.str(req.body.severity, 'normal'), status: 'open', created_at: U.nowISO(), updated_at: U.nowISO()
  });
  const staff = all(`SELECT id FROM users WHERE org_id = ? AND role IN ('admin','principal','counselor')`, [req.auth.user.org_id]).map((r) => r.id);
  N.notify(staff, {
    module: 'school', kind: 'report', priority: row.severity === 'high' ? 'urgent' : 'high',
    title: U.ltext('گزارش تازه', 'نوی راپور', 'New report submitted'),
    body: U.ltext('یک گزارش جدید ثبت شد.', 'یو نوی راپور ثبت شو.', 'A new report was submitted.'),
    data: { reportId: row.id, category: row.category }
  });
  return ok(res, { report: row }, 201);
}));

router.get('/reports', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!['admin', 'principal', 'counselor'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  return ok(res, { reports: all(`SELECT r.*, u.name_fa AS reporter FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.org_id = ? ORDER BY r.created_at DESC LIMIT 50`, [req.auth.user.org_id]) });
}));

router.patch('/reports/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!['admin', 'principal', 'counselor'].includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const patch = { updated_at: U.nowISO(), handled_by: req.auth.user.id };
  if (req.body.status) patch.status = q.str(req.body.status);
  if (req.body.response) patch.response = q.str(req.body.response);
  return ok(res, { report: update('reports', req.params.id, patch) });
}));

// ---------------------------------------------------------------- library ---
router.get('/library', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const term = q.str(req.query.q).trim();
  const grade = q.int(req.query.grade, 0);
  let sql = 'SELECT * FROM library_books WHERE 1=1';
  const params = [];
  if (term) { sql += ' AND (title LIKE ? OR subject LIKE ?)'; params.push(`%${term}%`, `%${term}%`); }
  if (grade) { sql += ' AND (grade = ? OR grade IS NULL)'; params.push(grade); }
  sql += ' ORDER BY grade IS NULL, grade, title LIMIT 120';
  return ok(res, { books: all(sql, params) });
}));

router.post('/library', wrap((req, res) => {
  if (!req.auth || !STAFF.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const row = insert('library_books', {
    id: U.id('bk'), org_id: req.auth.user.org_id, title: q.str(req.body.title), grade: req.body.grade ?? null,
    subject: q.str(req.body.subject), language: q.str(req.body.language, 'fa'),
    source: q.str(req.body.source, 'staff'), url: q.str(req.body.url), local_file: req.body.local_file || null,
    cover: req.body.cover || null, created_at: U.nowISO()
  });
  return ok(res, { book: row }, 201);
}));

router.post('/reading-log', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const studentId = req.auth.view.role === 'student' ? req.auth.view.id : q.str(req.body.student_id);
  const row = insert('reading_logs', {
    id: U.id('rd'), student_id: studentId, book_id: req.body.book_id || null,
    minutes: q.int(req.body.minutes, 0), pages: q.int(req.body.pages, 0),
    date: q.str(req.body.date, U.ymd()), note: q.str(req.body.note), created_at: U.nowISO()
  });
  return ok(res, { entry: row }, 201);
}));

router.get('/reading-log', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const studentId = q.str(req.query.student_id, req.auth.view.id);
  if (!A.canViewStudent(req.auth, studentId)) return fail(res, 'forbidden', 403);
  const rows = all('SELECT r.*, b.title FROM reading_logs r LEFT JOIN library_books b ON b.id = r.book_id WHERE r.student_id = ? ORDER BY r.date DESC LIMIT 60', [studentId]);
  return ok(res, { entries: rows, total_minutes: rows.reduce((a, b) => a + b.minutes, 0) });
}));

// ---------------------------------------------------------------- quizzes ---
router.get('/quizzes', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const grade = q.int(req.query.grade, 0);
  const rows = grade
    ? all('SELECT id, title, subject_id, grade FROM quizzes WHERE grade = ? OR grade IS NULL ORDER BY title LIMIT 60', [grade])
    : all('SELECT id, title, subject_id, grade FROM quizzes ORDER BY grade, title LIMIT 60');
  return ok(res, { quizzes: rows });
}));

router.get('/quizzes/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const quiz = get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz) return fail(res, 'not_found', 404);
  const questions = j(quiz.questions, []);
  return ok(res, {
    quiz: { ...quiz, questions: questions.map((qq, i) => ({ index: i, q: qq.q, options: qq.options })) },
    attempts: all('SELECT score, total, completed_at FROM quiz_attempts WHERE quiz_id = ? AND student_id = ? ORDER BY completed_at DESC LIMIT 5', [quiz.id, req.auth.view.id])
  });
}));

router.post('/quizzes/:id/attempt', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const quiz = get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
  if (!quiz) return fail(res, 'not_found', 404);
  const questions = j(quiz.questions, []);
  const answers = req.body.answers || [];
  let score = 0;
  const review = questions.map((qq, i) => {
    const correct = answers[i] === qq.answer;
    if (correct) score += 1;
    return { index: i, correct, explanation: qq.explanation || null, your_answer: answers[i] ?? null, correct_answer: qq.answer };
  });
  insert('quiz_attempts', {
    id: U.id('qa'), quiz_id: quiz.id, student_id: req.auth.view.id, answers: U.J.stringify(answers),
    score, total: questions.length, completed_at: U.nowISO()
  });
  return ok(res, { score, total: questions.length, review });
}));

// --------------------------------------------------------------- meetings ---
router.get('/meetings', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const me = req.auth.user.id;
  const rows = all(
    `SELECT m.*, p.name_fa AS parent_fa, t.name_fa AS teacher_fa, s.name_fa AS student_fa
     FROM meeting_requests m LEFT JOIN users p ON p.id = m.parent_id LEFT JOIN users t ON t.id = m.teacher_id LEFT JOIN users s ON s.id = m.student_id
     WHERE m.parent_id = ? OR m.teacher_id = ? ORDER BY m.created_at DESC LIMIT 30`, [me, me]
  ).map((r) => ({ ...r, slots: j(r.slots, []) }));
  return ok(res, { meetings: rows });
}));

router.post('/meetings', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (req.auth.user.role !== 'parent') return fail(res, 'only_parents', 403);
  const row = insert('meeting_requests', {
    id: U.id('mee'), org_id: req.auth.user.org_id, parent_id: req.auth.user.id,
    teacher_id: q.str(req.body.teacher_id), student_id: q.str(req.body.student_id),
    reason: q.str(req.body.reason), slots: U.J.stringify(req.body.slots || []),
    status: 'pending', created_at: U.nowISO()
  });
  N.notify([row.teacher_id], {
    module: 'school', kind: 'meeting_request',
    title: U.ltext('درخواست ملاقات', 'د ملاقات غوښتنه', 'Meeting request'),
    body: U.ltext('یک والدین درخواست ملاقات فرستاده است.', 'یو مور/پلار د ملاقات غوښتنه کړې ده.', 'A parent requested a meeting.'),
    data: { meetingId: row.id }
  });
  return ok(res, { meeting: row }, 201);
}));

router.patch('/meetings/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const m = get('SELECT * FROM meeting_requests WHERE id = ?', [req.params.id]);
  if (!m) return fail(res, 'not_found', 404);
  if (m.teacher_id !== req.auth.user.id && !ADMIN.includes(req.auth.user.role)) return fail(res, 'forbidden', 403);
  const patch = {};
  if (req.body.status) patch.status = q.str(req.body.status);
  if (req.body.scheduled_at) patch.scheduled_at = q.str(req.body.scheduled_at);
  const row = update('meeting_requests', m.id, patch);
  N.notify([m.parent_id], {
    module: 'school', kind: 'meeting_update',
    title: U.ltext('به‌روزرسانی ملاقات', 'د ملاقات تازه والی', 'Meeting updated'),
    body: U.ltext(`وضعیت درخواست: ${row.status}`, `د غوښتنې حالت: ${row.status}`, `Request status: ${row.status}`),
    data: { meetingId: m.id }
  });
  return ok(res, { meeting: row });
}));

// ------------------------------------------------------------------ stats ---
router.get('/stats', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  if (!ADMIN.includes(req.auth.user.role) && req.auth.user.role !== 'teacher') return fail(res, 'forbidden', 403);
  return ok(res, { stats: adminOverview(req.auth.user.org_id) });
}));

module.exports = router;
