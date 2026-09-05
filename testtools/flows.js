/** End-to-end checks of the write flows (homework → grading → notifications → clinic). */
const BASE = process.env.BASE || 'http://localhost:4000';
let cookie = '';

async function call(method, path, body) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch (e) { data = { raw: await res.text() }; }
  return { status: res.status, data };
}
const login = (u) => call('POST', '/api/auth/login', { username: u, password: 'demo1234' });
const ok = (label, cond, extra = '') => console.log(`${cond ? '✓' : '✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`);

(async () => {
  // ---------------------------------------------------------- school flow --
  let r = await login('demo.teacher');
  ok('teacher login', r.data.ok);
  const teacherOrg = r.data.org.id;

  r = await call('POST', '/api/school/homework', {
    title: { fa: 'تست: تمرین جمع کسرها', ps: 'ټیسټ', en: 'Test: adding fractions' },
    instructions: { fa: 'پنج تمرین حل کنید', ps: '', en: 'Solve five exercises' },
    class_ids: [r.data && (await call('GET', '/api/school/classes')).data.classes[0].id],
    due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    max_points: 10
  });
  ok('teacher creates homework', r.status === 201 && r.data.homework.length === 1, r.data.error || '');
  const hwId = r.data.homework[0].id;

  r = await call('GET', '/api/school/homework/' + hwId);
  ok('homework detail + roster', r.data.stats && r.data.stats.total > 0, `students=${r.data.stats?.total}`);

  // student submits
  await login('demo.student5a1');
  r = await call('POST', `/api/school/homework/${hwId}/submit`, { text: 'جواب من این است', attachments: [] });
  ok('student submits homework', r.data.ok && r.data.submission, r.data.error || '');

  // parent cannot submit
  await login('demo.parent');
  const pid = (await call('GET', '/api/auth/me')).data.children[0].id;
  await call('POST', '/api/auth/switch-view', { userId: pid });
  r = await call('POST', `/api/school/homework/${hwId}/submit`, { text: 'x' });
  ok('parent blocked from submitting as child', r.status === 403, r.data.error);
  await call('POST', '/api/auth/clear-view', {});

  // teacher grades
  await login('demo.teacher');
  const sub = (await call('GET', '/api/school/homework/' + hwId)).data.submissions.find((s) => s.submission_id);
  r = await call('POST', `/api/school/homework/${hwId}/grade`, { student_id: sub.id, score: 9, feedback: 'آفرین!', status: 'graded' });
  ok('teacher grades submission', r.data.ok && r.data.submission.score === 9, r.data.error || '');

  // attendance with an absent student
  const cls = (await call('GET', '/api/school/classes')).data.classes[0].id;
  const date = new Date().toISOString().slice(0, 10);
  const roster = (await call('GET', `/api/school/attendance?class_id=${cls}&date=${date}`)).data.students;
  r = await call('POST', '/api/school/attendance', {
    class_id: cls, date,
    entries: roster.map((s, i) => ({ student_id: s.id, status: i === 0 ? 'absent' : 'present' }))
  });
  ok('attendance saved + parents notified', r.data.saved === roster.length && r.data.absent === 1, JSON.stringify(r.data));

  // parent sees the absence notification
  await login('demo.parent');
  const notes = (await call('GET', '/api/notifications?limit=30')).data.notifications;
  ok('parent receives absence notification', notes.some((n) => n.kind === 'absence'), notes.map((n) => n.kind).join(','));

  // improvement point
  await login('demo.teacher');
  r = await call('POST', '/api/school/improvement', {
    student_id: sub.id, category: 'focus',
    text: { fa: 'در کسرها تمرین بیشتر کند', ps: '', en: 'Needs more fraction practice' },
    goal: { fa: 'هر روز ۵ تمرین', ps: '', en: '5 exercises a day' }
  });
  ok('teacher writes improvement point', r.status === 201, r.data.error || '');

  // ------------------------------------------------------------- AI tutor --
  await login('demo.student5a1');
  r = await call('POST', '/api/ai/chat', { message: 'این مشق را برایم حل کن', lang: 'fa' });
  ok('tutor refuses to solve homework', r.data.meta?.guardrail === true, r.data.reply?.slice(0, 40));
  r = await call('POST', '/api/ai/chat', { message: 'چطور کسرها را جمع کنم؟', lang: 'fa' });
  ok('tutor explains the method', r.data.reply && r.data.reply.length > 80, r.data.reply?.slice(0, 40));
  r = await call('POST', '/api/ai/chat', { message: 'what does homework mean?', lang: 'en' });
  ok('tutor glossary (EN)', /homework/i.test(r.data.reply));
  await login('demo.patient');
  r = await call('POST', '/api/ai/chat', { message: 'زه تبه لرم څه وکړم؟', lang: 'ps' });
  ok('clinic assistant answers in Pashto', /اوبه|ډاکټر|کلینیک/.test(r.data.reply), r.data.reply?.slice(0, 50));
  r = await call('POST', '/api/ai/chat', { message: 'زما سينه درد کوي', lang: 'ps' });
  ok('clinic assistant flags danger signs', /کلینیک|روغتون|سملاسي/.test(r.data.reply), r.data.reply?.slice(0, 40));

  // ---------------------------------------------------------- clinic flow --
  await login('demo.reception');
  const patients = (await call('GET', '/api/clinic/patients')).data.patients;
  ok('reception lists patients', patients.length > 0, `${patients.length} patients`);
  r = await call('POST', '/api/clinic/queue', { patient_id: patients[9].id, priority: false });
  ok('reception issues queue token', (r.status === 201 || r.data.already) && r.data.token.token_no > 0, r.data.error || '');
  const tokenId = r.data.token.id;

  r = await call('POST', '/api/clinic/appointments', { patient_id: patients[2].id, date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), time_slot: '10:30', reason: 'معاینه' });
  ok('reception books appointment', r.status === 201, r.data.error || '');

  await login('demo.doctor');
  r = await call('PATCH', '/api/clinic/queue/' + tokenId, { status: 'called' });
  ok('doctor calls token', r.data.token.status === 'called', r.data.error || '');
  const enc = await call('POST', '/api/clinic/encounters', {
    patient_id: patients[9].id, complaints: 'تب و سردردی', diagnosis: 'زکام',
    vitals: { temp: '38.2', bp: '120/80' }, follow_up_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    plan: 'استراحت و مایعات'
  });
  ok('doctor records encounter', enc.status === 201, enc.data.error || '');
  r = await call('POST', '/api/clinic/prescriptions', {
    patient_id: patients[9].id, encounter_id: enc.data.encounter.id,
    items: [{ name: 'Paracetamol 500mg', medication_id: null, dose: '1 قرص', freq: '3x', days: 3, qty: 9 }]
  });
  ok('doctor writes prescription', r.status === 201, r.data.error || '');
  const rxId = r.data.prescription.id;

  await login('demo.pharmacist');
  const before = (await call('GET', '/api/clinic/medications')).data.medications.find((m) => m.name.startsWith('Paracetamol')).stock_qty;
  r = await call('POST', `/api/clinic/prescriptions/${rxId}/dispense`, { deduct_stock: true });
  const after = (await call('GET', '/api/clinic/medications')).data.medications.find((m) => m.name.startsWith('Paracetamol')).stock_qty;
  ok('pharmacist dispenses + stock drops', r.data.prescription.status === 'dispensed' && after === before - 9, `${before} → ${after}`);

  // patient sees their own record only
  await login('demo.patient');
  r = await call('GET', '/api/clinic/patients');
  ok('patient sees only linked records', r.data.patients.length <= 2, `${r.data.patients.length} records`);
  r = await call('GET', '/api/clinic/patients/' + patients[7].id);
  ok('patient blocked from another chart', r.status === 403, String(r.status));

  // reminders engine
  await login('demo.admin');
  r = await call('GET', '/api/school/overview');
  ok('admin overview renders', r.data.ok, Object.keys(r.data.overview || {}).join(','));
  console.log('\n=== flows complete ===');
})();
