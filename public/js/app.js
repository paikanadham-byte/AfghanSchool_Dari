/* ===========================================================================
   App shell — router, navigation, session, offline status
   =========================================================================== */
(function (global) {
  const { h, esc, qs, qsa, toast } = UI;

  const NAV = {
    student: ['home', 'homework', 'timetable', 'tutor', 'more'],
    parent: ['home', 'homework', 'timetable', 'messages', 'more'],
    teacher: ['home', 'homework', 'classes', 'attendance', 'more'],
    admin: ['home', 'classes', 'admin', 'calendar', 'more'],
    principal: ['home', 'classes', 'admin', 'calendar', 'more'],
    doctor: ['home', 'queue', 'patients', 'tutor', 'more'],
    nurse: ['home', 'queue', 'patients', 'pharmacy', 'more'],
    receptionist: ['home', 'queue', 'patients', 'appointments', 'more'],
    pharmacist: ['home', 'pharmacy', 'patients', 'queue', 'more'],
    lab_tech: ['home', 'patients', 'queue', 'more', 'more'],
    clinic_admin: ['home', 'queue', 'patients', 'pharmacy', 'more'],
    patient: ['home', 'appointments', 'pharmacy', 'tutor', 'more']
  };

  const APP = {
    session: null,
    module: 'school',
    state: { childId: null },
    installPrompt: null,

    async boot() {
      const saved = localStorage.getItem('acs.lang');
      I18N.init(saved || 'fa');
      APP.applyPrefs(JSON.parse(localStorage.getItem('acs.prefs') || '{}'));

      window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); APP.installPrompt = e; });
      window.addEventListener('hashchange', () => APP.render());
      API.on('unauthorised', () => { APP.session = null; APP.render(); });
      API.on('offline', () => APP.updateOfflineBar());
      API.on('online', () => { APP.updateOfflineBar(); toast(t('online'), 'ok'); });
      API.on('outbox', () => APP.updateOfflineBar());
      API.on('synced', (n) => toast(`${n} ✓ ${t('synced')}`, 'ok'));

      if (!location.hash) location.hash = '#/home';
      try {
        const me = await API.get('/api/auth/me');
        APP.setSession(me);
      } catch (e) {
        APP.session = null;
      }
      APP.render();
      setTimeout(() => qs('#splash')?.classList.add('hidden'), 250);
      if (API.outbox.size()) APP.outboxFlushSoon();
    },

    outboxFlushSoon() { setTimeout(() => API.outbox.flush(), 1500); },

    setSession(res) {
      APP.session = res;
      APP.module = res.module || 'school';
      document.body.classList.toggle('clinic', APP.module === 'clinic');
      if (res.view?.lang && res.view.lang !== I18N.lang && !localStorage.getItem('acs.lang')) I18N.set(res.view.lang);
    },

    applyPrefs(prefs) {
      document.body.classList.toggle('lite', !!prefs.lite);
      document.body.classList.toggle('big', !!prefs.big);
      localStorage.setItem('acs.prefs', JSON.stringify(prefs));
    },

    parseHash() {
      const raw = location.hash.replace(/^#/, '') || '/home';
      const [path, queryStr] = raw.split('?');
      const parts = path.split('/').filter(Boolean);
      return {
        route: parts[0] || 'home',
        param: parts[1] || null,
        query: Object.fromEntries(new URLSearchParams(queryStr || ''))
      };
    },

    viewFor(route) {
      let key = route;
      if (key === 'home' && APP.module === 'clinic') key = 'home_clinic';
      if (key === 'home_clinic' && APP.module !== 'clinic') key = 'home';
      return VIEWS[key] || VIEWS.home;
    },

    menuForRole() {
      const role = APP.session?.view?.role || 'student';
      const all = Object.values(VIEWS).filter((v) => v.id && v.id !== 'login');
      return all.filter((v) => {
        const roles = v.roles || [];
        if (roles.includes('*')) return true;
        return roles.includes(role) || (role === 'parent' && roles.includes('student'));
      });
    },

    async render() {
      const root = qs('#app');
      root.classList.remove('hidden');

      if (!APP.session) {
        const view = VIEWS.login;
        root.innerHTML = view.render();
        await view.mount(root, { params: {}, query: {} });
        return;
      }

      const { route, param, query } = APP.parseHash();
      const view = APP.viewFor(route);
      const ctx = { params: { id: param }, query };

      root.innerHTML = `
        ${APP.topbar()}
        <main id="main">${UI.skeleton(3)}</main>
        ${APP.bottomnav(route)}
      `;
      qsa('[data-lang-btn]', root).forEach((b) => b.onclick = () => { I18N.set(b.dataset.langBtn); APP.render(); });
      const bell = qs('#bellBtn', root);
      if (bell) bell.onclick = () => { location.hash = '#/notifications'; };
      const menuBtn = qs('#menuBtn', root);
      if (menuBtn) menuBtn.onclick = () => { location.hash = '#/profile'; };
      const backBtn = qs('#backChild', root);
      if (backBtn) backBtn.onclick = async () => {
        const res = await API.post('/api/auth/clear-view', {});
        APP.setSession(res); APP.render();
      };
      qsa('[data-nav]', root).forEach((b) => b.onclick = () => { location.hash = '#/' + b.dataset.nav; });

      const main = qs('#main', root);
      try {
        const content = await view.render(ctx);
        main.innerHTML = typeof content === 'string' ? content : '';
        if (typeof content !== 'string') main.appendChild(content);
        if (view.mount) await view.mount(main, ctx);
        if (view.id === 'homework' && param) await VIEWS.homework.mountDetail(main, param);
      } catch (err) {
        console.error(err);
        main.innerHTML = `<div class="card">
          <div class="empty"><span class="emoji">⚠️</span>${esc(err.message || 'error')}</div>
          <button class="btn block" onclick="location.reload()">${esc(t('retry'))}</button>
        </div>`;
      }
      APP.refreshBadge();
      APP.updateOfflineBar();
      window.scrollTo({ top: 0 });
    },

    topbar() {
      const s = APP.session;
      const unread = s.unread?.total || 0;
      const isChild = s.is_viewing_child;
      const orgName = L(s.org?.name_fa) || '';
      return `
      <header class="topbar">
        <div class="row">
          <div class="brand"><span class="logo">${APP.module === 'clinic' ? '🏥' : '📚'}</span>
            <span class="truncate">${esc(orgName || t('app_name'))}</span></div>
          <div class="grow"></div>
          <div class="lang-switch">
            ${['fa', 'ps', 'en'].map((l) => `<button data-lang-btn="${l}" class="${I18N.lang === l ? 'active' : ''}">${esc({ fa: 'دری', ps: 'پښ', en: 'EN' }[l])}</button>`).join('')}
          </div>
          <button class="icon-btn" id="bellBtn">🔔${unread ? `<span class="badge-dot">${unread}</span>` : ''}</button>
          <button class="icon-btn" id="menuBtn">${esc(s.view?.avatar || '👤')}</button>
        </div>
        ${isChild ? `<div class="row" style="margin-top:8px">
          <span class="hero-badge">👦 ${esc(s.view.name_fa || '')}</span>
          <div class="grow"></div>
          <button class="hero-badge" id="backChild" style="border:0;cursor:pointer">${esc(t('back_to_parent'))}</button>
        </div>` : ''}
      </header>`;
    },

    bottomnav(activeRoute) {
      const role = APP.session?.view?.role || 'student';
      const items = (NAV[role] || NAV.student);
      const view = APP.viewFor(activeRoute);
      const activeId = view.id === 'home_clinic' ? 'home' : view.id;
      const icons = { home: '🏠', homework: '📝', timetable: '🗓', tutor: '🤖', more: '☰', classes: '🏫', admin: '⚙️', calendar: '📅', messages: '💬', attendance: '✅', queue: '🎫', patients: '🗂', pharmacy: '💊', appointments: '📅' };
      return `<nav class="bottomnav">
        ${[...new Set(items)].map((key) => {
          const v = APP.viewFor(key);
          return `<button data-nav="${key}" class="${activeId === key ? 'active' : ''}">
            <span class="ic">${icons[key] || '•'}</span><span>${esc(v.label ? v.label() : key)}</span>
          </button>`;
        }).join('')}
      </nav>`;
    },

    async refreshBadge() {
      if (!APP.session) return;
      try {
        const res = await API.get('/api/notifications?limit=1');
        APP.session.unread = { total: res.unread };
        const bell = qs('#bellBtn');
        if (bell) {
          const dot = bell.querySelector('.badge-dot');
          if (res.unread) {
            if (dot) dot.textContent = res.unread;
            else bell.insertAdjacentHTML('beforeend', `<span class="badge-dot">${res.unread}</span>`);
          } else if (dot) dot.remove();
        }
      } catch (e) { /* offline */ }
    },

    updateOfflineBar() {
      const bar = qs('#offline-bar');
      const text = qs('#offline-text');
      if (!bar) return;
      const pending = API.outbox.size();
      if (!navigator.onLine || pending) {
        bar.classList.remove('hidden');
        const label = navigator.onLine ? `${pending} ${t('syncing')}` : t('offline');
        text.textContent = pending ? `${label} · ${pending}` : label;
        if (navigator.onLine && pending) APP.outboxFlushSoon();
      } else {
        bar.classList.add('hidden');
      }
    }
  };

  global.APP = APP;
  document.addEventListener('DOMContentLoaded', () => APP.boot());
})(window);
