'use strict';
/**
 * Seeds two complete demo organisations:
 *   • a school  (students, parents, teachers, homework, timetable, grades…)
 *   • a clinic  (patients, queue, encounters, pharmacy, vaccination…)
 * Every account uses the password: demo1234  (usernames start with "demo.")
 */
const fs = require('node:fs');
const path = require('node:path');
const { db, insert, run, get, all, DATA_DIR } = require('./db');
const U = require('./util');

const DEMO_PASS = 'demo1234';
function user(orgId, role, username, nameFa, namePs, nameEn, extra = {}) {
  const { hash, salt } = U.hashPassword(DEMO_PASS);
  return insert('users', {
    id: U.id('usr'), org_id: orgId, role, username,
    pass_hash: hash, pass_salt: salt,
    name_fa: nameFa, name_ps: namePs, name_en: nameEn,
    phone: `+937${Math.floor(10000000 + Math.random() * 89999999)}`,
    avatar: extra.avatar || ['user', 'graduation', 'graduation', 'userCog', 'userCog', 'userRound', 'user', 'stethoscope'][Math.floor(Math.random() * 8)],
    lang: 'fa', prefs: '{}', is_active: 1, created_at: U.nowISO(), ...extra
  });
}
const L = (fa, ps, en) => U.J.stringify({ fa, ps, en });

function seed() {
  if (get('SELECT 1 AS x FROM orgs LIMIT 1')) {
    console.log('[seed] data already present — skipping (run npm run reset to rebuild)');
    return;
  }
  db.exec('BEGIN');
  try {
    seedSchool();
    seedClinic();
    seedShared();
    db.exec('COMMIT');
    console.log('[seed] done');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[seed] failed', err);
    throw err;
  }
}

