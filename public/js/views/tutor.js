/* ===========================================================================
   AI tutor / health assistant — explains, teaches, never does the work
   =========================================================================== */
(function (global) {
  const { h, esc, qs, qsa, toast, modal, fmt, chip, chipIcon, empty } = UI;
  const VIEWS = (global.VIEWS = global.VIEWS || {});

  const state = { conversationId: null, messages: [], homeworkId: null, busy: false, lastMessageId: null };

  VIEWS.tutor = {
    id: 'tutor', icon: 'bot', label: () => (APP.session && APP.module === 'clinic' ? t('health_assistant') : t('tutor')), roles: ['*'],
    async render(ctx) {
      const isClinic = APP.module === 'clinic';
      state.homeworkId = ctx.query.hw || null;
      const contextCard = await VIEWS.tutor.contextCard(state.homeworkId);
      const greeting = await API.get('/api/ai/greeting?lang=' + I18N.lang + '&module=' + (isClinic ? 'clinic' : 'school'));
      if (!state.messages.length) {
        state.messages = [{ role: 'assistant', content: greeting.greeting }];
      }
      return `
      <div class="card accent">
        <div class="row">
          <div class="tile lg">${I(isClinic ? 'stethoscope' : 'bot')}</div>
          <div class="grow">
            <strong>${esc(isClinic ? t('health_assistant') : t('tutor'))}</strong>
            <div class="tiny">${esc(isClinic ? t('emergency_note') : t('tutor_intro'))}</div>
          </div>
          <button class="btn sm ghost" id="newChat">${esc(t('new_chat'))}</button>
        </div>
      </div>

      ${contextCard}

      <div class="card" id="chatBox" style="display:flex;flex-direction:column">
        <div class="chat" id="chatLog">
          ${state.messages.map((m) => `
            <div class="bubble ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.content)}
              ${m.role === 'assistant' ? `<div style="margin-top:6px"><button class="speak-btn" data-speak="${esc(m.content.slice(0, 40))}">${I('volume')} ${esc(t('read_aloud'))}</button></div>` : ''}
            </div>`).join('')}
        </div>
        <div class="suggestions" id="suggestions"></div>
        <div class="chat-input">
          <textarea id="chatText" placeholder="${esc(t('tutor_placeholder'))}"></textarea>
          <button class="btn" id="chatSend">${esc(t('send'))}</button>
        </div>
      </div>

      <div class="notice info">${esc(isClinic ? t('emergency_note') : t('tutor_help'))}</div>`;
    },

    async contextCard(homeworkId) {
      if (!homeworkId) return '';
      try {
        const data = await API.get('/api/school/homework/' + homeworkId);
        const hw = data.homework;
        return `<div class="card tight" style="border-color:var(--brand)">
          <div class="spread">
            <div style="min-width:0"><div class="tiny muted">${esc(t('about_task'))}</div>
              <strong class="small">${esc(L(hw.title))}</strong>
              <div class="tiny muted">${esc(L(hw.subject_fa) || '')} · ${esc(t('due'))}: ${esc(fmt.date(hw.due_at))}</div></div>
            <a class="btn sm ghost" href="#/homework/${esc(hw.id)}">${I('homework')}</a>
          </div>
          <div class="row wrap" style="margin-top:8px;gap:6px">
            <button class="btn sm secondary" data-ask="${esc(t('explain_task'))}">${I('bookOpen')} ${esc(t('explain_task'))}</button>
            <button class="btn sm secondary" data-ask="${esc(t('steps'))}">${I('compass')} ${esc(t('steps'))}</button>
            <button class="btn sm secondary" data-ask="${esc(t('similar_example'))}">${I('searchHelp')} ${esc(t('similar_example'))}</button>
          </div>
        </div>`;
      } catch (e) { return ''; }
    },

    mount(root) {
      const log = qs('#chatLog', root);
      const scroll = () => { log.scrollTop = log.scrollHeight; };
      scroll();

      const send = async (text) => {
        if (!text || state.busy) return;
        state.busy = true;
        state.messages.push({ role: 'user', content: text });
        qs('#chatText', root).value = '';
        VIEWS.tutor.paint(root);
        const typing = h('div', { class: 'bubble bot' }, h('div', { class: 'typing' }, h('i'), h('i'), h('i')));
        qs('#chatLog', root).appendChild(typing);
        qs('#chatLog', root).scrollTop = qs('#chatLog', root).scrollHeight;
        try {
          const res = await API.post('/api/ai/chat', {
            message: text,
            lang: I18N.lang,
            module: APP.module === 'clinic' ? 'clinic' : 'school',
            conversation_id: state.conversationId,
            homework_id: state.homeworkId
          });
          state.conversationId = res.conversation_id;
          state.lastMessageId = res.message_id;
          state.messages.push({ role: 'assistant', content: res.reply, id: res.message_id });
          VIEWS.tutor.paint(root, res.suggestions || []);
          if (res.meta && res.meta.provider === 'offline') {
            // offline engine — nothing extra to show
          }
        } catch (err) {
          state.messages.push({ role: 'assistant', content: '…' + t('error') + ': ' + err.message });
          VIEWS.tutor.paint(root);
        } finally {
          state.busy = false;
        }
      };

      qs('#chatSend', root).onclick = () => send(qs('#chatText', root).value.trim());
      qs('#chatText', root).onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(qs('#chatText', root).value.trim()); }
      };
      qsa('[data-ask]', root).forEach((b) => b.onclick = () => send(b.dataset.ask));
      qs('#newChat', root).onclick = () => {
        state.conversationId = null; state.messages = []; state.homeworkId = null;
        location.hash = '#/tutor';
        APP.render();
      };
      qsa('[data-speak]', root).forEach((b) => b.onclick = (e) => {
        const bubble = e.target.closest('.bubble');
        UI.speak(bubble.textContent.replace(t('read_aloud'), '').trim());
      });
      if (!state.messages.length) {
        // preload greeting
        API.get('/api/ai/greeting?lang=' + I18N.lang + '&module=' + APP.module).then((g) => {
          if (!state.messages.length) { state.messages = [{ role: 'assistant', content: g.greeting }]; VIEWS.tutor.paint(root); }
        });
      }
    },

    paint(root, suggestions = []) {
      const log = qs('#chatLog', root);
      if (!log) return;
      log.innerHTML = state.messages.map((m) => `
        <div class="bubble ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.content)}
          ${m.role === 'assistant' ? `<div style="margin-top:6px"><button class="speak-btn" data-speak="1">${I('volume')} ${esc(t('read_aloud'))}</button></div>` : ''}
        </div>`).join('');
      qsa('[data-speak]', log).forEach((b) => b.onclick = (e) => {
        UI.speak(e.target.closest('.bubble').textContent.replace(t('read_aloud'), '').trim());
      });
      const box = qs('#suggestions', root);
      if (box && suggestions.length) {
        box.innerHTML = suggestions.map((s) => `<button data-sug="${esc(s)}">${esc(s)}</button>`).join('');
        qsa('[data-sug]', box).forEach((b) => b.onclick = () => {
          qs('#chatText', root).value = b.dataset.sug;
          qs('#chatSend', root).click();
        });
      }
      log.scrollTop = log.scrollHeight;
    }
  };
})(window);
