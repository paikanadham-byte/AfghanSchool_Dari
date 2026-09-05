/* ===========================================================================
   Shared views: sign-in, notifications, messages, calendar, tasks, profile
   =========================================================================== */
(function (global) {
  const { h, esc, qs, qsa, toast, modal, closeModal, confirmDialog, fmt, chip, empty, bar, stat, skeleton } = UI;
  const VIEWS = (global.VIEWS = global.VIEWS || {});

  // ----------------------------------------------------------------- login --
  VIEWS.login = {
    id: 'login',
    chrome: false,
    render() {
      return `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-logo">📚</div>
          <div class="login-title">${esc(t('app_name'))}</div>
          <div class="login-sub">${esc(t('tagline'))}</div>
          <div class="lang-switch" style="background:#eef1f6; margin-bottom:12px; justify-content:center">
            ${['fa', 'ps', 'en'].map((l) => `<button data-lang="${l}" class="${I18N.lang === l ? 'active' : ''}" style="color:${I18N.lang === l ? '#0b4d8c' : '#5b6785'}">${esc({ fa: 'دری', ps: 'پښتو', en: 'EN' }[l])}</button>`).join('')}
          </div>
          <form id="loginForm" class="stack">
            <div class="field"><label>${esc(t('username'))}</label>
              <input type="text" id="loginUser" autocomplete="username" placeholder="demo.student5a1" required/></div>
            <div class="field"><label>${esc(t('password'))}</label>
              <input type="password" id="loginPass" autocomplete="current-password" placeholder="demo1234" required/></div>
            <button class="btn block" type="submit">${esc(t('login'))}</button>
            <div id="loginError" class="notice hidden"></div>
          </form>
          <div class="divider"></div>
          <div class="tiny muted">${esc(t('demo_hint'))}</div>
          <div class="demo-grid" id="demoGrid"></div>
        </div>
      </div>`;
    },
    async mount(root) {
      qsa('[data-lang]', root).forEach((b) => b.onclick = () => { I18N.set(b.dataset.lang); APP.render(); });
      const form = qs('#loginForm', root);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const errBox = qs('#loginError', root);
        errBox.classList.add('hidden');
        try {
          const res = await API.post('/api/auth/login', {
            username: qs('#loginUser', root).value.trim(),
            password: qs('#loginPass', root).value
          });
          APP.setSession(res);
          toast(t('welcome_back') + ' 👋', 'ok');
          location.hash = '#/home';
          APP.render();
        } catch (err) {
          errBox.textContent = err.message === 'bad_credentials' ? (I18N.lang === 'en' ? 'Wrong username or password' : 'نام کاربری یا رمز اشتباه است') : err.message;
          errBox.classList.remove('hidden');
        }
      };
      const grid = qs('#demoGrid', root);
      try {
        const { accounts } = await API.get('/api/auth/demo');
        const labels = {
          admin: '🧑‍💼 مدیر', principal: '🏫 مدیر مکتب', teacher: '👨‍🏫 استاد', student: '🧑‍🎓 شاگرد',
          parent: '👨‍👩‍👧 والدین', doctor: '👨‍⚕️ داکتر', nurse: '💉 نرس', receptionist: '🛎️ استقبال',
          pharmacist: '💊 دواساز', lab_tech: '🔬 لابراتوار', clinic_admin: '🏥 مدیر کلینیک', patient: '🧕 مریض'
        };
        grid.innerHTML = accounts.map((a) => `<button data-u="${esc(a.username)}">${esc(labels[a.role] || a.role)}<br><span class="tiny muted">${esc(a.username.replace('demo.', ''))}</span></button>`).join('');
        qsa('button', grid).forEach((b) => b.onclick = async () => {
          try {
            const res = await API.post('/api/auth/login', { username: b.dataset.u, password: 'demo1234' });
            APP.setSession(res); toast(t('welcome_back') + ' 👋', 'ok'); location.hash = '#/home'; APP.render();
          } catch (err) { toast(err.message, 'err'); }
        });
      } catch (e) { grid.innerHTML = ''; }
    }
  };

  // ---------------------------------------------------------- notifications --
  VIEWS.notifications = {
    id: 'notifications', icon: '🔔', label: () => t('notifications'), roles: ['*'],
    async render() {
      const { notifications } = await API.get('/api/notifications?limit=60');
      if (!notifications.length) return `<div class="card">${empty('🔕', t('no_results'))}</div>`;
      return notifications.map((n) => `
        <div class="card tight ${n.read_at ? '' : 'accent'}" data-read="${n.id}">
          <div class="spread">
            <strong style="font-size:.92rem">${esc(L(n.title))}</strong>
            <span class="tiny muted">${esc(fmt.ago(n.created_at))}</span>
          </div>
          <div class="small muted">${esc(L(n.body))}</div>
          ${n.data && n.data.homeworkId ? `<div style="margin-top:8px"><a class="btn sm secondary" href="#/homework/${esc(n.data.homeworkId)}">${esc(t('view_all'))}</a></div>` : ''}
        </div>`).join('');
    },
    mount(root) {
      qsa('[data-read]', root).forEach((card) => card.onclick = async () => {
        const id = card.dataset.read;
        await API.post('/api/notifications/read', { ids: [id] });
        card.classList.remove('accent');
        APP.refreshBadge();
      });
      API.post('/api/notifications/read', { ids: [] }).then(() => APP.refreshBadge());
    }
  };

  // --------------------------------------------------------------- messages --
  VIEWS.messages = {
    id: 'messages', icon: '💬', label: () => t('messages'), roles: ['*'],
    async render(ctx) {
      if (ctx.params.id) {
        const { thread, messages } = await API.get(`/api/threads/${ctx.params.id}/messages`);
        return `
          <div class="card">
            <div class="spread"><strong>${esc(thread.subject || t('messages'))}</strong>
              <a href="#/messages" class="tiny">${esc(t('back'))}</a></div>
          </div>
          <div class="card" id="threadBody" style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow:auto">
            ${messages.map((m) => `
              <div class="bubble ${m.sender_id === APP.session.user.id ? 'user' : 'bot'}">
                ${m.sender_id !== APP.session.user.id ? `<div class="tiny" style="opacity:.7">${esc(m.sender?.name_fa || '')}</div>` : ''}
                ${esc(m.body)}
                <div class="tiny" style="opacity:.65;margin-top:4px">${esc(fmt.ago(m.created_at))}</div>
              </div>`).join('') || empty('💬', t('empty_general'))}
          </div>
          <div class="card tight">
            <div class="chat-input">
              <textarea id="msgText" placeholder="${esc(t('write_here'))}"></textarea>
              <button class="btn" id="msgSend">${esc(t('send'))}</button>
            </div>
          </div>`;
      }
      const { threads } = await API.get('/api/threads');
      if (!threads.length) return `<div class="card">${empty('💬', t('empty_general'))}</div>`;
      return `<div class="card"><div class="list">${threads.map((th) => `
        <div class="list-item" data-thread="${th.id}">
          <div class="avatar">💬</div>
          <div class="body">
            <div class="title">${esc(th.others.map((o) => o.name).join(', ') || th.subject || t('messages'))}</div>
            <div class="sub truncate">${esc(th.last_message ? th.last_message.body : (th.subject || ''))}</div>
          </div>
          <span class="tiny muted">${esc(th.last_message ? fmt.ago(th.last_message.created_at) : '')}</span>
        </div>`).join('')}</div></div>
        <button class="btn secondary block" id="newThread">＋ ${esc(t('messages'))}</button>`;
    },
    async mount(root, ctx) {
      if (ctx.params.id) {
        const body = qs('#threadBody', root);
        if (body) body.scrollTop = body.scrollHeight;
        qs('#msgSend', root).onclick = async () => {
          const text = qs('#msgText', root).value.trim();
          if (!text) return;
          await API.post(`/api/threads/${ctx.params.id}/messages`, { body: text });
          qs('#msgText', root).value = '';
          APP.render();
        };
        return;
      }
      qsa('[data-thread]', root).forEach((el) => el.onclick = () => { location.hash = '#/messages/' + el.dataset.thread; });
      const btn = qs('#newThread', root);
      if (btn) btn.onclick = () => {
        API.get('/api/users').then(({ users }) => {
          const body = h('div', {},
            h('div', { class: 'field' }, h('label', {}, t('subject')), h('input', { type: 'text', id: 'thSubject' })),
            h('div', { class: 'field' }, h('label', {}, t('student') + ' / ' + t('teacher')),
              h('select', { id: 'thUser' }, users.map((u) => h('option', { value: u.id }, `${u.name_fa || u.username} (${u.role})`)))),
            h('div', { class: 'field' }, h('label', {}, t('send')), h('textarea', { id: 'thMsg' }))
          );
          modal({
            title: t('messages'),
            body,
            actions: [{
              label: t('send'), kind: '', onClick: async (close) => {
                const subject = qs('#thSubject', body).value;
                const participants = [qs('#thUser', body).value];
                const message = qs('#thMsg', body).value;
                await API.post('/api/threads', { subject, participants, message });
                close(); APP.render();
              }
            }]
          });
        }).catch(() => toast(t('error'), 'err'));
      };
    }
  };

  // --------------------------------------------------------------- calendar --
  VIEWS.calendar = {
    id: 'calendar', icon: '📅', label: () => t('calendar'), roles: ['*'],
    async render() {
      const [{ events }, { announcements }] = await Promise.all([
        API.get(`/api/calendar?from=${fmt.addDays(fmt.todayISO(), -30)}&to=${fmt.addDays(fmt.todayISO(), 180)}`),
        API.get('/api/announcements?limit=20')
      ]);
      const icons = { holiday: '🎉', exam: '📝', event: '📌', vacation: '🏖️', deadline: '⏰', camp: '🏕️' };
      const kinds = { holiday: 'ok', exam: 'danger', event: 'info', vacation: 'warn', deadline: 'info' };
      const upcoming = events.map((e) => `
        <div class="card tight">
          <div class="spread">
            <div><span style="font-size:18px">${icons[e.type] || '📌'}</span>
              <strong style="font-size:.95rem">${esc(L(e.title))}</strong></div>
            ${chip(fmt.date(e.date), kinds[e.type] || 'grey')}
          </div>
          <div class="tiny muted">${esc(fmt.weekday(e.date))} · ${esc(fmt.gregorian(e.date))}</div>
          ${e.body ? `<div class="small" style="margin-top:6px">${esc(L(e.body))}</div>` : ''}
        </div>`).join('') || empty('📅', t('no_results'));

      const anns = announcements.map((a) => `
        <div class="card tight ${a.is_pinned ? 'accent' : ''}">
          <div class="spread"><strong style="font-size:.94rem">${esc(L(a.title))}</strong>
            <span class="tiny muted">${esc(fmt.ago(a.published_at))}</span></div>
          <div class="small">${esc(L(a.body))}</div>
        </div>`).join('') || '';

      return `<div class="section-title">${esc(t('events'))}</div>${upcoming}
        ${anns ? `<div class="section-title" style="margin-top:6px">${esc(t('announcements'))}</div>${anns}` : ''}`;
    }
  };

  // ------------------------------------------------------------------ tasks --
  VIEWS.tasks = {
    id: 'tasks', icon: '✅', label: () => t('tasks'), roles: ['student', 'teacher', 'parent', 'admin', 'principal'],
    async render() {
      const { tasks } = await API.get('/api/school/tasks');
      const open = tasks.filter((x) => !x.is_done);
      const done = tasks.filter((x) => x.is_done);
      return `
        <div class="card tight">
          <div class="row">
            <input type="text" id="taskTitle" placeholder="${esc(t('add'))}…" style="flex:1"/>
            <button class="btn sm" id="taskAdd">＋</button>
          </div>
          <div class="row" style="margin-top:8px">
            <input type="date" id="taskDue" style="flex:1"/>
            <select id="taskPriority"><option value="normal">${esc(t('normal'))}</option><option value="high">${esc(t('high'))}</option><option value="low">${esc(t('low'))}</option></select>
          </div>
        </div>
        <div class="section-title">${esc(t('todo'))} (${open.length})</div>
        ${open.length ? `<div class="card"><div class="list">${open.map((x2) => `
          <div class="list-item">
            <div class="avatar"><input type="checkbox" data-done="${x2.id}" ${x2.is_done ? 'checked' : ''} style="width:22px;height:22px"/></div>
            <div class="body"><div class="title">${esc(x2.title)}</div>
              <div class="sub">${x2.due_date ? esc(fmt.date(x2.due_date)) : ''} ${x2.priority === 'high' ? chip(t('high'), 'danger') : ''}</div></div>
            <button class="icon-btn" data-del="${x2.id}" style="background:#fdeaea;color:#dc2626">🗑</button>
          </div>`).join('')}</div></div>` : `<div class="card">${empty('✅', t('no_results'))}</div>`}
        ${done.length ? `<div class="section-title">${esc(t('done'))}</div><div class="card"><div class="list">${done.map((x2) => `
          <div class="list-item"><div class="avatar"><input type="checkbox" data-done="${x2.id}" checked style="width:22px;height:22px"/></div>
          <div class="body"><div class="title" style="text-decoration:line-through;opacity:.6">${esc(x2.title)}</div></div>
          <button class="icon-btn" data-del="${x2.id}" style="background:#f4f6fb;color:#8b95ad">🗑</button></div>`).join('')}</div></div>` : ''}`;
    },
    mount(root) {
      qs('#taskAdd', root).onclick = async () => {
        const title = qs('#taskTitle', root).value.trim();
        if (!title) return;
        await API.post('/api/school/tasks', { title, due_date: qs('#taskDue', root).value || null, priority: qs('#taskPriority', root).value });
        APP.render();
      };
      qsa('[data-done]', root).forEach((cb) => cb.onchange = async () => {
        await API.patch('/api/school/tasks/' + cb.dataset.done, { is_done: cb.checked });
        APP.render();
      });
      qsa('[data-del]', root).forEach((b) => b.onclick = async () => {
        await API.del('/api/school/tasks/' + b.dataset.del);
        APP.render();
      });
    }
  };

  // ---------------------------------------------------------------- profile --
  VIEWS.profile = {
    id: 'profile', icon: '👤', label: () => t('profile'), roles: ['*'],
    async render() {
      const s = APP.session;
      const name = s.view.name_fa || s.view.username;
      const prefs = s.user.prefs || {};
      const roleLabel = {
        student: t('student'), teacher: t('teacher'), parent: t('parent'), admin: t('admin'), principal: t('principal'),
        doctor: t('doctor'), nurse: t('nurse'), receptionist: t('receptionist'), pharmacist: t('pharmacist'),
        lab_tech: t('lab_tech'), patient: t('patients'), clinic_admin: t('admin')
      }[s.view.role] || s.view.role;
      return `
        <div class="card">
          <div class="row">
            <div class="avatar-lg">${esc(s.view.avatar || '🙂')}</div>
            <div class="grow">
              <h2 style="margin:0">${esc(name)}</h2>
              <div class="small muted">${esc(roleLabel)} · ${esc(L(s.org?.name_fa) || '')}</div>
            </div>
          </div>
          ${s.is_viewing_child ? `<div style="margin-top:10px"><button class="btn secondary block" id="backToParent">${esc(t('back_to_parent'))}</button></div>` : ''}
        </div>

        <div class="card">
          <h3>${esc(t('language'))}</h3>
          <div class="segmented" id="langSeg">
            <button data-l="fa" class="${I18N.lang === 'fa' ? 'active' : ''}">دری</button>
            <button data-l="ps" class="${I18N.lang === 'ps' ? 'active' : ''}">پښتو</button>
            <button data-l="en" class="${I18N.lang === 'en' ? 'active' : ''}">English</button>
          </div>
        </div>

        <div class="card">
          <h3>${esc(t('appearance'))}</h3>
          <div class="kv"><span class="k">${esc(t('lite_mode'))}</span><input type="checkbox" id="prefLite" ${prefs.lite ? 'checked' : ''} style="width:22px;height:22px"/></div>
          <div class="kv"><span class="k">${esc(t('large_text'))}</span><input type="checkbox" id="prefBig" ${prefs.big ? 'checked' : ''} style="width:22px;height:22px"/></div>
          <div class="kv"><span class="k">${esc(t('read_aloud_mode'))}</span><input type="checkbox" id="prefSpeak" ${prefs.speak !== false ? 'checked' : ''} style="width:22px;height:22px"/></div>
        </div>

        <div class="card">
          <h3>${esc(t('change_password'))}</h3>
          <div class="field"><label>${esc(t('current_password'))}</label><input type="password" id="pwCurrent"/></div>
          <div class="field"><label>${esc(t('new_password'))}</label><input type="password" id="pwNew"/></div>
          <button class="btn secondary block" id="pwSave">${esc(t('save'))}</button>
        </div>

        ${s.user.role === 'parent' ? `<div class="card">
          <h3>${esc(t('child_pin'))}</h3>
          <div class="tiny muted">${esc(t('pin_hint'))}</div>
          <div class="field"><label>${esc(t('student'))}</label>
            <select id="pinChild">${s.children.map((c) => `<option value="${esc(c.id)}">${esc(c.name_fa || c.name_en)}</option>`).join('')}</select></div>
          <div class="field"><label>PIN</label><input type="text" id="pinValue" inputmode="numeric" maxlength="6" placeholder="1234"/></div>
          <button class="btn secondary block" id="pinSave">${esc(t('save'))}</button>
        </div>` : ''}

        <div class="card">
          <h3>${esc(t('about'))}</h3>
          <div class="kv"><span class="k">${esc(t('version'))}</span><span class="v">2.0.0</span></div>
          <div class="kv"><span class="k">${esc(t('offline'))}</span><span class="v">${navigator.onLine ? '—' : '✓'}</span></div>
          <div class="kv"><span class="k">${esc(t('install'))}</span><span class="v"><button class="btn sm secondary" id="installBtn">${esc(t('install'))}</button></span></div>
        </div>

        <button class="btn danger block" id="logoutBtn">${esc(t('logout'))}</button>
        <div class="center tiny muted" style="padding:8px">
          <a href="/legacy">نسخهٔ قدیمی (Legacy prototype)</a>
        </div>`;
    },
    mount(root) {
      qsa('#langSeg button', root).forEach((b) => b.onclick = () => { I18N.set(b.dataset.l); APP.render(); });
      const savePref = async () => {
        const prefs = {
          lite: qs('#prefLite', root).checked,
          big: qs('#prefBig', root).checked,
          speak: qs('#prefSpeak', root).checked
        };
        APP.applyPrefs(prefs);
        await API.post('/api/auth/prefs', { prefs });
      };
      ['prefLite', 'prefBig', 'prefSpeak'].forEach((id) => { const el = qs('#' + id, root); if (el) el.onchange = savePref; });

      qs('#pwSave', root).onclick = async () => {
        try {
          await API.post('/api/auth/password', { current: qs('#pwCurrent', root).value, next: qs('#pwNew', root).value });
          toast(t('password_changed'), 'ok'); qs('#pwCurrent', root).value = ''; qs('#pwNew', root).value = '';
        } catch (e) { toast(e.message, 'err'); }
      };
      const pinSave = qs('#pinSave', root);
      if (pinSave) pinSave.onclick = async () => {
        await API.post('/api/auth/child-pin', { studentId: qs('#pinChild', root).value, pin: qs('#pinValue', root).value });
        toast(t('saved'), 'ok');
      };
      const back = qs('#backToParent', root);
      if (back) back.onclick = async () => {
        const res = await API.post('/api/auth/clear-view', {});
        APP.setSession(res); APP.render();
      };
      qs('#logoutBtn', root).onclick = async () => {
        await API.post('/api/auth/logout', {});
        APP.session = null; API.cache.clear();
        location.hash = '#/login'; APP.render();
      };
      qs('#installBtn', root).onclick = () => { if (APP.installPrompt) APP.installPrompt.prompt(); else toast(t('installed'), 'ok'); };
    }
  };

  // ------------------------------------------------------------------ more --
  VIEWS.more = {
    id: 'more', icon: '☰', label: () => t('more'), roles: ['*'], hidden: true,
    render() {
      const items = APP.menuForRole().filter((v) => !v.hidden);
      return `<div class="card"><div class="list">${items.map((v) => `
        <div class="list-item" data-go="${v.id}">
          <div class="avatar">${v.icon || '•'}</div>
          <div class="body"><div class="title">${esc(v.label())}</div></div>
          <span class="muted">›</span>
        </div>`).join('')}</div></div>`;
    },
    mount(root) {
      qsa('[data-go]', root).forEach((el) => el.onclick = () => { location.hash = '#/' + el.dataset.go; });
    }
  };
})(window);