// ============================================================== SCHOOL ======
function seedSchool() {
  const org = insert('orgs', {
    id: U.id('org'), type: 'school',
    name_fa: 'لیسهٔ عالی نور', name_ps: 'د نور عالي لېسه', name_en: 'Noor High School',
    province: 'کابل', city: 'کابل', address: 'ناحیهٔ ۵، کارتهٔ سه', phone: '+93700000001',
    settings: U.J.stringify({ week_start: 'saturday', periods: 7, late_after_minutes: 15, parent_digest: 'weekly' }),
    created_at: U.nowISO()
  });
  const term = insert('terms', {
    id: U.id('trm'), org_id: org.id, name_fa: 'سال تحصیلی ۱۴۰۴', name_ps: '۱۴۰۴ زده کړیز کال', name_en: 'Academic year 1404',
    start_date: U.ymdPlus(-60), end_date: U.ymdPlus(240), is_active: 1, created_at: U.nowISO()
  });

  const SUBJECTS = [
    ['دری', 'دری', 'Dari', '#2563eb'],
    ['ریاضی', 'شپږیزه / ریاضي', 'Mathematics', '#dc2626'],
    ['پشتو', 'پښتو', 'Pashto', '#059669'],
    ['انگلیسی', 'انګلیسي', 'English', '#7c3aed'],
    ['علوم', 'ساینس', 'Science', '#0891b2'],
    ['اسلامیات', 'اسلامي زده کړې', 'Islamic Studies', '#16a34a'],
    ['تاریخ و جغرافیا', 'تاریخ او جغرافیه', 'History & Geography', '#d97706']
  ];
  const subjects = SUBJECTS.map(([fa, ps, en, color]) => insert('subjects', {
    id: U.id('sub'), org_id: org.id, code: en.slice(0, 3).toUpperCase(),
    name_fa: fa, name_ps: ps, name_en: en, grade_min: 1, grade_max: 12, color, created_at: U.nowISO()
  }));
  const [dari, math, pashto, english, science, islamic, history] = subjects;

  const CLASSES = [[5, 'الف'], [5, 'ب'], [6, 'الف'], [7, 'الف']];
  const classes = CLASSES.map(([grade, section]) => insert('classes', {
    id: U.id('cls'), org_id: org.id, term_id: term.id, grade, section,
    name_fa: `صنف ${grade} - ${section}`, name_ps: `${grade} ټولګی - ${section}`, name_en: `Grade ${grade} - ${section}`,
    room: `اتاق ${grade}${section}`, capacity: 35, created_at: U.nowISO()
  }));
  const [c5a, c5b, c6a, c7a] = classes;

  // ---- staff
  const admin = user(org.id, 'admin', 'demo.admin', 'مدیر سیستم', 'د سیستم مدیر', 'System Admin', { avatar: 'shield' });
  const principal = user(org.id, 'principal', 'demo.principal', 'مدیر مکتب: آقای نوری', 'د ښوونځي مدیر: نوري صاحب', 'Principal Nouri', { avatar: 'userCog' });
  const tMath = user(org.id, 'teacher', 'demo.teacher', 'استاد احمدی (ریاضی)', 'استاد احمدي (ریاضي)', 'Mr Ahmadi (Math)', { avatar: 'graduation' });
  const tDari = user(org.id, 'teacher', 'demo.teacher2', 'استاد رحیمی (دری)', 'استاد رحیمي (دری)', 'Ms Rahimi (Dari)', { avatar: 'graduation' });
  const tSci = user(org.id, 'teacher', 'demo.teacher3', 'استاد کریمی (علوم)', 'استاد کریمي (ساینس)', 'Mr Karimi (Science)', { avatar: 'flask' });
  const tEng = user(org.id, 'teacher', 'demo.teacher4', 'استاد صدیقی (انگلیسی)', 'استاد صدیقي (انګلیسي)', 'Ms Sediqi (English)', { avatar: 'graduation' });

  [[tMath.id, math.id, c5a.id], [tMath.id, math.id, c5b.id], [tMath.id, math.id, c6a.id],
   [tDari.id, dari.id, c5a.id], [tDari.id, pashto.id, c5b.id], [tDari.id, dari.id, c7a.id],
   [tSci.id, science.id, c5a.id], [tSci.id, science.id, c6a.id], [tSci.id, islamic.id, c5b.id],
   [tEng.id, english.id, c5a.id], [tEng.id, english.id, c6a.id], [tEng.id, english.id, c7a.id],
   [tDari.id, history.id, c6a.id]].forEach(([tid, sid, cid]) => insert('teaching_assignments', {
    id: U.id('tch'), class_id: cid, subject_id: sid, teacher_id: tid, term_id: term.id, created_at: U.nowISO()
  }));

  // ---- students + parents
  const STUDENTS = [
    ['احمد احمدی', 'احمد احمدي', 'Ahmad Ahmadi', c5a, 1],
    ['مریم حسینی', 'مریم حسیني', 'Maryam Hosseini', c5a, 2],
    ['فاطمه رضایی', 'فاطمه رضایي', 'Fatima Rezai', c5a, 3],
    ['علی محمدی', 'علي محمدي', 'Ali Mohammadi', c5a, 4],
    ['زهرا نوری', 'زهرا نوري', 'Zahra Nouri', c5a, 5],
    ['حسن کریمی', 'حسن کریمي', 'Hassan Karimi', c5b, 1],
    ['عمر صدیقی', 'عمر صدیقي', 'Omar Sediqi', c5b, 2],
    ['نسرین امیری', 'نسرین امیري', 'Nasrin Amiri', c5b, 3],
    ['یوسف احمدی', 'یوسف احمدي', 'Yousuf Ahmadi', c6a, 1],
    ['آمنه فاروقی', 'آمنه فاروقي', 'Amina Farooqi', c6a, 2],
    ['بلال رحمانی', 'بلال رحماني', 'Bilal Rahmani', c6a, 3],
    ['ثمینه ولی', 'ثمینه ولي', 'Samina Wali', c7a, 1]
  ];
  const students = STUDENTS.map(([fa, ps, en, cls, roll]) => {
    const s = user(org.id, 'student', `demo.student${cls.grade}${cls.section === 'الف' ? 'a' : 'b'}${roll}`, fa, ps, en, { avatar: 'graduation' });
    insert('enrollments', { id: U.id('enr'), class_id: cls.id, student_id: s.id, term_id: term.id, roll_no: roll, created_at: U.nowISO() });
    return { ...s, cls, roll };
  });

  const p1 = user(org.id, 'parent', 'demo.parent', 'والدین: آقای احمدی', 'مور او پلار: احمدي صاحب', 'Parent: Mr Ahmadi', { avatar: 'users' });
  const p2 = user(org.id, 'parent', 'demo.parent2', 'والدین: بی‌بی گل', 'مور او پلار: بي بي ګل', 'Parent: Bibi Gul', { avatar: 'userRound' });
  [[p1.id, 0], [p1.id, 4], [p1.id, 7], [p2.id, 1], [p2.id, 2], [p2.id, 5]].forEach(([pid, idx]) => {
    insert('guardians', { id: U.id('grd'), parent_id: pid, student_id: students[idx].id, relation: 'parent', can_message: 1, created_at: U.nowISO() });
  });

  // ---- timetable (Saturday..Thursday = days 0..5)
  const TIMES = [['08:00', '08:45'], ['08:45', '09:30'], ['09:30', '10:15'], ['10:45', '11:30'], ['11:30', '12:15'], ['12:15', '13:00']];
  const teacherForSubject = (sid) => ({
    [math.id]: tMath.id, [dari.id]: tDari.id, [science.id]: tSci.id, [english.id]: tEng.id,
    [pashto.id]: tDari.id, [islamic.id]: tSci.id, [history.id]: tDari.id
  }[sid] || tDari.id);
  classes.forEach((cls, ci) => {
    for (let day = 0; day <= 5; day++) {
      const pool = [dari.id, math.id, english.id, science.id, pashto.id, islamic.id, history.id];
      for (let p = 0; p < TIMES.length; p++) {
        const sid = pool[(day * 3 + p + ci * 2) % pool.length];
        insert('timetable_slots', {
          id: U.id('tt'), class_id: cls.id, subject_id: sid, teacher_id: teacherForSubject(sid),
          day, period: p + 1, start_time: TIMES[p][0], end_time: TIMES[p][1], room: cls.room, created_at: U.nowISO()
        });
      }
    }
  });

  // ---- homework (mix of overdue / due today / upcoming) --------------------
  const HW = [
    { cls: c5a, sub: math, teacher: tMath, title: ['تمرین‌های فصل ۳: کسرها', 'د ۳ فصل تمرینونه: کسرونه', 'Chapter 3 exercises: fractions'], due: -2, points: 10, mins: 30, diff: 'medium' },
    { cls: c5a, sub: dari, teacher: tDari, title: ['انشا: روز بارانی', 'انشا: باراني ورځ', 'Essay: a rainy day'], due: 0, points: 15, mins: 45, diff: 'easy' },
    { cls: c5a, sub: science, teacher: tSci, title: ['گزارش: چرخهٔ آب در افغانستان', 'راپور: په افغانستان کې د اوبو دوران', 'Report: the water cycle in Afghanistan'], due: 2, points: 20, mins: 60, diff: 'hard' },
    { cls: c5a, sub: english, teacher: tEng, title: ['Learn 20 new words + 5 sentences', '۲۰ نوي کلیمې او ۵ جملې زده کړئ', 'Learn 20 new words and write 5 sentences'], due: 3, points: 10, mins: 25, diff: 'easy' },
    { cls: c5b, sub: math, teacher: tMath, title: ['حل مسئله‌های ضرب و تقسیم', 'د ضرب او وېش مسئلې حل کړئ', 'Multiplication and division problems'], due: 1, points: 10, mins: 35, diff: 'medium' },
    { cls: c5b, sub: islamic, teacher: tSci, title: ['حفظ سورهٔ کوچک + معنی آن', 'د یوې کوچنۍ سورې حفظ او مانا', 'Memorise a short Surah and its meaning'], due: 4, points: 10, mins: 30, diff: 'easy' },
    { cls: c6a, sub: science, teacher: tSci, title: ['نمودار فتوسنتز را رسم کنید', 'د فوتوسنتېزس ډیاګرام وکاږئ', 'Draw the photosynthesis diagram'], due: -1, points: 15, mins: 40, diff: 'medium' },
    { cls: c6a, sub: english, teacher: tEng, title: ['Write about your family (10 lines)', 'د خپلې کورنۍ په اړه ۱۰ کرښې ولیکئ', 'Write about your family (10 lines)'], due: 5, points: 12, mins: 30, diff: 'easy' },
    { cls: c7a, sub: dari, teacher: tDari, title: ['خلاصهٔ درس ۵ در یک صفحه', 'د ۵ درس لنډیز په یوه مخ', 'Summarise lesson 5 on one page'], due: 2, points: 10, mins: 30, diff: 'medium' }
  ];
  const homeworkRows = HW.map((h) => insert('homework', {
    id: U.id('hw'), org_id: org.id, class_id: h.cls.id, subject_id: h.sub.id, teacher_id: h.teacher.id,
    title: L(h.title[0], h.title[1], h.title[2]),
    instructions: L(
      'کار را با خط خوانا انجام بدهید و نام و صنف خود را بنویسید. اگر بخش‌اش را نفهمیدید، از همیار درسی (زرین) بپرسید — او روش را یاد می‌دهد، جواب را نه.',
      'کار په روښانه لیک وکړئ او خپل نوم او ټولګی ولیکئ. که یوه برخه درته پوه نه شوه، له درسي ملګري (زرین) وپوښتئ — هغه طریقه درښیي، ځواب نه.',
      'Write neatly with your name and class. If you do not understand a part, ask the study tutor (Zareen) — she teaches the method, not the answer.'
    ),
    assigned_at: U.ymdPlus(h.due - 4) + 'T08:00:00.000Z',
    due_at: U.ymdPlus(h.due) + 'T12:00:00.000Z',
    max_points: h.points, est_minutes: h.mins, difficulty: h.diff,
    allow_text: 1, allow_file: 1, allow_audio: 1, requires_upload: 0,
    ai_help: 'explain', status: 'published', created_at: U.nowISO()
  }));

  // submissions: first student of each class submits some
  const SUBMIT = [
    [0, 0, 'submitted', null, null], [0, 1, 'submitted', 'متن انشا را نوشته‌ام.', 9], [0, 4, null, null, null],
    [1, 0, 'late', 'عذر می‌خواهم، دیر تسلیم دادم.', 13], [1, 1, 'submitted', null, null],
    [2, 2, 'submitted', 'نمودار را با مداد رنگه کشیدم.', 14], [2, 1, 'returned', 'لطفاً جمله‌ها را دوباره بنویسید.', null],
    [3, 3, 'submitted', null, null]
  ];
  SUBMIT.forEach(([hwIdx, stuIdx, status, text, score]) => {
    const hw = homeworkRows[hwIdx];
    const stu = students[stuIdx];
    if (!hw || !stu) return;
    insert('homework_submissions', {
      id: U.id('sub'), homework_id: hw.id, student_id: stu.id,
      text: text || null, attachments: '[]',
      status: status || 'submitted',
      submitted_at: U.ymdPlus(-1) + 'T09:00:00.000Z',
      is_late: status === 'late' ? 1 : 0, attempts: 1,
      score: score, feedback: score ? L('کار خوب بود، ادامه بدهید!', 'ښه کار و، همداسې دوام ورکړه!', 'Good work — keep it up!') : null,
      graded_by: score ? hw.teacher_id : null, graded_at: score ? U.nowISO() : null
    });
  });

  // ---- points of improvement ---------------------------------------------
  const IMPROVE = [
    [0, math.id, 'focus', 'در جمع و تفریق کسرها مخرج را یکی نمی‌کند؛ تمرین بیشتر لازم است.', 'د کسرونو په جمع/تفریق کې مخرجونه نه یو کوي؛ ډېر تمرین غواړي.', 'Does not make denominators equal when adding fractions — needs more practice.', 'هر روز ۵ تمرین کسر حل کند', 0],
    [0, dari.id, 'strength', 'انشای بسیار خلاقانه می‌نویسد و از مثال‌های واقعی استفاده می‌کند.', 'ډېره خلاقه انشا لیکي او ریښتیني مثالونه کاروي.', 'Writes very creative essays using real examples.', 'ادامه بدهد', 100],
    [0, english.id, 'focus', 'در جمع‌بندی جمله‌ها فعل را فراموش می‌کند.', 'په جملو کې فعل هېروي.', 'Forgets the verb when building sentences.', '۱۰ جمله تمرین', 30],
    [1, math.id, 'behavior', 'در صنف زودتر کار را تمام می‌کند اما دقت کم است.', 'په ټولګي کې ژر کار خلاصوي خو دقت يې کم دی.', 'Finishes fast but accuracy is low.', 'بازبینی پاسخ‌ها', 20],
    [2, science.id, 'strength', 'در کارهای عملی علوم بسیار فعال است.', 'د ساینس په عملي کارونو کې ډېره فعاله ده.', 'Very active in practical science work.', 'ادامه بدهد', 80],
    [4, math.id, 'attendance', 'در دو هفتهٔ گذشته سه روز غیرحاضر بوده است.', 'په تېرو دوو اونیو کې درې ورځې غیرحاضر و.', 'Missed three days in the last two weeks.', 'حضور منظم', 10],
    [7, english.id, 'focus', 'در تلفظ کلمات انگلیسی مشکل دارد.', 'د انګلیسي کلیمو په تلفظ کې ستونزه لري.', 'Struggles with English pronunciation.', 'روزانه ۱۰ دقیقه شنیدن', 40]
  ];
  IMPROVE.forEach(([idx, subId, cat, fa, ps, en, goal, progress]) => {
    const stu = students[idx];
    if (!stu) return;
    insert('improvement_points', {
      id: U.id('imp'), org_id: org.id, student_id: stu.id, class_id: stu.cls.id, subject_id: subId,
      teacher_id: tMath.id, category: cat, text: L(fa, ps, en), goal: L(goal, goal, goal),
      severity: cat === 'attendance' ? 'high' : 'normal',
      due_date: U.ymdPlus(14), status: progress >= 100 ? 'achieved' : (progress > 0 ? 'improving' : 'open'),
      progress, parent_seen: 0, created_at: U.nowISO(), updated_at: U.nowISO()
    });
  });

  // ---- attendance for the last 12 days ------------------------------------
  classes.forEach((cls) => {
    const roster = all('SELECT student_id FROM enrollments WHERE class_id = ?', [cls.id]);
    for (let d = 12; d >= 0; d--) {
      const date = U.ymdPlus(-d);
      if (U.afWeekday(date) === 6) continue; // Friday
      roster.forEach((r, i) => {
        const seed = (i + d) % 17;
        const status = seed === 3 ? 'absent' : (seed === 7 ? 'late' : 'present');
        insert('attendance', {
          id: U.id('att'), org_id: org.id, class_id: cls.id, student_id: r.student_id, date,
          status, note: status === 'absent' ? 'بدون اطلاع' : null, recorded_by: tMath.id, created_at: U.nowISO()
        });
      });
    }
  });

  // ---- exams + results ----------------------------------------------------
  const exam = insert('exams', {
    id: U.id('exm'), org_id: org.id, class_id: c5a.id, subject_id: math.id, term_id: term.id,
    name: L('امتحان میان‌ترم ریاضی', 'د ریاضي منځمهاله ازموینه', 'Math mid-term exam'),
    date: U.ymdPlus(-10), max_marks: 100, pass_marks: 40, created_at: U.nowISO()
  });
  const exam2 = insert('exams', {
    id: U.id('exm'), org_id: org.id, class_id: c5a.id, subject_id: dari.id, term_id: term.id,
    name: L('امتحان میان‌ترم دری', 'د دري منځمهاله ازموینه', 'Dari mid-term exam'),
    date: U.ymdPlus(-8), max_marks: 100, pass_marks: 40, created_at: U.nowISO()
  });
  all('SELECT student_id FROM enrollments WHERE class_id = ?', [c5a.id]).forEach((r, i) => {
    insert('exam_results', { id: U.id('res'), exam_id: exam.id, student_id: r.student_id, marks: 55 + ((i * 11) % 45), remarks: null, created_at: U.nowISO() });
    insert('exam_results', { id: U.id('res'), exam_id: exam2.id, student_id: r.student_id, marks: 60 + ((i * 7) % 40), remarks: null, created_at: U.nowISO() });
  });

  // ---- merit points -------------------------------------------------------
  [[0, 'positive', 'participation', 2, 'کمک به هم‌صنفی در درس ریاضی'],
   [0, 'positive', 'homework', 1, 'تسلیمی به‌موقع'],
   [1, 'positive', 'creativity', 3, 'بهترین انشای صنف'],
   [2, 'negative', 'discipline', 1, 'صحبت در وقت درس'],
   [4, 'positive', 'improvement', 5, 'پیشرفت چشمگیر در حفظ']].forEach(([idx, kind, cat, pts, note]) => {
    if (!students[idx]) return;
    insert('merit_points', { id: U.id('mrt'), org_id: org.id, student_id: students[idx].id, teacher_id: tDari.id, kind, category: cat, points: pts, note, created_at: U.ymdPlus(-3) + 'T10:00:00.000Z' });
  });
  insert('student_badges', { id: U.id('bdg'), student_id: students[0].id, code: 'first_submission', awarded_at: U.ymdPlus(-5), awarded_by: tMath.id });
  insert('student_badges', { id: U.id('bdg'), student_id: students[1].id, code: 'creative_writer', awarded_at: U.ymdPlus(-2), awarded_by: tDari.id });

  // ---- announcements ------------------------------------------------------
  const ANN = [
    ['org', 'normal', ['رخصتی‌های عید', 'د اختر رخصتۍ', 'Eid holidays'], ['مکتب از فردا به مدت پنج روز رخصت است. کارهای خانهٔ عقب‌مانده را تکمیل کنید.', 'ښوونځی له سبا د پنځو ورځو لپاره رخصت دی. پاتې کورنۍ دندې بشپړې کړئ.', 'School is closed for five days from tomorrow. Please finish any outstanding homework.']],
    ['org', 'high', ['هفتهٔ امتحانات', 'د ازموینو اونۍ', 'Exam week'], ['امتحانات میان‌ترم از هفتهٔ آینده آغاز می‌شود. جدول امتحانات به‌زودی اعلان می‌گردد.', 'منځمهاله ازموینې له راتلونکې اونۍ پیل کېږي. د ازموینو جدول ژر اعلانېږي.', 'Mid-term exams start next week. The exam schedule will be published shortly.']],
    ['org', 'normal', ['جلسهٔ والدین', 'د مور او پلار غونډه', 'Parent meeting'], ['جلسهٔ والدین روز پنجشنبه ساعت ۱۰ در تالار مکتب برگزار می‌شود.', 'د مور او پلار غونډه د پنجشنبې ورځ د سهار په ۱۰ بجو د ښوونځي په تالار کې ده.', 'The parent meeting will be held on Thursday at 10:00 in the school hall.']],
    ['org', 'normal', ['کتاب‌های جدید کتابخانه', 'د کتابتون نوي کتابونه', 'New library books'], ['کتاب‌های جدید وزارت معارف به کتابخانه اضافه شده است.', 'د پوهنې وزارت نوي کتابونه کتابتون ته ورزیات شول.', 'New Ministry of Education books have been added to the library.']]
  ];
  ANN.forEach(([scope, priority, title, body]) => insert('announcements', {
    id: U.id('ann'), org_id: org.id, module: 'school', scope, audience: '{}',
    title: L(title[0], title[1], title[2]), body: L(body[0], body[1], body[2]),
    priority, is_pinned: priority === 'high' ? 1 : 0,
    published_at: U.ymdPlus(-1) + 'T07:00:00.000Z', created_by: principal.id, created_at: U.nowISO()
  }));

  // ---- calendar (holidays & events) ---------------------------------------
  const EVENTS = [
    [U.ymdPlus(3), 'holiday', ['رخصتی عید', 'د اختر رخصتي', 'Eid holiday']],
    [U.ymdPlus(4), 'holiday', ['رخصتی عید', 'د اختر رخصتي', 'Eid holiday']],
    [U.ymdPlus(10), 'exam', ['آغاز امتحانات میان‌ترم', 'د منځمهاله ازموینو پیل', 'Mid-term exams begin']],
    [U.ymdPlus(25), 'event', ['جشن پایان ترم', 'د سمستر د پای جشن', 'End of term celebration']],
    [U.ymdPlus(60), 'vacation', ['رخصتی زمستانی', 'د ژمي رخصتي', 'Winter vacation']],
    [U.ymdPlus(-5), 'event', ['روز معلم', 'د ښوونکي ورځ', 'Teachers day']]
  ];
  EVENTS.forEach(([date, type, title]) => insert('calendar_events', {
    id: U.id('evt'), org_id: org.id, module: 'school', date, end_date: null, type,
    title: L(title[0], title[1], title[2]), body: null, audience: '{}', all_day: 1,
    created_by: principal.id, created_at: U.nowISO()
  }));

  // ---- personal tasks for the first student -------------------------------
  const s0 = students[0];
  [['کتاب علوم را بخوانم', U.ymdPlus(0), 1], ['تمرین‌های ریاضی را تمام کنم', U.ymdPlus(1), 0], ['واژه‌های انگلیسی را مرور کنم', U.ymdPlus(2), 0]].forEach(([title, due, done]) => insert('tasks', {
    id: U.id('tsk'), org_id: org.id, owner_id: s0.id, title, notes: '', due_date: due,
    priority: 'normal', is_done: done, created_at: U.nowISO(), done_at: done ? U.nowISO() : null
  }));

  // ---- mood + a sample report --------------------------------------------
  insert('mood_checks', { id: U.id('mod'), student_id: s0.id, date: U.ymd(), mood: 'ok', note: '', is_flagged: 0, created_at: U.nowISO() });
  insert('mood_checks', { id: U.id('mod'), student_id: students[4].id, date: U.ymd(), mood: 'tired', note: 'امروز خسته بودم', is_flagged: 0, created_at: U.nowISO() });
  insert('reports', {
    id: U.id('rep'), org_id: org.id, reporter_id: students[2].id, category: 'facility',
    text: 'شیر آب صنف خراب است.', severity: 'normal', status: 'open', created_at: U.nowISO(), updated_at: U.nowISO()
  });

  // ---- parent ↔ teacher conversation --------------------------------------
  const thread = insert('threads', {
    id: U.id('thr'), org_id: org.id, module: 'school', subject: 'پیشرفت احمد در ریاضی',
    participants: U.J.stringify([p1.id, tMath.id]), created_by: p1.id,
    created_at: U.ymdPlus(-2) + 'T09:00:00.000Z', last_message_at: U.ymdPlus(-1) + 'T09:00:00.000Z'
  });
  insert('messages', { id: U.id('msg'), thread_id: thread.id, sender_id: p1.id, body: 'سلام استاد! احمد در کسرها مشکل دارد، چه کمکی می‌توانم بکنم؟', attachments: '[]', created_at: U.ymdPlus(-2) + 'T09:00:00.000Z' });
  insert('messages', { id: U.id('msg'), thread_id: thread.id, sender_id: tMath.id, body: 'سلام! هر روز ۵ دقیقه با او تمرین کنید و از همیار درسی اپ استفاده کنید — روش را یاد می‌دهد.', attachments: '[]', created_at: U.ymdPlus(-1) + 'T09:00:00.000Z' });

  // ---- meeting request ----------------------------------------------------
  insert('meeting_requests', {
    id: U.id('mee'), org_id: org.id, parent_id: p1.id, teacher_id: tMath.id, student_id: students[0].id,
    reason: 'در مورد پیشرفت ریاضی صحبت کنیم', slots: U.J.stringify([U.ymdPlus(2) + ' 10:00', U.ymdPlus(3) + ' 11:00']),
    status: 'pending', created_at: U.nowISO()
  });

  // ---- notifications for the demo student & parent ------------------------
  const notify = (userId, kind, title, body, data = {}) => insert('notifications', {
    id: U.id('ntf'), org_id: org.id, user_id: userId, module: 'school', kind,
    title: U.J.stringify(title), body: U.J.stringify(body), data: U.J.stringify(data),
    priority: 'normal', created_at: U.nowISO()
  });
  notify(s0.id, 'homework_graded', { fa: 'نمره و نظر معلم', ps: 'د ښوونکي نمره', en: 'Marked by your teacher' }, { fa: 'انشای شما: ۱۳/۱۵', ps: 'ستاسو انشا: ۱۳/۱۵', en: 'Your essay: 13/15' }, { homeworkId: homeworkRows[1].id });
  notify(p1.id, 'improvement_point', { fa: 'نکتهٔ بهبود تازه', ps: 'د ښه والي نوې نکته', en: 'New improvement point' }, { fa: 'استاد برای احمد یک نکته نوشت.', ps: 'ښوونکي د احمد لپاره یوه نکته ولیکله.', en: 'A teacher wrote a note for Ahmad.' });
  notify(p1.id, 'absence', { fa: 'غیرحاضری', ps: 'غیرحاضري', en: 'Absence' }, { fa: 'زهرا دیروز حاضر نبود.', ps: 'زهرا پرون حاضره نه وه.', en: 'Zahra was absent yesterday.' });
  notify(tMath.id, 'homework_submitted', { fa: 'تسلیمی جدید', ps: 'نوې سپارنه', en: 'New submission' }, { fa: 'مریم وظیفه را تسلیم داد.', ps: 'مریم دنده وسپارله.', en: 'Maryam submitted work.' });
}

