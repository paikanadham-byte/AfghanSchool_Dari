/* ===========================================================================
   API client — online/offline aware.
   GETs are cached (so the app keeps working with no signal), writes are queued
   in an outbox and replayed automatically when connectivity returns.
   =========================================================================== */
(function (global) {
  const CACHE_KEY = 'acs.cache.v2';
  const OUTBOX_KEY = 'acs.outbox.v2';
  const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

  const listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach((f) => f(data)); }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') ?? fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  const state = { online: navigator.onLine, syncing: false };

  async function request(method, path, body, opts = {}) {
    const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
    const init = {
      method,
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    };
    if (body !== undefined && !(body instanceof FormData)) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      init.body = body;
    }

    // ---- offline write: queue it and return an optimistic ack --------------
    if (isWrite && (!state.online || opts.queue === true)) {
      const queued = { id: 'q_' + Date.now() + Math.random().toString(36).slice(2, 6), method, path, body, createdAt: Date.now() };
      const outbox = readJSON(OUTBOX_KEY, []);
      outbox.push(queued);
      writeJSON(OUTBOX_KEY, outbox);
      emit('outbox', outbox.length);
      return { ok: true, queued: true, offline: true, id: queued.id };
    }

    try {
      const res = await fetch(path, init);
      if (res.status === 401) { emit('unauthorised'); throw new Error('unauthorised'); }
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { ok: false, error: text }; }
      if (!res.ok) {
        const err = new Error(data.error || ('http_' + res.status));
        err.status = res.status; err.data = data;
        throw err;
      }
      if (method === 'GET') {
        const cache = readJSON(CACHE_KEY, {});
        cache[path] = { ts: Date.now(), data };
        // keep the cache small on cheap phones
        const keys = Object.keys(cache);
        if (keys.length > 120) keys.slice(0, keys.length - 120).forEach((k) => delete cache[k]);
        writeJSON(CACHE_KEY, cache);
      }
      return data;
    } catch (err) {
      if (!state.online || err.message === 'Failed to fetch') {
        if (isWrite) {
          const outbox = readJSON(OUTBOX_KEY, []);
          outbox.push({ id: 'q_' + Date.now(), method, path, body, createdAt: Date.now() });
          writeJSON(OUTBOX_KEY, outbox);
          emit('outbox', outbox.length);
          return { ok: true, queued: true, offline: true };
        }
        const cache = readJSON(CACHE_KEY, {});
        const hit = cache[path];
        if (hit) return { ...hit.data, cached: true, cachedAt: hit.ts };
      }
      throw err;
    }
  }

  const API = {
    on, emit, state,
    get: (path, opts) => request('GET', path, undefined, opts),
    post: (path, body, opts) => request('POST', path, body, opts),
    patch: (path, body, opts) => request('PATCH', path, body, opts),
    del: (path, body, opts) => request('DELETE', path, body, opts),

    async upload(file, meta = {}) {
      const fd = new FormData();
      fd.append('file', file);
      Object.keys(meta).forEach((k) => fd.append(k, meta[k]));
      if (!state.online) return { ok: false, error: 'offline_upload_unsupported' };
      const res = await fetch('/api/files', { method: 'POST', body: fd, credentials: 'same-origin' });
      return res.json();
    },

    cache: {
      peek(path) {
        const hit = readJSON(CACHE_KEY, {})[path];
        return hit ? hit.data : null;
      },
      clear() { writeJSON(CACHE_KEY, {}); }
    },

    outbox: {
      list: () => readJSON(OUTBOX_KEY, []),
      size: () => readJSON(OUTBOX_KEY, []).length,
      async flush() {
        if (state.syncing || !state.online) return 0;
        const outbox = readJSON(OUTBOX_KEY, []);
        if (!outbox.length) return 0;
        state.syncing = true;
        emit('syncing', true);
        let sent = 0;
        const remaining = [];
        for (const item of outbox) {
          try {
            const res = await fetch(item.path, {
              method: item.method,
              headers: { 'Content-Type': 'application/json' },
              credentials: 'same-origin',
              body: item.body === undefined ? undefined : JSON.stringify(item.body)
            });
            if (res.ok) sent++;
            else if (res.status >= 400 && res.status < 500) sent++; // do not retry forever
            else remaining.push(item);
          } catch (e) { remaining.push(item); }
        }
        writeJSON(OUTBOX_KEY, remaining);
        state.syncing = false;
        emit('syncing', false);
        emit('outbox', remaining.length);
        if (sent) emit('synced', sent);
        return sent;
      }
    }
  };

  window.addEventListener('online', () => {
    state.online = true;
    emit('online');
    API.outbox.flush();
  });
  window.addEventListener('offline', () => { state.online = false; emit('offline'); });

  global.API = API;
})(window);
