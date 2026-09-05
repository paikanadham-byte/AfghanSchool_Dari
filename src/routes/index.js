'use strict';
const express = require('express');
const auth = require('./auth');
const core = require('./core');
const school = require('./school');
const clinic = require('./clinic');
const ai = require('./ai');
const A = require('../auth');
const U = require('../util');

const router = express.Router();

router.use('/auth', auth);

/** Everything below requires a session. */
router.use(A.attach, A.requireAuth);

router.get('/health', (req, res) => res.json({ ok: true, server_time: U.nowISO(), user: req.auth.user.username }));
router.use('/', core);
router.use('/school', school);
router.use('/clinic', clinic);
router.use('/ai', ai);

router.use((req, res) => res.status(404).json({ ok: false, error: 'unknown_endpoint', path: req.originalUrl }));

module.exports = router;