// ============================================================== CLINIC ======
function seedClinic() {
  const org = insert('orgs', {
    id: U.id('org'), type: 'clinic',
    name_fa: 'کلینیک صحت نور', name_ps: 'د نور روغتیا کلینیک', name_en: 'Noor Health Clinic',
    province: 'کابل', city: 'کابل', address: 'جادهٔ میدان هوایی', phone: '+93700000002',
    settings: U.J.stringify({ token_reset: 'daily', working_hours: '08:00-16:00', languages: ['fa', 'ps', 'en'] }),
    created_at: U.nowISO()
  });
  ['OPD / عمومی', 'اطفال / Pediatrics', 'نسایی ولادی / Maternity', 'لابراتوار / Lab', 'دواخانه / Pharmacy', 'واکسیناسیون / EPI']
    .forEach((name) => insert('departments', {
      id: U.id('dep'), org_id: org.id, name_fa: name.split(' / ')[0], name_ps: name.split(' / ')[0],
      name_en: name.split(' / ')[1] || name, code: name.slice(0, 2), created_at: U.nowISO()
    }));

  const cAdmin = user(org.id, 'clinic_admin', 'demo.clinic', 'مدیر کلینیک: داکتر صابر', 'د کلینیک مدیر: ډاکټر صابر', 'Clinic Manager Dr Saber', { avatar: 'shield' });
  const doc = user(org.id, 'doctor', 'demo.doctor', 'داکتر احسان‌الله', 'ډاکټر احسان الله', 'Dr Ehsanullah', { avatar: 'stethoscope' });
  const doc2 = user(org.id, 'doctor', 'demo.doctor2', 'داکتر شکیبا', 'ډاکټر شکیبا', 'Dr Shakiba', { avatar: 'stethoscope' });
  const nurse = user(org.id, 'nurse', 'demo.nurse', 'نرس فرشته', 'نرس فرشته', 'Nurse Freshta', { avatar: 'syringe' });
  const recep = user(org.id, 'receptionist', 'demo.reception', 'مسئول استقبال: آقای وحید', 'د استقبال مسئول: وحید صاحب', 'Receptionist Waheed', { avatar: 'reception' });
  const pharm = user(org.id, 'pharmacist', 'demo.pharmacist', 'دواساز: آقای طاهر', 'درمل جوړوونکی: طاهر صاحب', 'Pharmacist Tahir', { avatar: 'pill' });
  const lab = user(org.id, 'lab_tech', 'demo.lab', 'تخنیکر لابراتوار', 'د لابراتوار تخنیکر', 'Lab technician', { avatar: 'flask' });
  const patientUser = user(org.id, 'patient', 'demo.patient', 'مریض: بی‌بی مریم', 'ناروغ: بي بي مریم', 'Patient: Bibi Maryam', { avatar: 'userRound' });

  const PATIENTS = [
    ['مریم احمدی', 'مریم احمدي', 'female', '1988-04-12', 'O+', 'تب و سردردی', 1],
    ['عبدالله کریمی', 'عبدالله کریمي', 'male', '1975-09-01', 'A-', 'درد معده', 0],
    ['پلوشه حسینی', 'پلوشه حسیني', 'female', '2019-02-20', 'B+', 'معاینهٔ واکسین', 0],
    ['صابر نوری', 'صابر نوري', 'male', '1960-11-05', 'AB+', 'فشار خون', 0],
    ['گل‌مکی ولی', 'ګل مکۍ ولي', 'female', '1996-06-15', 'O-', 'مراقبت حاملگی', 1],
    ['احمد رضا', 'احمد رضا', 'male', '2015-03-03', 'A+', 'تب و سرفه', 0],
    ['زهرا صدیقی', 'زهرا صدیقي', 'female', '2001-12-25', 'B+', 'درد گلو', 0],
    ['خالد امیری', 'خالد امیري', 'male', '1983-07-19', 'O+', 'درد کمر', 0],
    ['نسیمه فاروقی', 'نسیمه فاروقي', 'female', '1992-01-30', 'A+', 'سردرد مزمن', 0],
    ['یاسین احمدزی', 'یاسین احمدزی', 'male', '2012-08-08', 'O+', 'زخم دست', 0]
  ];
  const patients = PATIENTS.map(([fa, ps, sex, dob, blood, reason, pregnant], i) => insert('patients', {
    id: U.id('pat'), org_id: org.id, mrn: `NHC-${String(i + 1).padStart(4, '0')}`,
    user_id: i === 0 ? patientUser.id : null, full_name: fa, guardian_name: i % 3 === 0 ? 'والد' : null,
    phone: `+937${Math.floor(10000000 + Math.random() * 89999999)}`, sex, dob, blood_group: blood,
    province: 'کابل', city: 'کابل', village: ['کارته سه', 'خیرخانه', 'پل خشتی'][i % 3],
    allergies: U.J.stringify(i === 1 ? ['Penicillin'] : []), conditions: U.J.stringify(i === 3 ? ['فشار خون'] : []),
    notes: reason, is_pregnant: pregnant ? 1 : 0, created_at: U.nowISO()
  }));
  insert('patient_guardians', { id: U.id('pg'), patient_id: patients[2].id, user_id: patientUser.id, relation: 'grandchild', created_at: U.nowISO() });

  // ---- today's queue -------------------------------------------------------
  const today = U.ymd();
  patients.slice(0, 8).forEach((p, i) => {
    const status = i === 0 ? 'in_consult' : i === 1 ? 'called' : i < 5 ? 'waiting' : 'done';
    insert('queue_tokens', {
      id: U.id('qtk'), org_id: org.id, patient_id: p.id, doctor_id: i % 2 === 0 ? doc.id : doc2.id,
      department: ['OPD / عمومی', 'اطفال / Pediatrics'][i % 2], date: today, token_no: i + 1,
      priority: i === 3 ? 1 : 0, status,
      issued_at: `${today}T0${7 + i}:${String(10 + i * 5).padStart(2, '0')}:00.000Z`,
      called_at: ['called', 'in_consult', 'done'].includes(status) ? `${today}T08:${String(10 + i * 6).padStart(2, '0')}:00.000Z` : null,
      done_at: status === 'done' ? `${today}T08:${String(30 + i * 6).padStart(2, '0')}:00.000Z` : null
    });
  });

  // ---- appointments --------------------------------------------------------
  [[0, doc.id, 0, '09:30'], [2, doc2.id, 0, '10:00'], [4, doc2.id, 0, '11:00'], [1, doc.id, 1, '09:00'], [3, doc.id, 2, '10:30'], [5, doc2.id, 3, '09:15']]
    .forEach(([pi, doctor, offset, slot]) => insert('appointments', {
      id: U.id('apt'), org_id: org.id, patient_id: patients[pi].id, doctor_id: doctor,
      department: 'OPD / عمومی', date: U.ymdPlus(offset), time_slot: slot,
      reason: 'معاینهٔ عمومی', status: offset === 0 ? 'booked' : 'booked', created_by: recep.id, created_at: U.nowISO()
    }));

  // ---- encounters + prescriptions + labs -----------------------------------
  const enc = insert('encounters', {
    id: U.id('enc'), org_id: org.id, patient_id: patients[0].id, doctor_id: doc.id, date: `${U.ymdPlus(-3)}T09:00:00.000Z`,
    complaints: 'تب برای دو روز و سردردی', history: 'هیچ بیماری مزمن', exam: 'تب ۳۸٫۵، گلو سرخ',
    diagnosis: 'سرماخوردگی / زکام', plan: 'استراحت، مایعات زیاد، پاراسیتامول در صورت تب',
    vitals: U.J.stringify({ temp: '38.5', bp: '110/70', pulse: '88', weight: '58' }),
    follow_up_date: U.ymdPlus(4), attachments: '[]', created_at: U.nowISO()
  });
  insert('prescriptions', {
    id: U.id('rx'), encounter_id: enc.id, org_id: org.id, patient_id: patients[0].id, doctor_id: doc.id,
    items: U.J.stringify([
      { name: 'Paracetamol 500mg', medication_id: null, dose: '1 قرص', freq: 'هر ۸ ساعت', days: 3, qty: 9, note: 'بعد از غذا' },
      { name: 'ORS', medication_id: null, dose: 'یک بسته در یک لیتر آب', freq: 'در صورت نیاز', days: 3, qty: 3, note: '' }
    ]),
    notes: 'اگر تب بیش از ۳ روز دوام کرد مراجعه کنید.', status: 'pending', created_at: U.nowISO()
  });
  insert('lab_orders', { id: U.id('lab'), encounter_id: enc.id, org_id: org.id, patient_id: patients[0].id, test_name: 'CBC', status: 'resulted', result: 'در حد نارمل', notes: '', ordered_by: doc.id, resulted_at: U.ymdPlus(-2), created_at: U.nowISO() });

  const enc2 = insert('encounters', {
    id: U.id('enc'), org_id: org.id, patient_id: patients[3].id, doctor_id: doc.id, date: `${U.ymdPlus(-1)}T10:00:00.000Z`,
    complaints: 'فشار خون بالا', history: 'فشار خون از ۵ سال', exam: 'BP 150/95',
    diagnosis: 'فشار خون (Hypertension)', plan: 'ادامهٔ دوا، کاهش نمک، مراجعه بعد از دو هفته',
    vitals: U.J.stringify({ bp: '150/95', pulse: '80', weight: '82' }),
    follow_up_date: U.ymdPlus(14), attachments: '[]', created_at: U.nowISO()
  });
  insert('prescriptions', {
    id: U.id('rx'), encounter_id: enc2.id, org_id: org.id, patient_id: patients[3].id, doctor_id: doc.id,
    items: U.J.stringify([{ name: 'Amlodipine 5mg', medication_id: null, dose: '1 قرص', freq: 'روزانه', days: 30, qty: 30, note: '' }]),
    notes: '', status: 'pending', created_at: U.nowISO()
  });

  // ---- pharmacy ------------------------------------------------------------
  const MEDS = [
    ['Paracetamol 500mg', 'پاراسیتامول', 'Tablet', '500mg', 480, 100, '2027-06-01'],
    ['Amoxicillin 250mg', 'اموکسی سیلین', 'Capsule', '250mg', 8, 60, '2026-11-01'],
    ['ORS', 'او آر اس', 'Powder', '20.5g', 220, 50, '2027-01-15'],
    ['Ibuprofen 400mg', 'ایبوپروفین', 'Tablet', '400mg', 145, 80, '2026-04-20'],
    ['Metronidazole 250mg', 'مترونیدازول', 'Tablet', '250mg', 90, 60, '2026-08-11'],
    ['Amlodipine 5mg', 'املودیپین', 'Tablet', '5mg', 260, 60, '2027-03-01'],
    ['Salbutamol inhaler', 'سالبوتامول', 'Inhaler', '100mcg', 14, 20, '2026-06-30'],
    ['Zinc sulphate', 'زینک سلفیت', 'Tablet', '20mg', 300, 60, '2027-09-01'],
    ['Cefixime 200mg', 'سیفکسیم', 'Capsule', '200mg', 40, 60, '2026-02-10'],
    ['Tetanus toxoid', 'تیتانوس واکسین', 'Injection', '0.5ml', 25, 30, '2026-05-01'],
    ['Folic acid', 'فولیک اسید', 'Tablet', '5mg', 180, 50, '2027-07-01'],
    ['Ferrous sulphate', 'آهن', 'Tablet', '200mg', 6, 50, '2026-09-15'],
    ['Dexamethasone', 'دیکسامیتازون', 'Injection', '4mg', 30, 20, '2026-03-05'],
    ['Normal saline 0.9%', 'نارمل سیلین', 'Infusion', '500ml', 45, 30, '2028-01-01'],
    ['Hydrocortisone ointment', 'هایډروکارټیزون', 'Ointment', '1%', 18, 15, '2026-12-01']
  ];
  const meds = MEDS.map(([name, nameFa, form, strength, qty, reorder, expiry]) => insert('medications', {
    id: U.id('med'), org_id: org.id, name, name_fa: nameFa, name_ps: nameFa, generic: name,
    form, strength, unit: 'unit', stock_qty: qty, reorder_level: reorder,
    batch_no: `B${Math.floor(1000 + Math.random() * 8999)}`, expiry_date: expiry,
    storage: 'جای خشک و خنک', created_at: U.nowISO(), updated_at: U.nowISO()
  }));
  meds.forEach((m) => insert('stock_movements', { id: U.id('stm'), org_id: org.id, medication_id: m.id, change_qty: m.stock_qty, reason: 'received', user_id: pharm.id, created_at: U.nowISO() }));

  // ---- vaccination card for the child patient ------------------------------
  const child = patients[2];
  [['BCG', 1, 0, U.ymdPlus(-1080), U.ymdPlus(-1080)],
   ['OPV / Polio', 1, 42, U.ymdPlus(-1038), U.ymdPlus(-1038)],
   ['Pentavalent', 1, 42, U.ymdPlus(-1038), U.ymdPlus(-1038)],
   ['Pentavalent', 2, 70, U.ymdPlus(-1010), null],
   ['Measles', 1, 270, U.ymdPlus(14), null],
   ['Measles', 2, 450, U.ymdPlus(194), null]].forEach(([vaccine, dose, days, due, given]) => insert('vaccinations', {
    id: U.id('vac'), patient_id: child.id, vaccine, dose_no: dose, due_date: due, given_date: given,
    batch_no: given ? 'V-221' : null, given_by: given ? nurse.id : null, note: '', created_at: U.nowISO()
  }));

  // ---- pregnancy -----------------------------------------------------------
  const lmp = U.ymdPlus(-120);
  insert('pregnancies', {
    id: U.id('prg'), patient_id: patients[4].id, lmp_date: lmp, edd: U.pregnancyFromLMP(lmp).edd,
    risk_flags: U.J.stringify([]), visits: U.J.stringify([{ date: U.ymdPlus(-30), note: 'معاینهٔ اول، نارمل' }]),
    created_at: U.nowISO()
  });

  // ---- clinic announcements + notifications --------------------------------
  insert('announcements', {
    id: U.id('ann'), org_id: org.id, module: 'clinic', scope: 'org', audience: '{}',
    title: L('کمپاین واکسین پولیو', 'د پولیو واکسین کمپاین', 'Polio vaccination campaign'),
    body: L('کمپاین واکسین پولیو از فردا در این کلینیک آغاز می‌شود. کودکان زیر ۵ سال را بیاورید.', 'د پولیو واکسین کمپاین له سبا په دې کلینیک کې پیل کېږي. تر ۵ کلن ماشومان راولئ.', 'The polio vaccination campaign starts tomorrow at this clinic. Bring children under 5.'),
    priority: 'high', is_pinned: 1, published_at: U.nowISO(), created_by: cAdmin.id, created_at: U.nowISO()
  });
  insert('calendar_events', {
    id: U.id('evt'), org_id: org.id, module: 'clinic', date: U.ymdPlus(1), type: 'event',
    title: L('کمپاین واکسین پولیو', 'د پولیو واکسین کمپاین', 'Polio campaign'),
    body: null, audience: '{}', all_day: 1, created_by: cAdmin.id, created_at: U.nowISO()
  });
  insert('notifications', {
    id: U.id('ntf'), org_id: org.id, user_id: patientUser.id, module: 'clinic', kind: 'appointment_reminder',
    title: U.J.stringify({ fa: 'یادآوری ملاقات', ps: 'د ملاقات یاداښت', en: 'Appointment reminder' }),
    body: U.J.stringify({ fa: 'ملاقات شما امروز ساعت ۰۹:۳۰ است.', ps: 'ستاسو ملاقات نن د سهار ۰۹:۳۰ دی.', en: 'Your appointment is today at 09:30.' }),
    data: '{}', priority: 'high', created_at: U.nowISO()
  });
}

