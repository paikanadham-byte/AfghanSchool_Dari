/* ===========================================================================
   School module — student, parent, teacher, principal & admin screens
   =========================================================================== */
(function (global) {
  const { h, esc, qs, qsa, toast, modal, closeModal, confirmDialog, fmt, chip, empty, bar, stat, skeleton, pickFile, localisedInput, readLocalised } = UI;
  const VIEWS = (global.VIEWS = global.VIEWS || {});
  const schoolRoles = ['student', 'parent', 'teacher', 'admin', 'principal'];
  const IMPROVE_CATS = {
    strength: ['💪', () => t('strengths'), 'ok'],
    focus: ['🎯', () => t('focus_areas'), 'warn'],
    behavior: ['🧭', () => t('behavior'), 'info'],
    skill: ['🛠', () => t('skill'), 'info'],
    attendance: ['📅', () => t('attendance'), 'danger']
  };

  // ================================================================= home ====
  VIEWS.home = {
    id: 'home', icon: '🏠', label: () => t('home'), roles: schoolRoles,
    async render(ctx) {
      const s = APP.session;
      if (s.view.role === 'teacher' || s.view.role === 'admin' || s.view.role === 'principal') {
        return VIEWS.home.renderStaff(s.view.role);
      }
      if (s.user.role === 'parent' && s.view.role !== 'student') return VIEWS.home.renderParent();
      return VIEWS.home.renderStudent();
    },

    // ------------------------------------------------------------ student --
    async renderStudent() {
      const [{ overview }, { announcements }] = await Promise.all([
        API.get('/api/school/overview'),
        API.get('/api/announcements?limit=3')
      ]);
      const pending = overview.homework.pending || [];
      const next = pending[0];
      const slots = overview.today_slots || [];
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const current = slots.find((x) => x.start_time <= hhmm && x.end_time >= hhmm);
      const upcoming = slots.find((x) => x.start_time > hhmm);
      const mood = { ok: '🙂', great: '😄', tired: '😴', sad: '😔', worried: '😟', sick: '🤒' };

      return `
      <div class="card accent">
        <div class="spread">
          <div>
            <div class="tiny" style="opacity:.85">${esc(fmt.weekday(fmt.todayISO()))} · ${esc(fmt.date(fmt.todayISO()))}</div>
            <h2 style="margin:2px 0">${esc(t('hello'))}، ${esc(APP.session.view.name_fa || APP.session.view.username)} 👋</h2>
          </div>
          <div class="hero-badge">${esc(overview.classes[0] ? L(overview.classes[0].name_fa) || `${overview.classes[0].grade}-${overview.classes[0].section}` : '')}</div>
        </div>
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          ${chip(`${pending.length} ${t('homework')}`, pending.length ? 'warn' : 'ok')}
          ${chip(`${overview.merit_total ?? 0} ⭐`, 'info')}
          ${overview.attendance_pct !== null ? chip(`${overview.attendance_pct}% ${t('attendance')}`, overview.attendance_pct >= 85 ? 'ok' : 'warn') : ''}
        </div>
      </div>

      ${current || upcoming ? `<div class="card tight">
        <div class="spread">
          <div>
            <div class="tiny muted">${current ? t('next_class') : t('today_classes')}</div>
            <strong>${esc(L((current || upcoming).subject_fa) || '')} ${(current || upcoming).teacher_fa ? `<span class="tiny muted">· ${esc((current || upcoming).teacher_fa)}</span>` : ''}</strong>
            <div class="tiny muted">${esc((current || upcoming).start_time)} – ${esc((current || upcoming).end_time)} · ${esc((current || upcoming).room || '')}</div>
          </div>
          <span style="font-size:24px">${current ? '🔔' : '⏭'}</span>
        </div>
      </div>` : ''}

      ${next ? `<div class="card">
        <div class="section-title" style="margin-bottom:8px">${esc(t('due_soon'))}</div>
        <div class="list-item" style="padding:0">
          <div class="avatar">📝</div>
          <div class="body">
            <div class="title">${esc(L(next.title))}</div>
            <div class="sub">${esc(L(next.subject_fa) || '')} · ${esc(fmt.date(next.due_at))}</div>
          </div>
          ${chip(fmt.due(next.due_at).text, fmt.due(next.due_at).kind)}
        </div>
        <div class="row" style="margin-top:10px">
          <a class="btn sm grow" href="#/homework/${esc(next.id)}">${esc(t('submit'))}</a>
          <a class="btn sm secondary grow" href="#/tutor?hw=${esc(next.id)}">${esc(t('ask_tutor'))}</a>
        </div>
      </div>` : `<div class="card">${empty('🎉', t('empty_homework'))}</div>`}

      <div class="grid3">
        ${stat(pending.length, t('homework'))}
        ${stat((overview.improvements || []).filter((i) => i.status !== 'achieved').length, t('improvement_points'))}
        ${stat((overview.upcoming_exams || []).length, t('exams'))}
      </div>

      ${(overview.improvements || []).length ? `<div class="section-title">${esc(t('improvement_points'))}<a href="#/progress">${esc(t('view_all'))}</a></div>
        ${overview.improvements.slice(0, 2).map((i) => `<div class="card tight">
          <div class="spread"><strong style="font-size:.9rem">${esc(L(i.subject_fa) || (IMPROVE_CATS[i.category] ? IMPROVE_CATS[i.category][1]() : i.category))} · ${esc(i.category)}</strong>${chip(i.status, i.status === 'achieved' ? 'ok' : 'warn')}</div>
          <div class="small">${esc(L(i.text))}</div>
          ${i.progress ? bar(i.progress, i.progress >= 70 ? 'ok' : '') : ''}
        </div>`).join('')}` : ''}

      ${announcements.length ? `<div class="section-title">${esc(t('announcements'))}<a href="#/calendar">${esc(t('view_all'))}</a></div>
        ${announcements.slice(0, 2).map((a) => `<div class="card tight ${a.is_pinned ? 'accent' : ''}">
          <strong style="font-size:.92rem">${esc(L(a.title))}</strong>
          <div class="small muted">${esc(L(a.body))}</div>
        </div>`).join('')}` : ''}

      <div class="card tight">
        <div class="spread">
          <strong class="small">${esc(t('how_feel'))}</strong>
          <div class="row" style="gap:4px" id="moodRow">
            ${Object.entries(mood).map(([k, e2]) => `<button class="icon-btn" data-mood="${k}" style="background:#f4f6fb;color:#14213d;font-size:19px">${e2}</button>`).join('')}
          </div>
        </div>
      </div>`;
    },

    // ------------------------------------------------------------- parent --
    async renderParent() {
      const { overview } = await API.get('/api/school/overview');
      const kids = overview.children || [];
      const selected = APP.state.childId || (kids[0] && kids[0].id);
      if (!kids.length) return `<div class="card">${empty('👨‍👩‍👧', t('my_children'))}</div>`;
      const kid = kids.find((k) => k.id === selected) || kids[0];
      return `
      <div class="child-switch">
        ${kids.map((k) => `<button class="child ${k.id === kid.id ? 'active' : ''}" data-child="${esc(k.id)}">
          <span class="av">${esc(k.avatar || '🧒')}</span>${esc(k.name_fa || k.name_en)}</button>`).join('')}
      </div>
      <div class="card accent">
        <div class="spread">
          <div>
            <div class="tiny" style="opacity:.85">${esc(fmt.date(fmt.todayISO()))} · ${esc(fmt.weekday(fmt.todayISO()))}</div>
            <h2 style="margin:2px 0">${esc(kid.name_fa || kid.name_en)}</h2>
            <div class="tiny">${esc(kid.class_label || '')}</div>
          </div>
          <div class="hero-badge">${kid.pending} ${esc(t('homework'))}</div>
        </div>
        <div class="grid3" style="margin-top:10px">
          ${stat(kid.pending, t('todo'))}
          ${stat(kid.attendance_pct ?? '—', t('attendance_pct'))}
          ${stat(kid.merit_total ?? 0, t('merit'))}
        </div>
      </div>

      ${kid.overdue ? `<div class="notice">⚠️ ${esc(kid.overdue)} ${esc(t('overdue'))}</div>` : ''}

      <div class="grid2">
        <a class="btn block" href="#/homework?child=${esc(kid.id)}">📝 ${esc(t('homework'))}</a>
        <a class="btn secondary block" href="#/timetable?child=${esc(kid.id)}">🗓 ${esc(t('timetable'))}</a>
        <a class="btn secondary block" href="#/progress?child=${esc(kid.id)}">📈 ${esc(t('progress'))}</a>
        <button class="btn secondary block" id="openChild">👦 ${esc(t('view_as_child'))}</button>
      </div>

      <div class="card">
        <div class="section-title" style="margin-bottom:6px">${esc(t('quick_actions') || t('actions'))}</div>
        <div class="grid2">
          <button class="btn ghost block" id="reqMeeting">📅 ${esc(t('request_meeting'))}</button>
          <a class="btn ghost block" href="#/messages">💬 ${esc(t('messages'))}</a>
        </div>
      </div>`;
    },

    // ------------------------------------------------------------- staff ---
    async renderStaff(role) {
      if (role === 'admin' || role === 'principal') {
        const { stats } = await API.get('/api/school/stats');
        const c = stats.counts;
        return `
        <div class="card accent">
          <h2 style="margin:0">${esc(t('stats'))}</h2>
          <div class="tiny muted">${esc(fmt.date(fmt.todayISO()))}</div>
          <div class="grid3" style="margin-top:10px">
            ${stat(c.students, t('total_students'))}
            ${stat(c.teachers, t('teacher'))}
            ${stat(c.classes, t('classes'))}
          </div>
        </div>
        <div class="card">
          ${bar(stats.submission_rate ?? 0, (stats.submission_rate ?? 0) >= 70 ? 'ok' : 'warn')}
          <div class="spread tiny muted" style="margin-top:4px"><span>${esc(t('submission_rate'))}</span><span>${stats.submission_rate ?? 0}%</span></div>
          <div style="height:8px"></div>
          ${bar(stats.attendance_today ?? 0, (stats.attendance_today ?? 0) >= 85 ? 'ok' : 'warn')}
          <div class="spread tiny muted" style="margin-top:4px"><span>${esc(t('attendance'))} ${esc(t('today'))}</span><span>${stats.attendance_today ?? '—'}%</span></div>
        </div>
        <div class="grid2">
          <a class="btn block" href="#/admin">⚙️ ${esc(t('admin'))}</a>
          <a class="btn secondary block" href="#/classes">🏫 ${esc(t('classes'))}</a>
          <a class="btn secondary block" href="#/calendar">📅 ${esc(t('calendar'))}</a>
          <button class="btn secondary block" id="newAnnouncement">📢 ${esc(t('announcements'))}</button>
        </div>
        <div class="section-title">${esc(t('classes'))}</div>
        <div class="card"><div class="list">
          ${(stats.per_class || []).map((c2) => `<div class="list-item" data-class="${esc(c2.id)}">
            <div class="avatar">🏫</div>
            <div class="body"><div class="title">${esc(`${c2.grade}-${c2.section}`)}</div>
              <div class="sub">${c2.students} ${esc(t('student'))} · ${c2.submissions} ${esc(t('submitted'))}</div></div>
            <span class="muted">›</span></div>`).join('') || empty('🏫', t('no_results'))}
        </div></div>`;
      }
      const { overview } = await API.get('/api/school/overview');
      const hhmm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      return `
      <div class="card accent">
        <div class="spread">
          <div><h2 style="margin:0">${esc(t('hello'))}، ${esc(APP.session.view.name_fa || '')}</h2>
            <div class="tiny">${esc(fmt.weekday(fmt.todayISO()))} · ${esc(fmt.date(fmt.todayISO()))}</div></div>
          <div class="hero-badge">${overview.students_count || 0} ${esc(t('student'))}</div>
        </div>
      </div>

      <div class="grid3">
        ${stat((overview.to_grade || []).length, t('to_grade'))}
        ${stat((overview.homework || []).length, t('homework'))}
        ${stat((overview.absent_today || []).length, t('absent'))}
      </div>

      ${(overview.today_slots || []).length ? `<div class="section-title">${esc(t('today_classes'))}</div>
        <div class="card"><div class="tt-day-list">
          ${overview.today_slots.map((s) => `<div class="tt-slot ${s.start_time <= hhmm && s.end_time >= hhmm ? 'now' : ''}">
            <div class="pno">${s.period}</div>
            <div class="grow"><strong class="small">${esc(L(s.subject_fa) || '')}</strong>
              <div class="tiny muted">${esc(s.grade)}-${esc(s.section)} · ${esc(s.start_time)}–${esc(s.end_time)} · ${esc(s.room || '')}</div></div>
          </div>`).join('')}
        </div></div>` : ''}

      ${(overview.to_grade || []).length ? `<div class="section-title">${esc(t('to_grade'))}<a href="#/homework">${esc(t('view_all'))}</a></div>
        ${overview.to_grade.slice(0, 4).map((g) => `<div class="card tight">
          <div class="spread">
            <div><strong class="small">${esc(g.student_fa)}</strong>
              <div class="tiny muted truncate">${esc(L(g.hw_title))}</div></div>
            <a class="btn sm" href="#/homework/${esc(g.homework_id)}">${esc(t('grade_work'))}</a>
          </div></div>`).join('')}` : ''}

      ${(overview.at_risk || []).length ? `<div class="notice">⚠️ ${(overview.at_risk || []).map((r) => esc(r.name)).join('، ')} — ${esc(t('at_risk'))}</div>` : ''}

      <div class="grid2">
        <button class="btn block" id="newHW">📝 ${esc(t('new_homework'))}</button>
        <a class="btn secondary block" href="#/attendance">✅ ${esc(t('take_attendance'))}</a>
        <a class="btn secondary block" href="#/classes">👥 ${esc(t('classes'))}</a>
        <button class="btn secondary block" id="newAnnouncement">📢 ${esc(t('announcements'))}</button>
      </div>`;
    },

    async mount(root) {
      const s = APP.session;
      qsa('[data-child]', root).forEach((b) => b.onclick = () => { APP.state.childId = b.dataset.child; APP.render(); });
      qsa('[data-class]', root).forEach((el) => el.onclick = () => { location.hash = '#/classes/' + el.dataset.class; });
      qsa('[data-mood]', root).forEach((b) => b.onclick = async () => {
        await API.post('/api/school/mood', { mood: b.dataset.mood });
        toast(t('saved'), 'ok');
        qsa('#moodRow button', root).forEach((x) => x.style.background = '#f4f6fb');
        b.style.background = '#e7f7ed';
      });
      const openChild = qs('#openChild', root);
      if (openChild) openChild.onclick = async () => {
        const kidId = APP.state.childId || (await API.get('/api/school/overview')).overview.children[0].id;
        const res = await API.post('/api/auth/switch-view', { userId: kidId });
        if (res.ok) { APP.setSession(res); toast(t('view_as_child'), 'ok'); location.hash = '#/home'; APP.render(); }
      };
      const req = qs('#reqMeeting', root);
      if (req) req.onclick = () => VIEWS.progress.requestMeeting();
      const newHW = qs('#newHW', root);
      if (newHW) newHW.onclick = () => VIEWS.homework.compose();
      const ann = qs('#newAnnouncement', root);
      if (ann) ann.onclick = () => VIEWS.home.composeAnnouncement();
    },

    composeAnnouncement() {
      const body = h('div', {},
        UI.localisedInput('title'),
        UI.localisedInput('details'),
        h('div', { class: 'field' }, h('label', {}, t('severity')),
          h('select', { id: 'annPriority' }, [['normal', t('normal')], ['high', t('high')], ['urgent', t('high')]].map(([v, l]) => h('option', { value: v }, l)))),
        h('label', { class: 'row', style: { gap: '8px' } }, h('input', { type: 'checkbox', id: 'annPin', style: { width: '20px', height: '20px' } }), t('pinned'))
      );
      modal({
        title: t('announcements'),
        body,
        actions: [{
          label: t('publish'), kind: '', onClick: async (close) => {
            const inputs = qsa('[data-lang]', body).map((i) => i.value.trim());
            await API.post('/api/announcements', {
              title: { fa: inputs[0], ps: inputs[1], en: inputs[2] },
              body: { fa: inputs[3], ps: inputs[4], en: inputs[5] },
              priority: qs('#annPriority', body).value,
              pinned: qs('#annPin', body).checked
            });
            close(); toast(t('saved'), 'ok'); APP.render();
          }
        }]
      });
    }
  };

  // ============================================================= homework ====
  VIEWS.homework = {
    id: 'homework', icon: '📝', label: () => t('homework'), roles: schoolRoles,
    async render(ctx) {
      if (ctx.params.id) return VIEWS.homework.detail(ctx.params.id);
      const { homework } = await API.get('/api/school/homework');
      const role = APP.session.view.role;
      const now = Date.now();
      const sorted = homework.slice().sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
      const tabs = role === 'student' || (role === 'parent' && APP.session.is_viewing_child)
        ? [['pending', t('todo')], ['submitted', t('submitted')], ['graded', t('graded')], ['all', t('all')]]
        : [['all', t('all')], ['active', t('pending')], ['past', t('due')]];
      const active = ctx.query.tab || tabs[0][0];
      let list = sorted;
      if (active === 'pending') list = sorted.filter((x) => !x.sub_status);
      if (active === 'submitted') list = sorted.filter((x) => x.sub_status === 'submitted' || x.sub_status === 'late');
      if (active === 'graded') list = sorted.filter((x) => x.sub_status === 'graded' || x.sub_status === 'returned');
      if (active === 'active') list = sorted.filter((x) => Date.parse(x.due_at) >= now - 86400000 * 2);
      if (active === 'past') list = sorted.filter((x) => Date.parse(x.due_at) < now - 86400000 * 2);

      return `
      <div class="tabs" id="hwTabs">
        ${tabs.map(([k, l]) => `<button data-tab="${k}" class="${active === k ? 'active' : ''}">${esc(l)}</button>`).join('')}
      </div>
      ${list.length ? list.map((hw) => {
        const due = fmt.due(hw.due_at);
        const isTeacherView = ['teacher', 'admin', 'principal'].includes(role);
        const count = isTeacherView && hw.submissions !== undefined
          ? `<div class="tiny muted">${hw.submissions}/${hw.enrolled ?? '?'} ${esc(t('submitted'))} · ${hw.graded ?? 0} ${esc(t('graded'))}</div>` : '';
        return `<div class="card tight" data-hw="${esc(hw.id)}">
          <div class="spread">
            <div class="grow" style="min-width:0">
              <strong style="font-size:.95rem">${esc(L(hw.title))}</strong>
              <div class="tiny muted">${esc(L(hw.subject_fa) || '')}${hw.teacher_fa ? ` · ${esc(hw.teacher_fa)}` : ''}${hw.student_name ? ` · ${esc(hw.student_name)}` : ''}</div>
              ${count}
            </div>
            <div class="stack" style="align-items:flex-end">
              ${chip(fmt.date(hw.due_at), 'outline')}
              ${chip(due.text, due.kind)}
            </div>
          </div>
          <div class="row" style="margin-top:6px;gap:6px">
            ${hw.sub_status ? chip(hw.sub_status === 'graded' ? `${t('graded')} ${hw.score ?? ''}` : t(hw.sub_status) || hw.sub_status, hw.sub_status === 'graded' ? 'ok' : hw.sub_status === 'returned' ? 'danger' : 'info') : ''}
            ${hw.is_late ? chip(t('late'), 'danger') : ''}
          </div>
        </div>`;
      }).join('') : `<div class="card">${empty('📚', t('empty_homework'))}</div>`}`;
    },
    async mount(root, ctx) {
      qsa('[data-tab]', root).forEach((b) => b.onclick = () => {
        const tab = b.dataset.tab;
        const q2 = new URLSearchParams(location.hash.split('?')[1] || '');
        q2.set('tab', tab);
        location.hash = '#/homework?' + q2.toString();
      });
      qsa('[data-hw]', root).forEach((el) => el.onclick = () => { location.hash = '#/homework/' + el.dataset.hw; });
      if (['teacher', 'admin', 'principal'].includes(APP.session.view.role) && !ctx.params.id) {
        const fab = h('button', { class: 'fab', onclick: () => VIEWS.homework.compose() }, '＋');
        root.appendChild(fab);
      }
    },

    async detail(id) {
      const data = await API.get('/api/school/homework/' + id);
      const hw = data.homework;
      const role = APP.session.view.role;
      const due = fmt.due(hw.due_at);
      const files = (data.attachments || []).map((a) => `<a class="chip outline" href="/api/files/${esc(a.id)}" target="_blank">📎 ${esc(a.name)}</a>`).join(' ');
      const head = `
        <div class="card accent">
          <div class="spread">
            <div><h2 style="margin:0;font-size:1.05rem">${esc(L(hw.title))}</h2>
              <div class="tiny">${esc(L(hw.subject_fa) || '')} · ${esc(hw.teacher_fa || '')} · ${esc(`${hw.grade}-${hw.section}`)}</div></div>
            ${chip(due.text, due.kind)}
          </div>
          <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap">
            ${chip(`${t('due')}: ${fmt.date(hw.due_at)}`, 'outline')}
            ${chip(`${hw.est_minutes} ${t('minutes')}`, 'outline')}
            ${chip(`${hw.max_points} ${t('points')}`, 'outline')}
            ${chip(t(hw.difficulty) || hw.difficulty, hw.difficulty === 'hard' ? 'danger' : hw.difficulty === 'medium' ? 'warn' : 'ok')}
          </div>
          <div class="small" style="margin-top:10px">${esc(L(hw.instructions))}</div>
          ${files ? `<div class="row wrap" style="margin-top:8px">${files}</div>` : ''}
          <div class="row" style="margin-top:10px;gap:6px">
            <a class="btn sm secondary grow" href="#/tutor?hw=${esc(hw.id)}">🤖 ${esc(t('ask_tutor'))}</a>
            <button class="btn sm ghost" id="speakTask">🔊 ${esc(t('read_aloud'))}</button>
          </div>
          <div class="tiny muted" style="margin-top:6px">🤖 ${esc(t('tutor_help'))}</div>
        </div>`;

      if (role === 'teacher' || role === 'admin' || role === 'principal') {
        const subs = data.submissions || [];
        return head + `
        <div class="card tight">
          <div class="grid3">
            ${stat(data.stats?.total ?? subs.length, t('student'))}
            ${stat(data.stats?.submitted ?? 0, t('submitted'))}
            ${stat(data.stats?.graded ?? 0, t('graded'))}
          </div>
        </div>
        ${subs.map((s) => `
          <div class="card tight" data-student="${esc(s.id)}">
            <div class="spread">
              <div class="row">
                <div class="avatar" style="width:34px;height:34px;font-size:16px">${esc(s.avatar || '🧑‍🎓')}</div>
                <div><strong class="small">${esc(s.name_fa || s.name_en)}</strong>
                  <div class="tiny muted">${s.status ? esc(t(s.status) || s.status) : esc(t('not_submitted'))} ${s.score !== null && s.score !== undefined ? `· ${s.score}/${hw.max_points}` : ''}</div></div>
              </div>
              ${s.submission_id ? `<button class="btn sm" data-grade="${esc(s.id)}">${esc(t('grade_work'))}</button>` : chip(t('missing'), 'danger')}
            </div>
            ${s.text ? `<div class="small" style="margin-top:6px;padding:8px;background:#f7f9fc;border-radius:10px">${esc(s.text)}</div>` : ''}
            ${(s.attachments || []).length ? `<div class="row wrap" style="margin-top:6px">${s.attachments.map((a) => `<a class="chip outline" href="/api/files/${esc(a.id)}" target="_blank">📎</a>`).join('')}</div>` : ''}
          </div>`).join('')}`;
      }

      // student / parent view
      const sub = data.submission;
      // A parent who opened their child's account may read everything but must not submit
      const isParent = APP.session.user.role === 'parent';
      const childBlocks = data.children ? data.children.map((c) => `
        <div class="card tight">
          <div class="spread"><strong class="small">${esc(c.name)}</strong>
            ${c.submission ? chip(c.submission.status === 'graded' ? `${c.submission.score ?? ''}/${hw.max_points}` : t(c.submission.status) || c.submission.status, c.submission.status === 'graded' ? 'ok' : 'info') : chip(t('not_submitted'), 'danger')}</div>
          ${c.submission?.text ? `<div class="small muted">${esc(c.submission.text)}</div>` : ''}
          ${c.submission?.feedback ? `<div class="notice ok" style="margin-top:6px">${esc(L(c.submission.feedback))}</div>` : ''}
        </div>`).join('') : '';

      const submitCard = `
        <div class="card">
          <h3>${sub ? esc(t('submit_work')) : esc(t('submit'))}</h3>
          ${sub && sub.score !== null ? `<div class="notice ok">✅ ${esc(t('graded'))}: <strong>${sub.score}/${hw.max_points}</strong></div>` : ''}
          ${sub && sub.feedback ? `<div class="notice" style="margin-top:8px">💬 ${esc(L(sub.feedback))}</div>` : ''}
          ${sub && sub.status === 'returned' ? `<div class="notice" style="margin-top:8px">↩️ ${esc(t('returned'))}</div>` : ''}
          ${(!isParent) ? `
          <div class="field"><label>${hw.allow_text ? esc(t('your_answer')) : esc(t('notes'))}</label>
            <textarea id="subText" placeholder="${esc(t('write_here'))}">${esc(sub?.text || '')}</textarea></div>
          <div class="row wrap" style="gap:8px">
            ${hw.allow_file ? `<button class="btn secondary sm" id="btnPhoto">📷 ${esc(t('attach_photo'))}</button>` : ''}
            ${hw.allow_file ? `<button class="btn secondary sm" id="btnFile">📎 ${esc(t('attach_file'))}</button>` : ''}
            ${hw.allow_audio ? `<button class="btn secondary sm" id="btnAudio">🎤 ${esc(t('record_audio'))}</button>` : ''}
          </div>
          <div class="row wrap" id="attachList" style="margin-top:8px"></div>
          <button class="btn block" id="btnSubmit" style="margin-top:10px">${sub ? '🔄 ' + esc(t('submit')) : esc(t('submit'))}</button>
          ${sub ? `<div class="tiny muted center" style="margin-top:6px">${esc(t('submitted'))}: ${esc(fmt.dateTime(sub.submitted_at))}</div>` : ''}
          ` : `<div class="notice info">${esc(t('tutor_help'))} — ${esc(t('view_as_child'))}</div>`}
        </div>`;
      return head + childBlocks + submitCard;
    },

    async mountDetail(root, id) {
      const isStaff = ['teacher', 'admin', 'principal'].includes(APP.session.view.role);
      if (isStaff) {
        const data = await API.get('/api/school/homework/' + id);
        qsa('[data-grade]', root).forEach((b) => b.onclick = () => VIEWS.homework.grade(id, b.dataset.grade, data.homework.max_points, b.closest('[data-student]')?.querySelector('strong')?.textContent || ''));
        return;
      }
      const text = qs('#subText', root);
      const attachments = [];
      const renderAttach = () => {
        qs('#attachList', root).innerHTML = attachments.map((a, i) => `<span class="chip ok">📎 ${esc(a.name)} <b data-rm="${i}" style="cursor:pointer">✕</b></span>`).join('');
        qsa('[data-rm]', root).forEach((b) => b.onclick = () => { attachments.splice(+b.dataset.rm, 1); renderAttach(); });
      };
      const attach = async (file) => {
        if (!file) return;
        toast(t('loading'));
        const res = await API.upload(file, { ref_type: 'temp' });
        if (res.ok) { attachments.push({ id: res.attachment.id, name: res.attachment.name }); renderAttach(); }
        else toast(res.error || t('error'), 'err');
      };
      const photo = qs('#btnPhoto', root);
      if (photo) photo.onclick = async () => attach(await pickFile({ accept: 'image/*', capture: true }));
      const file = qs('#btnFile', root);
      if (file) file.onclick = async () => attach(await pickFile());
      const audio = qs('#btnAudio', root);
      if (audio) {
        audio.onclick = async () => {
          try {
            audio.disabled = true;
            const pending = UI.recordAudio();
            audio.textContent = '⏹ ' + t('stop');
            audio.disabled = false;
            audio.onclick = async () => {
              UI.stopRecording();
              const file = await pending;
              audio.textContent = '🎤 ' + t('record_audio');
              attach(file);
            };
            toast(t('listening'), 'warn', 2000);
          } catch (e) { toast(t('error'), 'err'); audio.disabled = false; }
        };
      }
      const speakBtn = qs('#speakTask', root);
      if (speakBtn) speakBtn.onclick = () => {
        const card = root.querySelector('.card');
        UI.speak([card.querySelector('h2').textContent, card.querySelector('.small').textContent].join('. '));
      };
      const submit = qs('#btnSubmit', root);
      if (submit) submit.onclick = async () => {
        submit.disabled = true;
        const res = await API.post(`/api/school/homework/${id}/submit`, {
          text: text ? text.value : '',
          attachments: attachments.map((a) => a.id)
        });
        submit.disabled = false;
        if (res.queued) toast(t('saved_offline'), 'warn');
        else toast(res.late ? t('late') : t('submitted'), res.late ? 'warn' : 'ok');
        APP.render();
      };
    },

    grade(homeworkId, studentId, maxPoints, name) {
      const body = h('div', {},
        h('div', { class: 'field' }, h('label', {}, `${t('give_score')} / ${maxPoints}`), h('input', { type: 'number', id: 'gScore', min: '0', max: String(maxPoints) })),
        h('div', { class: 'field' }, h('label', {}, t('feedback')), h('textarea', { id: 'gFeedback' })),
        h('div', { class: 'field' }, h('label', {}, t('status')), h('select', { id: 'gStatus' },
          h('option', { value: 'graded' }, t('graded')), h('option', { value: 'returned' }, t('returned'))))
      );
      modal({
        title: `${t('grade_work')} — ${name}`,
        body,
        actions: [{
          label: t('save'), kind: '', onClick: async (close) => {
            await API.post(`/api/school/homework/${homeworkId}/grade`, {
              student_id: studentId,
              score: qs('#gScore', body).value === '' ? null : Number(qs('#gScore', body).value),
              feedback: qs('#gFeedback', body).value,
              status: qs('#gStatus', body).value
            });
            close(); toast(t('saved'), 'ok'); APP.render();
          }
        }]
      });
    },

    compose() {
      Promise.all([API.get('/api/school/classes'), API.get('/api/school/subjects')]).then(([{ classes }, { subjects }]) => {
        const body = h('div', {},
          UI.localisedInput('title'),
          UI.localisedInput('instructions'),
          h('div', { class: 'form-grid' },
            h('div', { class: 'field' }, h('label', {}, t('subject')), h('select', { id: 'hwSubject' }, subjects.map((s) => h('option', { value: s.id }, L(s.name_fa))))),
            h('div', { class: 'field' }, h('label', {}, t('assign_to')), h('select', { id: 'hwClass', multiple: true, style: { minHeight: '90px' } }, classes.map((c) => h('option', { value: c.id, selected: true }, `${c.grade}-${c.section}`)))),
            h('div', { class: 'field' }, h('label', {}, t('due_date')), h('input', { type: 'date', id: 'hwDue', value: fmt.addDays(fmt.todayISO(), 3) })),
            h('div', { class: 'field' }, h('label', {}, t('points_possible')), h('input', { type: 'number', id: 'hwPoints', value: '10' })),
            h('div', { class: 'field' }, h('label', {}, t('estimated_minutes')), h('input', { type: 'number', id: 'hwMins', value: '30' })),
            h('div', { class: 'field' }, h('label', {}, t('difficulty')), h('select', { id: 'hwDiff' }, [['easy', t('easy')], ['medium', t('medium')], ['hard', t('hard')]].map(([v, l]) => h('option', { value: v }, l))))
          ),
          h('div', { class: 'row wrap' },
            h('label', { class: 'chip outline' }, h('input', { type: 'checkbox', id: 'hwText', checked: true, style: { marginInlineEnd: '6px' } }), t('allow_text')),
            h('label', { class: 'chip outline' }, h('input', { type: 'checkbox', id: 'hwFile', checked: true, style: { marginInlineEnd: '6px' } }), t('allow_file')),
            h('label', { class: 'chip outline' }, h('input', { type: 'checkbox', id: 'hwAudio', checked: true, style: { marginInlineEnd: '6px' } }), t('allow_audio'))
          )
        );
        modal({
          title: t('new_homework'),
          body,
          actions: [{
            label: t('publish'), kind: '', onClick: async (close) => {
              const inputs = qsa('[data-lang]', body).map((i) => i.value.trim());
              const classIds = Array.from(qs('#hwClass', body).selectedOptions).map((o) => o.value);
              if (!inputs[0] || !classIds.length) return toast(t('required'), 'err');
              await API.post('/api/school/homework', {
                title: { fa: inputs[0], ps: inputs[1], en: inputs[2] },
                instructions: { fa: inputs[3], ps: inputs[4], en: inputs[5] },
                class_ids: classIds,
                subject_id: qs('#hwSubject', body).value,
                due_at: qs('#hwDue', body).value + 'T12:00:00.000Z',
                max_points: Number(qs('#hwPoints', body).value || 10),
                est_minutes: Number(qs('#hwMins', body).value || 30),
                difficulty: qs('#hwDiff', body).value,
                allow_text: qs('#hwText', body).checked,
                allow_file: qs('#hwFile', body).checked,
                allow_audio: qs('#hwAudio', body).checked
              });
              close(); toast(t('saved'), 'ok'); APP.render();
            }
          }]
        });
      });
    }
  };

  // ============================================================ timetable ====
  VIEWS.timetable = {
    id: 'timetable', icon: '🗓', label: () => t('timetable'), roles: schoolRoles,
    async render(ctx) {
      const childId = ctx.query.child || APP.state.childId;
      const qs2 = childId ? `?student_id=${encodeURIComponent(childId)}` : '';
      const [{ slots, class_id, classes, week }] = [await API.get('/api/school/timetable' + qs2)];
      const weekdays = I18N.weekdays();
      const todayISO = fmt.todayISO();
      const colors = {};
      const subjectOf = (s) => L(s.subject_fa) || '';
      slots.forEach((s) => { const name = subjectOf(s); if (name && !colors[name]) colors[name] = s.color || '#2563eb'; });
      const periods = [...new Set(slots.map((s) => s.period))].sort((a, b) => a - b);
      const times = {};
      slots.forEach((s) => { times[s.period] = `${s.start_time}\n${s.end_time}`; });

      const grid = `
        <div class="card" style="overflow-x:auto">
          <div class="tt-grid">
            <div class="tt-head"></div>
            ${weekdays.map((d, i) => `<div class="tt-head ${week[i] === todayISO ? 'today' : ''}">${esc(d.slice(0, 3))}</div>`).join('')}
            ${periods.map((p) => `
              <div class="tt-time">${esc(p)}<br><span class="tiny" style="font-weight:400">${esc((times[p] || '').split('\n')[0])}</span></div>
              ${Array.from({ length: 6 }, (_, day) => {
                const slot = slots.find((s) => s.period === p && s.day === day);
                if (!slot) return `<div class="tt-cell empty"></div>`;
                const name = subjectOf(slot);
                return `<div class="tt-cell" style="background:${esc(colors[name] || '#2563eb')}" title="${esc(name)}">${esc(name.slice(0, 6))}</div>`;
              }).join('')}
            `).join('')}
          </div>
        </div>`;

      const todayIdx = fmt.weekdayIndex(todayISO);
      const todaySlots = slots.filter((s) => s.day === todayIdx).sort((a, b) => a.period - b.period);
      const hhmm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      const list = `
        <div class="section-title">${esc(t('today_classes'))} — ${esc(fmt.weekday(todayISO))}</div>
        ${todaySlots.length ? `<div class="tt-day-list">${todaySlots.map((s) => `
          <div class="tt-slot ${s.start_time <= hhmm && s.end_time >= hhmm ? 'now' : ''}">
            <div class="pno">${s.period}</div>
            <div class="grow"><strong class="small">${esc(subjectOf(s))}</strong>
              <div class="tiny muted">${esc(s.start_time)}–${esc(s.end_time)} · ${esc(s.teacher_fa || '')} ${s.room ? '· ' + esc(s.room) : ''}</div></div>
            <span class="chip outline">${esc(s.room || '')}</span>
          </div>`).join('')}</div>` : `<div class="card">${empty('🗓', t('no_class_today'))}</div>`}`;

      return grid + list;
    }
  };

  // ============================================================== progress ==
  VIEWS.progress = {
    id: 'progress', icon: '📈', label: () => t('progress'), roles: ['student', 'parent', 'teacher', 'admin', 'principal'],
    async render(ctx) {
      const studentId = ctx.query.child || APP.state.childId || (APP.session.view.role === 'student' ? APP.session.view.id : null)
        || (APP.session.children && APP.session.children[0]?.id);
      if (!studentId) return `<div class="card">${empty('📈', t('no_results'))}</div>`;
      const [{ improvements }, grades, att, merit] = await Promise.all([
        API.get('/api/school/improvement?student_id=' + studentId),
        API.get('/api/school/grades/' + studentId),
        API.get('/api/school/attendance?student_id=' + studentId),
        API.get('/api/school/merit/' + studentId)
      ]);
      const present = (att.records || []).filter((r) => ['present', 'late'].includes(r.status)).length;
      const pct = att.records.length ? Math.round((present / att.records.length) * 100) : null;

      return `
      <div class="grid3">
        ${stat(merit.total ?? 0, t('merit'))}
        ${stat(pct !== null ? pct + '%' : '—', t('attendance_pct'))}
        ${stat(grades.average ?? '—', t('average'))}
      </div>

      <div class="section-title">${esc(t('improvement_points'))}</div>
      ${improvements.length ? improvements.map((i) => {
        const c = IMPROVE_CATS[i.category] ? [IMPROVE_CATS[i.category][0], IMPROVE_CATS[i.category][1](), IMPROVE_CATS[i.category][2]] : ['🎯', t('focus_areas'), 'warn'];
        const subjectLabel = L(i.subject_fa) || c[1] || i.category;
        return `<div class="card tight">
          <div class="spread">
            <div><span>${c[0]}</span> <strong class="small">${esc(subjectLabel)}</strong>
              <span class="chip ${c[2]}">${esc(c[1])}</span></div>
            ${chip(t(i.status) || i.status, i.status === 'achieved' ? 'ok' : i.status === 'improving' ? 'info' : 'warn')}
          </div>
          <div class="small" style="margin-top:4px">${esc(L(i.text))}</div>
          ${i.goal ? `<div class="tiny muted">🎯 ${esc(L(i.goal))}</div>` : ''}
          <div style="margin-top:8px">${bar(i.progress || 0, i.progress >= 70 ? 'ok' : '')}</div>
          <div class="row" style="margin-top:8px;gap:6px">
            ${[0, 25, 50, 75, 100].map((p) => `<button class="btn sm ${i.progress === p ? '' : 'ghost'}" data-prog="${i.id}" data-val="${p}">${p}%</button>`).join('')}
            ${i.status !== 'achieved' ? `<button class="btn sm ok" data-achieve="${i.id}">✓</button>` : ''}
          </div>
        </div>`;
      }).join('') : `<div class="card">${empty('📈', t('no_results'))}</div>`}

      <div class="section-title">${esc(t('results'))}</div>
      <div class="card">
        ${(grades.by_subject || []).length ? (grades.by_subject || []).map((s) => `
          <div style="margin-bottom:10px">
            <div class="spread small"><strong>${esc(s.subject)}</strong><span>${s.average}% · ${s.count} ${esc(t('exams'))}</span></div>
            ${bar(s.average, s.average >= 50 ? 'ok' : s.average >= 40 ? 'warn' : 'danger')}
          </div>`).join('') : empty('📝', t('no_results'))}
      </div>

      <div class="section-title">${esc(t('attendance'))}</div>
      <div class="card tight">
        <div class="row wrap" style="gap:4px">
          ${(att.records || []).slice(0, 30).map((r) => `<span class="chip ${r.status === 'present' ? 'ok' : r.status === 'late' ? 'warn' : r.status === 'excused' ? 'grey' : 'danger'}" title="${esc(fmt.date(r.date))}">${esc(fmt.jalali(r.date).split(' ')[0])}</span>`).join('') || empty('📅', t('no_results'))}
        </div>
        <div class="tiny muted" style="margin-top:6px">${esc(t('absences'))}: ${(att.records || []).filter((r) => r.status === 'absent').length}</div>
      </div>`;
    },
    mount(root) {
      qsa('[data-prog]', root).forEach((b) => b.onclick = async () => {
        await API.patch('/api/school/improvement/' + b.dataset.prog, { progress: Number(b.dataset.val) });
        toast(t('saved'), 'ok'); APP.render();
      });
      qsa('[data-achieve]', root).forEach((b) => b.onclick = async () => {
        await API.patch('/api/school/improvement/' + b.dataset.achieve, { status: 'achieved', progress: 100 });
        toast(t('achieved'), 'ok'); APP.render();
      });
    },
    requestMeeting() {
      Promise.all([API.get('/api/meetings'), API.get('/api/school/classes')]).then(() => {
        const body = h('div', {},
          h('div', { class: 'field' }, h('label', {}, t('teacher')), h('input', { type: 'text', id: 'mTeacher', placeholder: 'demo.teacher' })),
          h('div', { class: 'field' }, h('label', {}, t('reason')), h('input', { type: 'text', id: 'mReason' })),
          h('div', { class: 'field' }, h('label', {}, t('preferred_times')), h('input', { type: 'text', id: 'mSlots', placeholder: fmt.addDays(fmt.todayISO(), 2) + ' 10:00, ' + fmt.addDays(fmt.todayISO(), 3) + ' 11:00' }))
        );
        modal({
          title: t('request_meeting'), body,
          actions: [{
            label: t('send'), kind: '', onClick: async (close) => {
              const teacherName = qs('#mTeacher', body).value.trim();
              const { users } = await API.get('/api/users?role=teacher');
              const teacher = users.find((u) => u.username === teacherName || (u.name_fa || '').includes(teacherName)) || users[0];
              await API.post('/api/school/meetings', {
                teacher_id: teacher?.id,
                student_id: APP.state.childId || APP.session.children?.[0]?.id,
                reason: qs('#mReason', body).value,
                slots: qs('#mSlots', body).value.split(',').map((s) => s.trim())
              });
              close(); toast(t('report_sent'), 'ok');
            }
          }]
        });
      });
    }
  };

  // ============================================================== library ====
  VIEWS.library = {
    id: 'library', icon: '📚', label: () => t('library'), roles: schoolRoles,
    async render() {
      const { books } = await API.get('/api/school/library');
      let total = null;
      try { total = (await API.get('/api/school/reading-log')).total_minutes; } catch (e) {}
      return `
      <div class="card tight">
        <input type="text" id="bookSearch" placeholder="${esc(t('search_placeholder'))}"/>
        <div class="tiny muted" style="margin-top:6px">${total !== null ? `⏱ ${total} ${esc(t('reading_minutes'))}` : ''}</div>
      </div>
      <div id="bookList" class="stack">
        ${books.map((b) => `<div class="card tight">
          <div class="spread">
            <div class="grow" style="min-width:0">
              <strong class="small">${esc(b.title)}</strong>
              <div class="tiny muted">${esc(b.subject || '')} ${b.grade ? '· ' + esc(t('grade')) + ' ' + b.grade : ''}</div>
            </div>
            ${b.url ? `<a class="btn sm secondary" href="${esc(b.url)}" target="_blank" rel="noopener">📖 ${esc(t('open_book'))}</a>` : ''}
          </div>
          <div class="row" style="margin-top:8px;gap:6px">
            <button class="btn sm ghost" data-log="${esc(b.id)}">⏱ ${esc(t('log_reading'))}</button>
          </div>
        </div>`).join('') || empty('📚', t('no_results'))}
      </div>`;
    },
    mount(root) {
      const input = qs('#bookSearch', root);
      let timer;
      input.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const { books } = await API.get('/api/school/library?q=' + encodeURIComponent(input.value));
          qs('#bookList', root).innerHTML = books.map((b) => `<div class="card tight">
            <div class="spread"><div class="grow" style="min-width:0"><strong class="small">${esc(b.title)}</strong>
              <div class="tiny muted">${esc(b.subject || '')}</div></div>
              ${b.url ? `<a class="btn sm secondary" href="${esc(b.url)}" target="_blank">📖</a>` : ''}</div></div>`).join('') || empty('📚', t('no_results'));
        }, 300);
      };
      qsa('[data-log]', root).forEach((b) => b.onclick = async () => {
        const minutes = prompt(t('minutes'), '15');
        if (!minutes) return;
        await API.post('/api/school/reading-log', { book_id: b.dataset.log, minutes: Number(minutes) });
        toast(t('saved'), 'ok');
      });
    }
  };

  // ============================================================== quizzes ====
  VIEWS.quizzes = {
    id: 'quizzes', icon: '🎯', label: () => t('quizzes'), roles: ['student', 'parent', 'teacher', 'admin', 'principal'],
    async render(ctx) {
      if (ctx.params.id) {
        const data = await API.get('/api/school/quizzes/' + ctx.params.id);
        return `<div class="card">
          <h3>${esc(data.quiz.title)}</h3>
          <div id="quizBody">
            ${data.quiz.questions.map((q, i) => `
              <div class="card tight" style="margin-bottom:8px" data-q="${i}">
                <strong class="small">${i + 1}. ${esc(q.q)}</strong>
                <div class="stack" style="margin-top:8px">
                  ${q.options.map((o, oi) => `<button class="btn ghost block" data-ans="${oi}" style="justify-content:flex-start;text-align:start">${esc(o)}</button>`).join('')}
                </div>
              </div>`).join('')}
          </div>
          <button class="btn block" id="quizSubmit">${esc(t('submit'))}</button>
          <div id="quizResult"></div>
        </div>`;
      }
      const { quizzes } = await API.get('/api/school/quizzes');
      return `<div class="stack">${quizzes.map((q) => `
        <div class="card tight" data-quiz="${esc(q.id)}">
          <div class="spread"><div><strong class="small">${esc(q.title)}</strong>
            <div class="tiny muted">${q.grade ? esc(t('grade')) + ' ' + q.grade : ''}</div></div><span class="muted">›</span></div>
        </div>`).join('') || empty('🎯', t('no_results'))}</div>`;
    },
    mount(root, ctx) {
      if (!ctx.params.id) {
        qsa('[data-quiz]', root).forEach((el) => el.onclick = () => { location.hash = '#/quizzes/' + el.dataset.quiz; });
        return;
      }
      const answers = [];
      qsa('[data-q]', root).forEach((card) => {
        qsa('[data-ans]', card).forEach((b) => b.onclick = () => {
          qsa('[data-ans]', card).forEach((x) => x.classList.add('ghost'));
          b.classList.remove('ghost'); b.classList.add('secondary');
          answers[Number(card.dataset.q)] = Number(b.dataset.ans);
        });
      });
      qs('#quizSubmit', root).onclick = async () => {
        const res = await API.post(`/api/school/quizzes/${ctx.params.id}/attempt`, { answers });
        qs('#quizResult', root).innerHTML = `<div class="card accent">
          <h3>${esc(t('your_score'))}: ${res.score}/${res.total}</h3>
          ${bar((res.score / res.total) * 100, res.score / res.total >= 0.6 ? 'ok' : 'warn')}
          ${(res.review || []).map((r) => `<div class="card tight" style="margin-top:8px">
            <div class="spread"><strong class="small">${r.correct ? '✅' : '❌'} ${esc(t('explanation'))}</strong></div>
            <div class="small">${esc(r.explanation || (r.correct ? t('correct') : t('wrong')))}</div>
          </div>`).join('')}
        </div>`;
        root.scrollTo({ top: 0, behavior: 'smooth' });
      };
    }
  };

  // =========================================================== attendance ====
  VIEWS.attendance = {
    id: 'attendance', icon: '✅', label: () => t('take_attendance'), roles: ['teacher', 'admin', 'principal'],
    async render(ctx) {
      const { classes } = await API.get('/api/school/classes');
      const classId = ctx.query.class || (classes[0] && classes[0].id);
      if (!classId) return `<div class="card">${empty('🏫', t('no_results'))}</div>`;
      const date = ctx.query.date || fmt.todayISO();
      const { class: cls, students } = await API.get(`/api/school/attendance?class_id=${encodeURIComponent(classId)}&date=${date}`);
      return `
      <div class="card tight">
        <div class="row">
          <select id="attClass" style="flex:1">${classes.map((c) => `<option value="${esc(c.id)}" ${c.id === classId ? 'selected' : ''}>${esc(c.grade)}-${esc(c.section)}</option>`).join('')}</select>
          <input type="date" id="attDate" value="${esc(date)}" style="flex:1"/>
        </div>
        <div class="row" style="margin-top:8px">
          <button class="btn sm secondary grow" id="allPresent">✓ ${esc(t('mark_all_present'))}</button>
          <button class="btn sm grow" id="saveAtt">${esc(t('save'))}</button>
        </div>
      </div>
      <div class="card">
        <div class="list" id="attList">
          ${students.map((s) => `<div class="list-item" data-stu="${esc(s.id)}">
            <div class="avatar">${esc(s.avatar || '🧑‍🎓')}</div>
            <div class="body"><div class="title">${esc(s.name_fa || s.name_en)}</div>
              <div class="tiny muted">${esc(t('absences'))}: ${s.absences || 0}</div></div>
          </div>
          <div class="segmented" style="margin:-4px 0 8px" data-status-for="${esc(s.id)}">
            ${[['present', t('present')], ['absent', t('absent')], ['late', t('late')], ['excused', t('excused')]]
              .map(([v, l]) => `<button data-st="${v}" class="${(s.status || 'present') === v ? 'active' : ''}">${esc(l)}</button>`).join('')}
          </div>`).join('') || empty('🧑‍🎓', t('no_results'))}
        </div>
      </div>`;
    },
    mount(root, ctx) {
      const state = {};
      qsa('[data-status-for]', root).forEach((seg) => {
        const id = seg.dataset.statusFor;
        state[id] = qsa('button.active', seg)[0]?.dataset.st || 'present';
        qsa('button', seg).forEach((b) => b.onclick = () => {
          qsa('button', seg).forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          state[id] = b.dataset.st;
        });
      });
      qs('#allPresent', root).onclick = () => {
        qsa('[data-status-for]', root).forEach((seg) => {
          qsa('button', seg).forEach((x) => x.classList.remove('active'));
          qsa('[data-st="present"]', seg)[0].classList.add('active');
          state[seg.dataset.statusFor] = 'present';
        });
      };
      qs('#attClass', root).onchange = (e) => { location.hash = `#/attendance?class=${e.target.value}&date=${qs('#attDate', root).value}`; };
      qs('#attDate', root).onchange = (e) => { location.hash = `#/attendance?class=${qs('#attClass', root).value}&date=${e.target.value}`; };
      qs('#saveAtt', root).onclick = async () => {
        const res = await API.post('/api/school/attendance', {
          class_id: qs('#attClass', root).value,
          date: qs('#attDate', root).value,
          entries: Object.entries(state).map(([student_id, st]) => ({ student_id, status: st }))
        });
        toast(res.queued ? t('saved_offline') : `${t('saved')} · ${res.absent} ${t('parent_notified')}`, res.queued ? 'warn' : 'ok');
      };
    }
  };

  // =============================================================== classes ==
  VIEWS.classes = {
    id: 'classes', icon: '🏫', label: () => t('classes'), roles: ['teacher', 'admin', 'principal'],
    async render(ctx) {
      if (ctx.params.id) {
        const { class: cls, students } = await API.get('/api/school/classes/' + ctx.params.id);
        return `
        <div class="card accent"><h2 style="margin:0">${esc(cls.grade)}-${esc(cls.section)}</h2>
          <div class="tiny">${esc(cls.room || '')} · ${students.length} ${esc(t('student'))}</div></div>
        ${students.map((s) => `<div class="card tight" data-stu="${esc(s.id)}">
          <div class="spread">
            <div class="row"><div class="avatar" style="width:34px;height:34px;font-size:16px">${esc(s.avatar || '🧑‍🎓')}</div>
              <div><strong class="small">${esc(s.name_fa || s.name_en)}</strong>
                <div class="tiny muted">${esc(t('absences'))}: ${s.absences || 0} · ${esc(t('submitted'))}: ${s.submissions || 0}</div></div></div>
            <button class="btn sm secondary" data-improve="${esc(s.id)}">＋ ${esc(t('add_improvement'))}</button>
          </div>
        </div>`).join('') || empty('🧑‍🎓', t('no_results'))}`;
      }
      const { classes } = await API.get('/api/school/classes');
      return `<div class="stack">${classes.map((c) => `<div class="card tight" data-cls="${esc(c.id)}">
        <div class="spread"><div><strong>${esc(c.grade)}-${esc(c.section)}</strong>
          <div class="tiny muted">${esc(c.room || '')} · ${c.students} ${esc(t('student'))}</div></div><span class="muted">›</span></div>
      </div>`).join('') || empty('🏫', t('no_results'))}</div>`;
    },
    mount(root, ctx) {
      qsa('[data-cls]', root).forEach((el) => el.onclick = () => { location.hash = '#/classes/' + el.dataset.cls; });
      qsa('[data-improve]', root).forEach((b) => b.onclick = () => VIEWS.classes.addImprovement(b.dataset.improve, (ctx.params && ctx.params.id) || null));
      qsa('[data-stu]', root).forEach((el) => el.onclick = (e) => {
        if (e.target.closest('button')) return;
        location.hash = '#/progress?child=' + el.dataset.stu;
      });
    },
    addImprovement(studentId, classId) {
      const body = h('div', {},
        UI.localisedInput('improvement_points'),
        UI.localisedInput('goal'),
        h('div', { class: 'form-grid' },
          h('div', { class: 'field' }, h('label', {}, t('category')), h('select', { id: 'impCat' },
            [['focus', t('focus_areas')], ['strength', t('strengths')], ['behavior', t('behavior')], ['skill', t('skill')], ['attendance', t('attendance')]].map(([v, l]) => h('option', { value: v }, l)))),
          h('div', { class: 'field' }, h('label', {}, t('severity')), h('select', { id: 'impSev' }, [['normal', t('normal')], ['high', t('high')], ['low', t('low')]].map(([v, l]) => h('option', { value: v }, l))))
        )
      );
      modal({
        title: t('add_improvement'), body,
        actions: [{
          label: t('save'), kind: '', onClick: async (close) => {
            const inputs = qsa('[data-lang]', body).map((i) => i.value.trim());
            await API.post('/api/school/improvement', {
              student_id: studentId, class_id: classId,
              text: { fa: inputs[0], ps: inputs[1], en: inputs[2] },
              goal: { fa: inputs[3], ps: inputs[4], en: inputs[5] },
              category: qs('#impCat', body).value,
              severity: qs('#impSev', body).value,
              due_date: fmt.addDays(fmt.todayISO(), 14)
            });
            close(); toast(t('saved'), 'ok'); APP.render();
          }
        }]
      });
    }
  };

  // ================================================================= admin ==
  VIEWS.admin = {
    id: 'admin', icon: '⚙️', label: () => t('admin'), roles: ['admin', 'principal'],
    async render(ctx) {
      const tab = ctx.query.tab || 'users';
      const tabs = [['users', t('users')], ['classes', t('classes')], ['timetable', t('timetable_builder')], ['reports', t('report_problem')], ['audit', t('audit')]];
      let inner = '';
      if (tab === 'users') {
        const { users } = await API.get('/api/users');
        inner = `
          <button class="btn block" id="addUser">＋ ${esc(t('add_user'))}</button>
          <button class="btn secondary block" id="importCsv">📥 ${esc(t('import_csv'))}</button>
          <button class="btn ghost block" id="exportCsv">📤 ${esc(t('export'))} CSV</button>
          <div class="card"><div class="list">
            ${users.map((u) => `<div class="list-item">
              <div class="avatar">${esc(u.avatar || '🙂')}</div>
              <div class="body"><div class="title">${esc(u.name_fa || u.username)}</div>
                <div class="sub">${esc(u.role)} · ${esc(u.username)}</div></div>
              <span class="chip ${u.is_active ? 'ok' : 'danger'}">${u.is_active ? '✓' : '✕'}</span>
            </div>`).join('')}
          </div></div>`;
      } else if (tab === 'classes') {
        const [{ classes }, { subjects }] = await Promise.all([API.get('/api/school/classes'), API.get('/api/school/subjects')]);
        inner = `
          <div class="card tight"><div class="row">
            <input type="text" id="newSubject" placeholder="${esc(t('subjects'))}" style="flex:1"/>
            <button class="btn sm" id="addSubject">＋</button></div></div>
          <div class="card tight"><div class="row">
            <input type="number" id="classGrade" placeholder="${esc(t('grade'))}" style="flex:1" min="1" max="12"/>
            <input type="text" id="classSection" placeholder="${esc(t('section'))}" style="flex:1" value="الف"/>
            <button class="btn sm" id="addClass">＋ ${esc(t('class'))}</button></div></div>
          <div class="card"><div class="list">
            ${classes.map((c) => `<div class="list-item"><div class="avatar">🏫</div>
              <div class="body"><div class="title">${esc(c.grade)}-${esc(c.section)}</div>
                <div class="sub">${esc(c.room || '')} · ${c.students || 0} ${esc(t('student'))}</div></div>
              <a class="btn sm ghost" href="#/classes/${esc(c.id)}">${esc(t('view_all'))}</a></div>`).join('')}
          </div></div>
          <div class="card tight"><div class="row wrap">${subjects.map((s) => chip(L(s.name_fa), 'outline')).join('')}</div></div>`;
      } else if (tab === 'timetable') {
        const [{ classes }, { subjects }] = await Promise.all([API.get('/api/school/classes'), API.get('/api/school/subjects')]);
        const { users } = await API.get('/api/users?role=teacher');
        const classId = ctx.query.class || (classes[0] && classes[0].id);
        const { slots } = classId ? await API.get('/api/school/timetable?class_id=' + classId) : { slots: [] };
        const days = I18N.weekdays().slice(0, 6);
        inner = `
          <div class="card tight"><select id="ttClass">${classes.map((c) => `<option value="${esc(c.id)}" ${c.id === classId ? 'selected' : ''}>${esc(c.grade)}-${esc(c.section)}</option>`).join('')}</select></div>
          <div class="card">
            ${days.map((d, day) => `<div style="margin-bottom:12px">
              <strong class="small">${esc(d)}</strong>
              ${[1, 2, 3, 4, 5, 6].map((p) => {
                const slot = slots.find((s) => s.day === day && s.period === p);
                return `<div class="row" style="margin-top:6px;gap:6px">
                  <span class="chip outline">${p}</span>
                  <select data-tt-sub="${day}-${p}" style="flex:1">
                    <option value="">—</option>
                    ${subjects.map((s) => `<option value="${esc(s.id)}" ${slot && slot.subject_id === s.id ? 'selected' : ''}>${esc(L(s.name_fa))}</option>`).join('')}
                  </select>
                  <select data-tt-teacher="${day}-${p}" style="flex:1">
                    <option value="">—</option>
                    ${users.map((u) => `<option value="${esc(u.id)}" ${slot && slot.teacher_id === u.id ? 'selected' : ''}>${esc(u.name_fa || u.username)}</option>`).join('')}
                  </select>
                </div>`;
              }).join('')}
            </div>`).join('')}
            <button class="btn block" id="saveTt">${esc(t('save'))}</button>
          </div>`;
      } else if (tab === 'reports') {
        const { reports } = await API.get('/api/school/reports');
        inner = reports.length ? reports.map((r) => `<div class="card tight">
          <div class="spread"><strong class="small">${esc(r.category)} · ${esc(r.severity)}</strong>
            ${chip(r.status, r.status === 'open' ? 'danger' : 'ok')}</div>
          <div class="small">${esc(r.text)}</div>
          <div class="tiny muted">${esc(fmt.ago(r.created_at))}</div>
          ${r.status === 'open' ? `<button class="btn sm block" data-close-report="${esc(r.id)}" style="margin-top:8px">✓ ${esc(t('done'))}</button>` : ''}
        </div>`).join('') : `<div class="card">${empty('✅', t('no_results'))}</div>`;
      } else {
        const { logs } = await API.get('/api/audit');
        inner = `<div class="card"><div class="list">
          ${logs.slice(0, 40).map((l) => `<div class="list-item"><div class="avatar">🧾</div>
            <div class="body"><div class="title small">${esc(l.action)}</div>
              <div class="sub">${esc(l.user_name || '')} · ${esc(fmt.ago(l.created_at))}</div></div></div>`).join('')}</div></div>`;
      }
      return `<div class="tabs">${tabs.map(([k, l]) => `<button onclick="location.hash='#/admin?tab=${k}'" class="${tab === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>${inner}`;
    },
    mount(root, ctx) {
      const tab = ctx.query.tab || 'users';
      if (tab === 'users') {
        qs('#addUser', root).onclick = () => {
          const body = h('div', {},
            h('div', { class: 'field' }, h('label', {}, t('name')), h('input', { type: 'text', id: 'uName' })),
            h('div', { class: 'field' }, h('label', {}, t('username')), h('input', { type: 'text', id: 'uUser' })),
            h('div', { class: 'field' }, h('label', {}, t('password')), h('input', { type: 'text', id: 'uPass', value: 'secret123' })),
            h('div', { class: 'field' }, h('label', {}, t('role')), h('select', { id: 'uRole' },
              ['student', 'teacher', 'parent', 'principal'].map((r) => h('option', { value: r }, t(r))))),
            h('div', { class: 'field' }, h('label', {}, t('class')), h('select', { id: 'uClass' }, h('option', { value: '' }, '—'))) 
          );
          API.get('/api/school/classes').then(({ classes }) => {
            qs('#uClass', body).innerHTML = '<option value="">—</option>' + classes.map((c) => `<option value="${c.id}">${c.grade}-${c.section}</option>`).join('');
          });
          modal({
            title: t('add_user'), body,
            actions: [{
              label: t('save'), kind: '', onClick: async (close) => {
                await API.post('/api/users', {
                  name: qs('#uName', body).value, username: qs('#uUser', body).value,
                  password: qs('#uPass', body).value, role: qs('#uRole', body).value,
                  class_id: qs('#uClass', body).value || undefined
                });
                close(); toast(t('saved'), 'ok'); APP.render();
              }
            }]
          });
        };
        qs('#importCsv', root).onclick = () => {
          const body = h('div', {},
            h('p', { class: 'small muted' }, 'username,name,role,class_id,parent_username,phone'),
            h('textarea', { id: 'csvData', style: { minHeight: '160px', fontFamily: 'monospace' } })
          );
          modal({
            title: t('import_csv'), body,
            actions: [{
              label: t('save'), kind: '', onClick: async (close) => {
                const lines = qs('#csvData', body).value.trim().split('\n').map((l) => l.split(','));
                const header = lines.shift().map((h2) => h2.trim());
                const rows = lines.map((cols) => Object.fromEntries(cols.map((c, i) => [header[i], c.trim()])));
                const res = await API.post('/api/users/import', { rows });
                close(); toast(`${res.created} ✓ / ${res.skipped} —`, 'ok'); APP.render();
              }
            }]
          });
        };
        qs('#exportCsv', root).onclick = async () => {
          const { users } = await API.get('/api/users');
          const csv = ['username,name,role,phone', ...users.map((u) => `${u.username},${u.name_fa || ''},${u.role},${u.phone || ''}`)].join('\n');
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
          a.download = 'users.csv'; a.click();
        };
      }
      if (tab === 'classes') {
        qs('#addSubject', root).onclick = async () => {
          const name = qs('#newSubject', root).value.trim();
          if (!name) return;
          await API.post('/api/school/subjects', { name });
          toast(t('saved'), 'ok'); APP.render();
        };
        qs('#addClass', root).onclick = async () => {
          await API.post('/api/school/classes', { grade: Number(qs('#classGrade', root).value || 1), section: qs('#classSection', root).value });
          toast(t('saved'), 'ok'); APP.render();
        };
      }
      if (tab === 'timetable') {
        qs('#ttClass', root).onchange = (e) => { location.hash = '#/admin?tab=timetable&class=' + e.target.value; };
        qs('#saveTt', root).onclick = async () => {
          const slots = [];
          for (let day = 0; day < 6; day++) {
            for (let p = 1; p <= 6; p++) {
              const sub = qs(`[data-tt-sub="${day}-${p}"]`, root);
              const teacher = qs(`[data-tt-teacher="${day}-${p}"]`, root);
              if (sub && sub.value) {
                slots.push({ day, period: p, subject_id: sub.value, teacher_id: teacher.value || null, start_time: '08:00', end_time: '08:45' });
              }
            }
          }
          await API.post('/api/school/timetable', { class_id: qs('#ttClass', root).value, slots, replace: true });
          toast(t('saved'), 'ok');
        };
      }
      qsa('[data-close-report]', root).forEach((b) => b.onclick = async () => {
        await API.patch('/api/school/reports/' + b.dataset.closeReport, { status: 'closed', response: 'Handled' });
        toast(t('saved'), 'ok'); APP.render();
      });
    }
  };
})(window);
