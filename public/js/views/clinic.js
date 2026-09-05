/* ===========================================================================
   Clinic / hospital module — queue, patients, pharmacy, appointments
   =========================================================================== */
(function (global) {
  const { h, esc, qs, qsa, toast, modal, closeModal, confirmDialog, fmt, chip, empty, bar, stat, skeleton } = UI;
  const VIEWS = (global.VIEWS = global.VIEWS || {});
  const STAFF = ['clinic_admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_tech'];
  const CLINICAL = ['doctor', 'nurse', 'clinic_admin'];
  const isStaff = () => STAFF.includes(APP.session.user.role);
  const STATUS_CHIP = { waiting: 'warn', called: 'info', in_consult: 'info', done: 'ok', skipped: 'danger' };

  // ================================================================== home ==
  VIEWS.home_clinic = {
    id: 'home_clinic', icon: '🏥', label: () => t('home'), roles: STAFF.concat(['patient']),
    async render() {
      const { overview } = await API.get('/api/clinic/overview');
      const role = APP.session.user.role;
      const today = fmt.todayISO();

      if (role === 'patient') {
        const p = (overview.patients || [])[0];
        if (!p) return `<div class="card">${empty('🏥', t('no_results'))}</div>`;
        return `
        <div class="card accent">
          <h2 style="margin:0">${esc(t('hello'))}، ${esc(p.full_name)}</h2>
          <div class="tiny">${esc(p.mrn)} · ${esc(fmt.date(today))}</div>
        </div>
        ${p.today_token ? `<div class="card accent">
          <div class="spread">
            <div><div class="tiny muted">${esc(t('my_token'))}</div>
              <div style="font-size:2.6rem;font-weight:900;color:var(--brand)">${esc(p.today_token.token_no)}</div>
              <div class="small">${esc(t(p.today_token.status))} · ${p.people_ahead} ${esc(t('people_ahead'))}</div></div>
            <span style="font-size:44px">🎫</span>
          </div>
        </div>` : ''}
        ${p.next_appointment ? `<div class="card tight">
          <div class="spread"><strong class="small">📅 ${esc(t('appointments'))}</strong>
            ${chip(fmt.date(p.next_appointment.date), 'info')}</div>
          <div class="small">${esc(p.next_appointment.time_slot || '')} · ${esc(p.next_appointment.reason || '')}</div>
        </div>` : ''}
        <div class="grid2">
          <a class="btn block" href="#/patients/${esc(p.id)}">🗂 ${esc(t('card'))}</a>
          <a class="btn secondary block" href="#/pharmacy">💊 ${esc(t('prescription'))}</a>
          <a class="btn secondary block" href="#/appointments">📅 ${esc(t('appointments'))}</a>
          <a class="btn secondary block" href="#/tutor">🤖 ${esc(t('health_assistant'))}</a>
        </div>
        <div class="notice info">${esc(t('emergency_note'))}</div>`;
      }

      if (role === 'pharmacist' || role === 'clinic_admin') {
        return `
        <div class="grid3">
          ${stat((overview.low_stock || []).length, t('low_stock'))}
          ${stat((overview.expiring || []).length, t('expiring'))}
          ${stat((overview.pending_prescriptions || []).length, t('prescription'))}
        </div>
        ${(overview.pending_prescriptions || []).length ? `<div class="section-title">${esc(t('prescription'))}</div>
          ${overview.pending_prescriptions.map((r) => `<div class="card tight">
            <div class="spread"><strong class="small">${esc(r.full_name)}</strong>
              <button class="btn sm" data-dispense="${esc(r.id)}">${esc(t('dispense'))}</button></div>
            <div class="tiny muted">${(r.items || []).map((i) => esc(i.name)).join('، ')}</div>
          </div>`).join('')}` : ''}
        <a class="btn block" href="#/pharmacy">💊 ${esc(t('pharmacy'))}</a>`;
      }

      if (role === 'doctor') {
        return `
        <div class="card accent">
          <h2 style="margin:0">${esc(t('hello'))}، ${esc(APP.session.user.name_fa || '')}</h2>
          <div class="tiny">${esc(fmt.weekday(today))} · ${esc(fmt.date(today))}</div>
          <div class="grid3" style="margin-top:10px">
            ${stat(overview.waiting ?? (overview.my_queue || []).length, t('waiting'))}
            ${stat((overview.appointments_today || []).length, t('appointments'))}
            ${stat((overview.follow_ups || []).length, t('follow_up'))}
          </div>
        </div>
        <div class="section-title">${esc(t('queue'))}<a href="#/queue">${esc(t('view_all'))}</a></div>
        ${(overview.my_queue || []).length ? overview.my_queue.map((q2) => `
          <div class="token-card" style="margin-bottom:8px">
            <div class="token-no">${esc(q2.token_no)}</div>
            <div class="grow"><strong class="small">${esc(q2.full_name)}</strong>
              <div class="tiny muted">${esc(q2.mrn || '')} ${q2.priority ? '· ⚡' : ''}</div></div>
            ${chip(t(q2.status) || q2.status, STATUS_CHIP[q2.status] || 'grey')}
            ${q2.status === 'waiting' ? `<button class="btn sm" data-call="${esc(q2.id)}">${esc(t('called'))}</button>` : ''}
            <a class="btn sm secondary" href="#/patients/${esc(q2.patient_id)}">${esc(t('examination'))}</a>
          </div>`).join('') : `<div class="card">${empty('🎫', t('no_results'))}</div>`}
        ${(overview.follow_ups || []).length ? `<div class="section-title">${esc(t('follow_up'))}</div>
          ${overview.follow_ups.map((f) => `<div class="card tight">
            <div class="spread"><strong class="small">${esc(f.full_name)}</strong>${chip(fmt.date(f.follow_up_date), 'warn')}</div>
            <div class="tiny muted">${esc(f.diagnosis || '')}</div>
          </div>`).join('')}` : ''}`;
      }

      // reception / nurse / lab
      const st = overview.stats || {};
      return `
      <div class="card accent">
        <h2 style="margin:0">${esc(t('clinic'))}</h2>
        <div class="tiny">${esc(fmt.weekday(today))} · ${esc(fmt.date(today))}</div>
        <div class="grid3" style="margin-top:10px">
          ${stat(st.issued ?? 0, t('queue'))}
          ${stat(st.waiting ?? 0, t('waiting'))}
          ${stat(st.done ?? 0, t('done'))}
        </div>
      </div>
      <div class="grid2">
        <a class="btn block" href="#/queue">🎫 ${esc(t('queue'))}</a>
        <a class="btn secondary block" href="#/patients">🗂 ${esc(t('patients'))}</a>
        <a class="btn secondary block" href="#/appointments">📅 ${esc(t('appointments'))}</a>
        <a class="btn secondary block" href="#/board">🖥 ${esc(t('board'))}</a>
      </div>
      <div class="section-title">${esc(t('queue'))}</div>
      ${(overview.queue || []).slice(0, 6).map((q2) => `
        <div class="token-card" style="margin-bottom:8px">
          <div class="token-no">${esc(q2.token_no)}</div>
          <div class="grow"><strong class="small">${esc(q2.full_name)}</strong>
            <div class="tiny muted">${esc(q2.doctor_fa || '')} ${q2.priority ? '· ⚡' : ''}</div></div>
          ${chip(t(q2.status) || q2.status, STATUS_CHIP[q2.status] || 'grey')}
        </div>`).join('') || `<div class="card">${empty('🎫', t('no_results'))}</div>`}`;
    },
    mount(root) {
      qsa('[data-call]', root).forEach((b) => b.onclick = async () => {
        await API.patch('/api/clinic/queue/' + b.dataset.call, { status: 'called' });
        toast(t('called'), 'ok'); APP.render();
      });
      qsa('[data-dispense]', root).forEach((b) => b.onclick = () => VIEWS.pharmacy.dispense(b.dataset.dispense));
    }
  };

  // ================================================================= queue ==
  VIEWS.queue = {
    id: 'queue', icon: '🎫', label: () => t('queue'), roles: STAFF,
    async render(ctx) {
      const date = ctx.query.date || fmt.todayISO();
      const data = await API.get('/api/clinic/queue?date=' + date);
      const { patients } = await API.get('/api/clinic/patients');
      const { users } = await API.get('/api/users');
      const doctors = users.filter((u) => u.role === 'doctor');
      return `
      <div class="card tight">
        <div class="row"><input type="date" id="queueDate" value="${esc(date)}" style="flex:1"/>
          <a class="btn sm secondary" href="#/board">🖥 ${esc(t('board'))}</a></div>
        <div class="grid3" style="margin-top:8px">
          ${stat(data.stats.waiting, t('waiting'))}
          ${stat(data.stats.in_consult, t('in_consult'))}
          ${stat(data.stats.done, t('done'))}
        </div>
      </div>
      <div class="card tight">
        <h3>${esc(t('issue_token'))}</h3>
        <select id="qPatient">${patients.map((p) => `<option value="${esc(p.id)}">${esc(p.full_name)} · ${esc(p.mrn)}</option>`).join('')}</select>
        <div class="row" style="margin-top:8px">
          <select id="qDoctor" style="flex:1"><option value="">—</option>${doctors.map((d) => `<option value="${esc(d.id)}">${esc(d.name_fa || d.username)}</option>`).join('')}</select>
          <label class="chip outline"><input type="checkbox" id="qPriority" style="margin-inline-end:6px"/>⚡ ${esc(t('high'))}</label>
        </div>
        <button class="btn block" id="qIssue" style="margin-top:8px">＋ ${esc(t('issue_token'))}</button>
      </div>
      <div class="section-title">${esc(t('queue'))}</div>
      ${data.queue.length ? data.queue.map((q2) => `
        <div class="token-card" style="margin-bottom:8px">
          <div class="token-no">${esc(q2.token_no)}</div>
          <div class="grow"><strong class="small">${esc(q2.full_name)}</strong>
            <div class="tiny muted">${esc(q2.mrn)} · ${esc(q2.doctor_fa || '')} ${q2.priority ? '· ⚡' : ''}</div>
            <div class="tiny muted">${esc(t('issued_at') || '')} ${esc(fmt.ago(q2.issued_at))}</div></div>
          <div class="stack" style="align-items:stretch;gap:4px">
            ${chip(t(q2.status) || q2.status, STATUS_CHIP[q2.status] || 'grey')}
            ${q2.status === 'waiting' ? `<button class="btn sm" data-qcall="${esc(q2.id)}">📢</button>` : ''}
            ${['called', 'in_consult'].includes(q2.status) ? `<button class="btn sm ok" data-qdone="${esc(q2.id)}">✓</button>` : ''}
            ${q2.status === 'waiting' ? `<button class="btn sm ghost" data-qskip="${esc(q2.id)}">${esc(t('skip'))}</button>` : ''}
          </div>
        </div>`).join('') : `<div class="card">${empty('🎫', t('no_results'))}</div>`}`;
    },
    mount(root) {
      qs('#queueDate', root).onchange = (e) => { location.hash = '#/queue?date=' + e.target.value; };
      qs('#qIssue', root).onclick = async () => {
        const res = await API.post('/api/clinic/queue', {
          patient_id: qs('#qPatient', root).value,
          doctor_id: qs('#qDoctor', root).value || undefined,
          priority: qs('#qPriority', root).checked
        });
        toast(res.token ? `${t('my_token')} ${res.token.token_no}` : t('saved'), 'ok');
        APP.render();
      };
      qsa('[data-qcall]', root).forEach((b) => b.onclick = async () => { await API.patch('/api/clinic/queue/' + b.dataset.qcall, { status: 'called' }); APP.render(); });
      qsa('[data-qdone]', root).forEach((b) => b.onclick = async () => { await API.patch('/api/clinic/queue/' + b.dataset.qdone, { status: 'done' }); APP.render(); });
      qsa('[data-qskip]', root).forEach((b) => b.onclick = async () => { await API.patch('/api/clinic/queue/' + b.dataset.qskip, { status: 'skipped' }); APP.render(); });
    }
  };

  // ================================================================= board ==
  VIEWS.board = {
    id: 'board', icon: '🖥', label: () => t('board'), roles: STAFF, chrome: 'board',
    async render() {
      const data = await API.get('/api/clinic/queue?date=' + fmt.todayISO());
      const serving = data.queue.filter((q2) => ['called', 'in_consult'].includes(q2.status));
      const waiting = data.queue.filter((q2) => q2.status === 'waiting').slice(0, 12);
      const dir = I18N.isRTL() ? 'rtl' : 'ltr';
      return `<div dir="${dir}">
        <div class="spread" style="margin-bottom:10px">
          <div><h1 style="margin:0">${esc(APP.session.org ? L(APP.session.org.name_fa) : t('clinic'))}</h1>
            <div class="tiny">${esc(fmt.date(fmt.todayISO()))} · ${esc(fmt.weekday(fmt.todayISO()))}</div></div>
          <a href="#/home_clinic" style="color:#fff">${esc(t('close'))} ✕</a>
        </div>
        <div class="card" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12);text-align:center">
          <div class="tiny">${esc(t('now_serving'))}</div>
          <div class="now">${esc(serving.map((s) => s.token_no).join(' · ') || '—')}</div>
          <div class="small">${esc(serving.map((s) => s.full_name).join(' · '))}</div>
        </div>
        <div class="tiny" style="margin:16px 0 6px">${esc(t('waiting'))}</div>
        <div class="tokens">
          ${waiting.map((w) => `<div class="token ${w.status === 'called' ? 'called' : ''}">
            <div style="font-size:2rem;font-weight:900">${esc(w.token_no)}</div>
            <div class="tiny">${esc(w.full_name)}</div>
            <div class="tiny" style="opacity:.7">${esc(w.doctor_fa || '')}</div>
          </div>`).join('') || `<div class="token">—</div>`}
        </div>
      </div>`;
    }
  };

  // ============================================================== patients ==
  VIEWS.patients = {
    id: 'patients', icon: '🗂', label: () => t('patients'), roles: STAFF.concat(['patient']),
    async render(ctx) {
      if (ctx.params.id) return VIEWS.patients.chart(ctx.params.id);
      const { patients } = await API.get('/api/clinic/patients');
      return `
      <div class="card tight"><input type="text" id="patSearch" placeholder="${esc(t('search_placeholder'))}"/></div>
      ${isStaff() ? `<button class="btn block" id="newPatient">＋ ${esc(t('register_patient'))}</button>` : ''}
      <div id="patList" class="stack">
        ${patients.map((p) => `<div class="card tight" data-pat="${esc(p.id)}">
          <div class="spread">
            <div class="row"><div class="avatar" style="width:36px;height:36px">${p.sex === 'female' ? '👩' : '👨'}</div>
              <div><strong class="small">${esc(p.full_name)}</strong>
                <div class="tiny muted">${esc(p.mrn)} · ${esc(p.phone || '')}</div></div></div>
            <span class="muted">›</span>
          </div>
          ${(p.allergies || []).length ? chip('⚠️ ' + p.allergies.join(', '), 'danger') : ''}
        </div>`).join('') || empty('🗂', t('no_results'))}
      </div>`;
    },
    async mount(root, ctx) {
      if (ctx.params.id) return VIEWS.patients.mountChart(root, ctx.params.id);
      qsa('[data-pat]', root).forEach((el) => el.onclick = () => { location.hash = '#/patients/' + el.dataset.pat; });
      const search = qs('#patSearch', root);
      let timer;
      search.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const { patients } = await API.get('/api/clinic/patients?q=' + encodeURIComponent(search.value));
          qs('#patList', root).innerHTML = patients.map((p) => `<div class="card tight" data-pat="${esc(p.id)}">
            <div class="spread"><div class="row"><div class="avatar" style="width:36px;height:36px">${p.sex === 'female' ? '👩' : '👨'}</div>
              <div><strong class="small">${esc(p.full_name)}</strong><div class="tiny muted">${esc(p.mrn)}</div></div></div>
              <span class="muted">›</span></div></div>`).join('') || empty('🗂', t('no_results'));
          qsa('[data-pat]', qs('#patList', root)).forEach((el) => el.onclick = () => { location.hash = '#/patients/' + el.dataset.pat; });
        }, 300);
      };
      const btn = qs('#newPatient', root);
      if (btn) btn.onclick = () => VIEWS.patients.register();
    },
    register() {
      const body = h('div', {},
        h('div', { class: 'form-grid' },
          h('div', { class: 'field full' }, h('label', {}, t('full_name')), h('input', { type: 'text', id: 'pName' })),
          h('div', { class: 'field' }, h('label', {}, t('guardian')), h('input', { type: 'text', id: 'pGuardian' })),
          h('div', { class: 'field' }, h('label', {}, t('phone')), h('input', { type: 'tel', id: 'pPhone' })),
          h('div', { class: 'field' }, h('label', {}, t('sex')), h('select', { id: 'pSex' }, h('option', { value: 'female' }, t('female')), h('option', { value: 'male' }, t('male')))),
          h('div', { class: 'field' }, h('label', {}, t('dob')), h('input', { type: 'date', id: 'pDob' })),
          h('div', { class: 'field' }, h('label', {}, t('blood_group')), h('select', { id: 'pBlood' }, ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((b) => h('option', { value: b }, b)))),
          h('div', { class: 'field full' }, h('label', {}, t('address')), h('input', { type: 'text', id: 'pAddr' })),
          h('div', { class: 'field full' }, h('label', {}, t('allergies') + ' (' + t('allergies') + ')'), h('input', { type: 'text', id: 'pAllergies', placeholder: 'Penicillin, …' }))
        )
      );
      modal({
        title: t('register_patient'), body,
        actions: [{
          label: t('save'), kind: '', onClick: async (close) => {
            const res = await API.post('/api/clinic/patients', {
              full_name: qs('#pName', body).value, guardian_name: qs('#pGuardian', body).value,
              phone: qs('#pPhone', body).value, sex: qs('#pSex', body).value, dob: qs('#pDob', body).value || null,
              blood_group: qs('#pBlood', body).value, province: qs('#pAddr', body).value,
              allergies: qs('#pAllergies', body).value.split(',').map((s) => s.trim()).filter(Boolean)
            });
            close(); toast(`${t('saved')} · ${res.patient?.mrn || ''}`, 'ok');
            if (res.patient) location.hash = '#/patients/' + res.patient.id;
            APP.render();
          }
        }]
      });
    },
    async chart(id) {
      const data = await API.get('/api/clinic/patients/' + id);
      const p = data.patient;
      const age = UI.fmt.jalali ? null : null;
      const vitals = (enc) => Object.entries(enc.vitals || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
      return `
      <div class="card accent">
        <div class="row">
          <div class="avatar-lg">${p.sex === 'female' ? '👩' : '👨'}</div>
          <div class="grow"><h2 style="margin:0">${esc(p.full_name)}</h2>
            <div class="tiny">${esc(p.mrn)} · ${esc(p.phone || '')} · ${esc(p.blood_group || '')}</div>
            <div class="tiny muted">${esc(p.city || '')} ${esc(p.village || '')} ${p.dob ? '· ' + esc(fmt.date(p.dob)) : ''}</div></div>
        </div>
        <div class="row wrap" style="margin-top:8px">
          ${(p.allergies || []).map((a) => chip('⚠️ ' + a, 'danger')).join('')}
          ${(p.conditions || []).map((c2) => chip(c2, 'warn')).join('')}
          ${p.is_pregnant ? chip('🤰 ' + t('pregnancy'), 'info') : ''}
        </div>
      </div>

      ${data.pregnancy ? `<div class="card tight">
        <div class="spread"><strong class="small">🤰 ${esc(t('pregnancy'))}</strong>
          ${chip(`${data.pregnancy.weeks} ${t('weeks')}`, 'info')}</div>
        <div class="tiny muted">${esc(t('delivery_date'))}: ${esc(fmt.date(data.pregnancy.edd))}</div>
      </div>` : ''}

      <div class="card tight">
        <div class="spread"><strong class="small">💉 ${esc(t('vaccination'))}</strong>
          ${chip((data.vaccines || []).filter((v) => v.given_date).length + '/' + (data.vaccines || []).length, 'ok')}</div>
        ${(data.vaccines || []).slice(0, 6).map((v) => `<div class="vacc-card ${v.given_date ? 'done' : 'due'}" style="margin-top:6px">
          <div><strong class="small">${esc(v.vaccine)} ${esc(v.dose_no)}</strong>
            <div class="tiny muted">${esc(v.given_date ? fmt.date(v.given_date) : fmt.date(v.due_date))}</div></div>
          <span>${v.given_date ? '✅' : '⏳'}</span></div>`).join('') || `<div class="tiny muted">—</div>`}
      </div>

      <div class="section-title">${esc(t('history'))}</div>
      ${(data.encounters || []).length ? data.encounters.map((e) => `<div class="card tight">
        <div class="spread"><strong class="small">${esc(fmt.date(e.date))}</strong>${chip(e.diagnosis || t('examination'), 'info')}</div>
        <div class="small">${esc(e.complaints || '')}</div>
        ${vitals(e) ? `<div class="tiny muted">${esc(vitals(e))}</div>` : ''}
        ${e.plan ? `<div class="tiny">💊 ${esc(e.plan)}</div>` : ''}
        ${e.follow_up_date ? `<div class="tiny muted">📅 ${esc(t('follow_up'))}: ${esc(fmt.date(e.follow_up_date))}</div>` : ''}
      </div>`).join('') : `<div class="card">${empty('🩺', t('no_results'))}</div>`}

      <div class="section-title">${esc(t('prescription'))}</div>
      ${(data.prescriptions || []).length ? data.prescriptions.map((r) => `<div class="card tight">
        <div class="spread"><strong class="small">${esc(fmt.date(r.created_at))}</strong>${chip(t(r.status) || r.status, r.status === 'dispensed' ? 'ok' : 'warn')}</div>
        ${(r.items || []).map((i) => `<div class="kv"><span class="k">${esc(i.name)} ${esc(i.dose || '')}</span><span class="v">${esc(i.freq || '')} · ${esc(i.days || '')}d</span></div>`).join('')}
        ${r.notes ? `<div class="tiny muted">${esc(r.notes)}</div>` : ''}
      </div>`).join('') : `<div class="card">${empty('💊', t('no_results'))}</div>`}

      <div class="section-title">${esc(t('lab'))}</div>
      ${(data.labs || []).length ? data.labs.map((l) => `<div class="card tight">
        <div class="spread"><strong class="small">${esc(l.test_name)}</strong>${chip(t(l.status) || l.status, l.status === 'resulted' ? 'ok' : 'warn')}</div>
        ${l.result ? `<div class="small">${esc(l.result)}</div>` : ''}
      </div>`).join('') : `<div class="card">${empty('🔬', t('no_results'))}</div>`}

      ${isStaff() ? `<div class="sticky-actions">
        ${CLINICAL.includes(APP.session.user.role) ? `<button class="btn block" id="newEncounter">🩺 ${esc(t('examination'))}</button>` : ''}
        ${['receptionist', 'nurse', 'clinic_admin'].includes(APP.session.user.role) ? `<button class="btn secondary block" id="issueToken2">🎫 ${esc(t('issue_token'))}</button>` : ''}
      </div>` : ''}`;
    },
    async mountChart(root, id) {
      const enc = qs('#newEncounter', root);
      if (enc) enc.onclick = () => VIEWS.patients.newEncounter(id);
      const tok = qs('#issueToken2', root);
      if (tok) tok.onclick = async () => {
        const res = await API.post('/api/clinic/queue', { patient_id: id });
        toast(`${t('my_token')} ${res.token?.token_no}`, 'ok'); APP.render();
      };
    },
    newEncounter(patientId) {
      const body = h('div', {},
        h('div', { class: 'field' }, h('label', {}, t('complaints')), h('textarea', { id: 'eComplaints' })),
        h('div', { class: 'form-grid' },
          h('div', { class: 'field' }, h('label', {}, t('temperature')), h('input', { type: 'text', id: 'vTemp', placeholder: '37.2' })),
          h('div', { class: 'field' }, h('label', {}, t('blood_pressure')), h('input', { type: 'text', id: 'vBp', placeholder: '120/80' })),
          h('div', { class: 'field' }, h('label', {}, t('pulse')), h('input', { type: 'text', id: 'vPulse' })),
          h('div', { class: 'field' }, h('label', {}, t('weight')), h('input', { type: 'text', id: 'vWeight' }))
        ),
        h('div', { class: 'field' }, h('label', {}, t('examination')), h('textarea', { id: 'eExam' })),
        h('div', { class: 'field' }, h('label', {}, t('diagnosis')), h('input', { type: 'text', id: 'eDiag' })),
        h('div', { class: 'field' }, h('label', {}, t('plan')), h('textarea', { id: 'ePlan' })),
        h('div', { class: 'field' }, h('label', {}, t('follow_up')), h('input', { type: 'date', id: 'eFollow', value: fmt.addDays(fmt.todayISO(), 7) })),
        h('div', { class: 'field' }, h('label', {}, t('medicine') + ' (name, dose, freq, days)'),
          h('textarea', { id: 'eRx', placeholder: 'Paracetamol 500mg | 1 tablet | 3x/day | 3' }))
      );
      modal({
        title: t('examination'), body,
        actions: [{
          label: t('save'), kind: '', onClick: async (close) => {
            const res = await API.post('/api/clinic/encounters', {
              patient_id: patientId,
              complaints: qs('#eComplaints', body).value,
              exam: qs('#eExam', body).value,
              diagnosis: qs('#eDiag', body).value,
              plan: qs('#ePlan', body).value,
              follow_up_date: qs('#eFollow', body).value,
              vitals: {
                temp: qs('#vTemp', body).value, bp: qs('#vBp', body).value,
                pulse: qs('#vPulse', body).value, weight: qs('#vWeight', body).value
              }
            });
            const rxText = qs('#eRx', body).value.trim();
            if (rxText) {
              const items = rxText.split('\n').map((line) => {
                const [name, dose, freq, days] = line.split('|').map((s) => (s || '').trim());
                return name ? { name, dose, freq, days: Number(days) || 3, qty: (Number(days) || 3) * 3 } : null;
              }).filter(Boolean);
              if (items.length) await API.post('/api/clinic/prescriptions', { patient_id: patientId, encounter_id: res.encounter.id, items });
            }
            close(); toast(t('saved'), 'ok'); APP.render();
          }
        }]
      });
    }
  };

  // ============================================================== pharmacy ==
  VIEWS.pharmacy = {
    id: 'pharmacy', icon: '💊', label: () => t('pharmacy'), roles: ['pharmacist', 'clinic_admin', 'doctor', 'nurse', 'patient'],
    async render() {
      const { medications } = await API.get('/api/clinic/medications');
      const canManage = ['pharmacist', 'clinic_admin'].includes(APP.session.user.role);
      const rows = medications.map((m) => `
        <div class="card tight">
          <div class="spread">
            <div style="min-width:0">
              <strong class="small">${esc(m.name)}</strong>
              <div class="tiny muted">${esc(m.form || '')} ${esc(m.strength || '')} · ${esc(m.batch_no || '')}</div>
              <div class="tiny muted">${esc(t('expiry'))}: ${m.expiry_date ? esc(fmt.date(m.expiry_date)) : '—'}</div>
            </div>
            <div class="stack" style="align-items:flex-end">
              <strong style="font-size:1.1rem;color:${m.is_low ? 'var(--danger)' : 'var(--brand)'}">${esc(m.stock_qty)}</strong>
              ${m.is_low ? chip(t('low_stock'), 'danger') : ''}
              ${m.expired ? chip('⛔ ' + t('expiring'), 'danger') : (m.expires_soon ? chip(t('expiring'), 'warn') : '')}
            </div>
          </div>
          ${canManage ? `<div class="row" style="margin-top:8px">
            <button class="btn sm secondary grow" data-receive="${esc(m.id)}">＋ ${esc(t('receive_stock'))}</button>
            <button class="btn sm ghost" data-edit="${esc(m.id)}">${esc(t('edit'))}</button>
          </div>` : ''}
        </div>`).join('') || empty('💊', t('no_results'));
      return `
      <div class="grid3">
        ${stat(medications.filter((m) => m.is_low).length, t('low_stock'))}
        ${stat(medications.filter((m) => m.expires_soon || m.expired).length, t('expiring'))}
        ${stat(medications.length, t('medicine'))}
      </div>
      ${canManage ? `<button class="btn block" id="addMed">＋ ${esc(t('medicine'))}</button>` : ''}
      ${rows}`;
    },
    mount(root) {
      qsa('[data-receive]', root).forEach((b) => b.onclick = () => {
        const qty = prompt(t('stock'), '50');
        if (!qty) return;
        API.patch('/api/clinic/medications/' + b.dataset.receive, { stock_qty: Number(qty) + Number(prompt('current?', '0') || 0), reason: 'received' })
          .then(() => { toast(t('saved'), 'ok'); APP.render(); });
      });
      qsa('[data-edit]', root).forEach((b) => b.onclick = () => {
        const qty = prompt(t('stock'), '0');
        if (qty === null) return;
        API.patch('/api/clinic/medications/' + b.dataset.edit, { stock_qty: Number(qty), reason: 'adjusted' })
          .then(() => { toast(t('saved'), 'ok'); APP.render(); });
      });
      const add = qs('#addMed', root);
      if (add) add.onclick = () => {
        const body = h('div', {},
          h('div', { class: 'field' }, h('label', {}, t('medicine')), h('input', { type: 'text', id: 'mName' })),
          h('div', { class: 'form-grid' },
            h('div', { class: 'field' }, h('label', {}, t('dose')), h('input', { type: 'text', id: 'mStrength', placeholder: '500mg' })),
            h('div', { class: 'field' }, h('label', {}, t('stock')), h('input', { type: 'number', id: 'mStock', value: '100' })),
            h('div', { class: 'field' }, h('label', {}, t('reorder_level')), h('input', { type: 'number', id: 'mReorder', value: '20' })),
            h('div', { class: 'field' }, h('label', {}, t('expiry')), h('input', { type: 'date', id: 'mExpiry' })))
        );
        modal({
          title: t('medicine'), body,
          actions: [{
            label: t('save'), kind: '', onClick: async (close) => {
              await API.post('/api/clinic/medications', {
                name: qs('#mName', body).value, strength: qs('#mStrength', body).value,
                stock_qty: Number(qs('#mStock', body).value), reorder_level: Number(qs('#mReorder', body).value),
                expiry_date: qs('#mExpiry', body).value
              });
              close(); toast(t('saved'), 'ok'); APP.render();
            }
          }]
        });
      };
    },
    dispense(rxId) {
      const body = h('div', {}, h('p', { class: 'small muted' }, t('dispense')), h('label', { class: 'row' },
        h('input', { type: 'checkbox', id: 'rxDeduct', checked: true, style: { width: '20px', height: '20px' } }), t('stock')));
      modal({
        title: t('dispense'), body,
        actions: [{
          label: t('dispense'), kind: '', onClick: async (close) => {
            const res = await API.post('/api/clinic/prescriptions/' + rxId + '/dispense', { deduct_stock: qs('#rxDeduct', body).checked });
            close();
            toast(t('dispensed'), 'ok');
            if (res.warnings && res.warnings.length) toast(res.warnings.join(' · '), 'warn', 4000);
            APP.render();
          }
        }]
      });
    }
  };

  // ========================================================= appointments ==
  VIEWS.appointments = {
    id: 'appointments', icon: '📅', label: () => t('appointments'), roles: STAFF.concat(['patient']),
    async render(ctx) {
      const date = ctx.query.date || fmt.todayISO();
      const { appointments } = await API.get('/api/clinic/appointments' + (isStaff() ? '?date=' + date : ''));
      const { patients } = await API.get('/api/clinic/patients');
      let doctors = [];
      if (isStaff()) {
        const { users } = await API.get('/api/users');
        doctors = users.filter((u) => u.role === 'doctor');
      }
      return `
      ${isStaff() ? `<div class="card tight"><input type="date" id="apptDate" value="${esc(date)}" style="width:100%"/></div>` : ''}
      <div class="card tight">
        <h3>${esc(t('appointments'))}</h3>
        ${isStaff() ? `<div class="field"><label>${esc(t('patients'))}</label>
          <select id="aPatient">${patients.map((p) => `<option value="${esc(p.id)}">${esc(p.full_name)} · ${esc(p.mrn)}</option>`).join('')}</select></div>` : ''}
        ${isStaff() ? `<div class="field"><label>${esc(t('doctor'))}</label>
          <select id="aDoctor">${doctors.map((d) => `<option value="${esc(d.id)}">${esc(d.name_fa || d.username)}</option>`).join('')}</select></div>` : ''}
        <div class="row">
          <input type="date" id="aDate" value="${esc(fmt.addDays(fmt.todayISO(), 1))}" style="flex:1"/>
          <input type="time" id="aTime" value="09:30" style="flex:1"/>
        </div>
        <div class="field"><input type="text" id="aReason" placeholder="${esc(t('reason'))}"/></div>
        <button class="btn block" id="bookAppt">📅 ${esc(t('appointments'))}</button>
      </div>
      <div class="section-title">${esc(fmt.date(date))}</div>
      ${appointments.length ? appointments.map((a) => `
        <div class="card tight">
          <div class="spread">
            <div><strong class="small">${esc(a.full_name)}</strong>
              <div class="tiny muted">${esc(a.mrn || '')} · ${esc(a.doctor_fa || '')}</div></div>
            <div class="stack" style="align-items:flex-end">
              ${chip(`${esc(a.time_slot || '')}`, 'outline')}
              ${chip(t(a.status) || a.status, a.status === 'seen' ? 'ok' : a.status === 'cancelled' ? 'danger' : 'info')}
            </div>
          </div>
          <div class="tiny muted">${esc(a.reason || '')}</div>
          ${isStaff() && ['booked'].includes(a.status) ? `<div class="row" style="margin-top:8px">
            <button class="btn sm grow" data-checkin="${esc(a.id)}">✓ ${esc(t('waiting'))}</button>
            <button class="btn sm ghost" data-noshow="${esc(a.id)}">✕</button>
          </div>` : ''}
        </div>`).join('') : `<div class="card">${empty('📅', t('no_results'))}</div>`}`;
    },
    mount(root) {
      const date = qs('#apptDate', root);
      if (date) date.onchange = (e) => { location.hash = '#/appointments?date=' + e.target.value; };
      qs('#bookAppt', root).onclick = async () => {
        const select = qs('#aPatient', root);
        let patientId = select ? select.value : null;
        if (!patientId) {
          const { patients } = await API.get('/api/clinic/patients');
          patientId = patients[0]?.id;
        }
        const res = await API.post('/api/clinic/appointments', {
          patient_id: patientId,
          doctor_id: qs('#aDoctor', root) ? qs('#aDoctor', root).value : undefined,
          date: qs('#aDate', root).value,
          time_slot: qs('#aTime', root).value,
          reason: qs('#aReason', root).value
        });
        toast(t('saved'), 'ok'); APP.render();
      };
      qsa('[data-checkin]', root).forEach((b) => b.onclick = async () => {
        await API.patch('/api/clinic/appointments/' + b.dataset.checkin, { status: 'checked_in' });
        toast(t('saved'), 'ok'); APP.render();
      });
      qsa('[data-noshow]', root).forEach((b) => b.onclick = async () => {
        await API.patch('/api/clinic/appointments/' + b.dataset.noshow, { status: 'no_show' });
        APP.render();
      });
    }
  };
})(window);