// =============================================== SHARED (library/quizzes) ====
function seedShared() {
  // library from books.json (Ministry of Education links already in the repo)
  try {
    const booksFile = path.join(__dirname, '..', 'books.json');
    if (fs.existsSync(booksFile)) {
      const data = JSON.parse(fs.readFileSync(booksFile, 'utf8'));
      (data.books || []).forEach((b) => insert('library_books', {
        id: U.id('bk'), org_id: null, title: b.title, grade: b.grade ?? null, subject: b.subject || null,
        language: b.language || 'fa', source: b.source || 'MOE', url: b.url || null, local_file: null, cover: null, created_at: U.nowISO()
      }));
    }
  } catch (err) { console.warn('[seed] books skipped', err.message); }

  try {
    const quizzesFile = path.join(__dirname, '..', 'quizzes.json');
    if (fs.existsSync(quizzesFile)) {
      const data = JSON.parse(fs.readFileSync(quizzesFile, 'utf8'));
      (data.quizzes || []).forEach((q) => insert('quizzes', {
        id: U.id('qz'), org_id: null, subject_id: null, grade: q.grade ?? null,
        title: q.title, questions: U.J.stringify(q.questions || []), created_at: U.nowISO()
      }));
    }
  } catch (err) { console.warn('[seed] quizzes skipped', err.message); }

  // extra quizzes so every grade has practice material
  [
    [5, 'ریاضی — جمع و تفریق', [{ q: '۲۵ + ۱۷ چند می‌شود؟', options: ['۳۲', '۴۲', '۳۵', '۴۰'], answer: 1, explanation: '۲۵ + ۱۷ = ۴۲' }, { q: '۱۰۰ − ۳۸ چند می‌شود؟', options: ['۷۲', '۶۲', '۵۲', '۶۸'], answer: 1, explanation: '۱۰۰ − ۳۸ = ۶۲' }]],
    [6, 'علوم — بدن انسان', [{ q: 'کدام عضو خون را تصفیه می‌کند؟', options: ['معده', 'گرده‌ها', 'شش‌ها', 'مغز'], answer: 1, explanation: 'گرده‌ها خون را تصفیه می‌کنند.' }]],
    [7, 'English — Present simple', [{ q: 'She ___ to school every day.', options: ['go', 'goes', 'going', 'gone'], answer: 1, explanation: 'Third person singular takes -s: she goes.' }]]
  ].forEach(([grade, title, questions]) => insert('quizzes', {
    id: U.id('qz'), org_id: null, subject_id: null, grade, title, questions: U.J.stringify(questions), created_at: U.nowISO()
  }));
}

