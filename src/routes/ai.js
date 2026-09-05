'use strict';
const express = require('express');
const { get, all, insert, update, remove } = require('../db');
const U = require('../util');
const A = require('../auth');
const engine = require('../ai/engine');
const { ok, fail, wrap, q } = require('../http');

const router = express.Router();

function buildContext(auth, body) {
  const context = {};
  if (body.homework_id) {
    const hw = get(
      `SELECT h.*, sub.name_fa AS subject_fa, sub.name_ps AS subject_ps, sub.name_en AS subject_en
       FROM homework h LEFT JOIN subjects sub ON sub.id = h.subject_id WHERE h.id = ?`, [body.homework_id]
    );
    if (hw) {
      context.homework = {
        id: hw.id, title: hw.title, instructions: hw.instructions,
        subject_name: U.J.stringify({ fa: hw.subject_fa, ps: hw.subject_ps, en: hw.subject_en }),
        due_at: hw.due_at, est_minutes: hw.est_minutes, max_points: hw.max_points,
        ai_help: hw.ai_help
      };
      context.subject = U.J.stringify({ fa: hw.subject_fa, ps: hw.subject_ps, en: hw.subject_en });
    }
  }
  if (body.patient_id && A.canViewPatient(auth, body.patient_id)) {
    const patient = get('SELECT id, full_name, sex, dob, allergies, conditions FROM patients WHERE id = ?', [body.patient_id]);
    if (patient) context.patient = { id: patient.id, age: U.ageFromDob(patient.dob) };
  }
  if (body.prefer_llm !== undefined) context.preferLLM = q.bool(body.prefer_llm, true);
  return context;
}

router.post('/chat', wrap(async (req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const { user, view } = req.auth;
  const message = q.str(req.body.message).slice(0, 2000);
  if (!message) return fail(res, 'message_required');
  const lang = ['fa', 'ps', 'en'].includes(q.str(req.body.lang)) ? q.str(req.body.lang) : (user.lang || 'fa');
  const module = A.moduleOf(view.role);

  let conversationId = q.str(req.body.conversation_id);
  let conversation = conversationId ? get('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?', [conversationId, user.id]) : null;
  if (!conversation) {
    conversation = insert('ai_conversations', {
      id: U.id('cnv'), org_id: user.org_id, user_id: user.id, module,
      title: message.slice(0, 60), context: U.J.stringify(req.body.context || {}),
      created_at: U.nowISO(), updated_at: U.nowISO()
    });
    conversationId = conversation.id;
  }

  const history = all('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 20', [conversationId]);
  insert('ai_messages', { id: U.id('msg'), conversation_id: conversationId, role: 'user', content: message, created_at: U.nowISO() });

  const context = buildContext(req.auth, req.body);
  const result = await engine.ask({ question: message, lang, module, history, context });

  const assistant = insert('ai_messages', {
    id: U.id('msg'), conversation_id: conversationId, role: 'assistant', content: result.text,
    meta: U.J.stringify(result.meta), created_at: U.nowISO()
  });
  update('ai_conversations', conversationId, { updated_at: U.nowISO(), title: history.length ? conversation.title : message.slice(0, 60) });

  if (result.meta.guardrail) {
    insert('ai_flags', {
      id: U.id('flg'), org_id: user.org_id, user_id: user.id, message_id: assistant.id,
      kind: 'homework_solve', detail: message.slice(0, 300), created_at: U.nowISO()
    });
  }

  return ok(res, {
    conversation_id: conversationId,
    reply: result.text,
    meta: result.meta,
    suggestions: result.suggestions || [],
    message_id: assistant.id
  });
}));

router.get('/conversations', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const rows = all(
    `SELECT c.*, (SELECT content FROM ai_messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message
     FROM ai_conversations c WHERE c.user_id = ? AND c.module = ? ORDER BY c.updated_at DESC LIMIT 30`,
    [req.auth.user.id, q.str(req.query.module, A.moduleOf(req.auth.view.role))]
  );
  return ok(res, { conversations: rows });
}));

router.get('/conversations/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const conversation = get('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?', [req.params.id, req.auth.user.id]);
  if (!conversation) return fail(res, 'not_found', 404);
  const messages = all('SELECT id, role, content, meta, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 200', [conversation.id])
    .map((m) => ({ ...m, meta: U.J.parse(m.meta, {}) }));
  return ok(res, { conversation, messages });
}));

router.delete('/conversations/:id', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  const conversation = get('SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?', [req.params.id, req.auth.user.id]);
  if (!conversation) return fail(res, 'not_found', 404);
  remove('ai_messages', conversation.id, 'conversation_id');
  remove('ai_conversations', conversation.id);
  return ok(res, { deleted: true });
}));

router.post('/feedback', wrap((req, res) => {
  if (!req.auth) return fail(res, 'auth_required', 401);
  insert('ai_flags', {
    id: U.id('flg'), org_id: req.auth.user.org_id, user_id: req.auth.user.id,
    message_id: req.body.message_id || null, kind: q.str(req.body.kind, 'wrong'),
    detail: q.str(req.body.detail).slice(0, 500), created_at: U.nowISO()
  });
  return ok(res, { thanks: true });
}));

router.get('/greeting', wrap((req, res) => {
  const lang = ['fa', 'ps', 'en'].includes(q.str(req.query.lang)) ? q.str(req.query.lang) : 'fa';
  const module = q.str(req.query.module, 'school');
  return ok(res, { greeting: engine.greeting(lang, module) });
}));

router.get('/status', wrap((req, res) => {
  const key = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
  return ok(res, {
    mode: key && String(process.env.AI_ENABLED || '1') !== '0' ? 'llm' : 'offline',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    base: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    languages: ['fa', 'ps', 'en']
  });
}));

module.exports = router;