// ------------------------------------------------------------------ run -----
if (require.main === module) {
  const { migrate } = require('./db');
  migrate();
  if (process.argv.includes('--reset')) {
    console.log('[seed] clearing', DATA_DIR);
    run('DELETE FROM notifications'); run('DELETE FROM audit_logs');
    ['queue_tokens', 'encounters', 'prescriptions', 'lab_orders', 'vaccinations', 'pregnancies', 'stock_movements', 'medications', 'patients',
     'homework_submissions', 'homework', 'improvement_points', 'attendance', 'exam_results', 'exams', 'merit_points', 'mood_checks',
     'reports', 'meeting_requests', 'messages', 'threads', 'timetable_slots', 'teaching_assignments', 'enrollments',
     'guardians', 'patient_guardians', 'calendar_events', 'announcements', 'classes', 'subjects', 'terms',
     'ai_messages', 'ai_conversations', 'sessions', 'users', 'orgs', 'library_books', 'quizzes'].forEach((t) => {
      try { run(`DELETE FROM ${t}`); } catch (e) { /* table may not exist */ }
    });
  }
  seed();
  const counts = {
    orgs: get('SELECT COUNT(*) AS c FROM orgs').c,
    users: get('SELECT COUNT(*) AS c FROM users').c,
    homework: get('SELECT COUNT(*) AS c FROM homework').c,
    patients: get('SELECT COUNT(*) AS c FROM patients').c,
    medications: get('SELECT COUNT(*) AS c FROM medications').c
  };
  console.log('[seed]', counts);
}

module.exports = seed;
