require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const cors = require('cors');
const morgan = require('morgan');
const os = require('os');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(morgan('dev'));

const DATA_BOOKS = path.join(os.tmpdir(), 'books.json');
const DATA_QUIZZES = path.join(os.tmpdir(), 'quizzes.json');
const UPLOAD_DIR = path.join(os.tmpdir(), 'uploads');
fs.ensureDirSync(UPLOAD_DIR);

// ensure seed
async function ensureSeed() {
if (!(await fs.pathExists(DATA_BOOKS))) {
const seed = {
meta: { created: new Date().toISOString() },
books: [
{ id: "en-g12", title: "English — صنف 12", grade: 12, subject: "English", language: "دری/پشتو", source: "MOE", url: "https://moe.gov.af/sites/default/files/2020-03/G12-Ps-English.pdf
" },
{ id: "en-g11", title: "English — صنف 11", grade: 11, subject: "English", language: "دری/پشتو", source: "MOE", url: "https://moe.gov.af/sites/default/files/2020-03/G11-Ps-English.pdf
" },
{ id: "en-g10", title: "English — صنف 10", grade: 10, subject: "English", language: "دری/پشتو", source: "MOE", url: "https://moe.gov.af/sites/default/files/2020-03/G10-Ps-English.pdf
" },
{ id: "math-g9", title: "ریاضی — صنف 9", grade: 9, subject: "ریاضی", language: "دری", source: "MOE", url: "https://moe.gov.af/sites/default/files/2020-03/G9-Ps-English.pdf
" }
]
};
await fs.writeJson(DATA_BOOKS, seed, { spaces: 2 });
}
if (!(await fs.pathExists(DATA_QUIZZES))) {
const q = {
meta: { created: new Date().toISOString() },
quizzes: [
{
id: "g9-math-1",
grade: 9,
subject: "ریاضی",
title: "ریاضی — نمونه سوال ۱",
questions: [
{ q: "2 + 3 = ؟", options: ["3","4","5","6"], answer: 2, explanation: "2 + 3 حاصلش 5 است." },
{ q: "5 * 6 = ؟", options: ["11","30","20","35"], answer: 1, explanation: "5 ضرب در 6 برابر 30 میشود." }
]
}
]
};
await fs.writeJson(DATA_QUIZZES, q, { spaces: 2 });
}
}

ensureSeed();

async function readJsonSafe(p) {
return (await fs.readJson(p));
}

// multer storage
const storage = multer.diskStorage({
destination: (req, file, cb) => cb(null, UPLOAD_DIR),
filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

// API endpoints
app.get('/api/books', async (req, res) => {
try {
const q = (req.query.q || '').toLowerCase();
const data = await readJsonSafe(DATA_BOOKS);
let books = (data.books || []).slice();
if (q) books = books.filter(b => (b.title || '').toLowerCase().includes(q));
res.json({ ok: true, books });
} catch (e) {
res.status(500).json({ ok: false, error: e.message });
}
});

app.post('/api/books', async (req, res) => {
try {
const { title, url } = req.body;
if (!title || !url) return res.status(400).json({ ok: false, error: 'title and url required' });
const data = await readJsonSafe(DATA_BOOKS);
const book = { id: 'b-' + Date.now(), title, url };
data.books.push(book);
await fs.writeJson(DATA_BOOKS, data, { spaces: 2 });
res.json({ ok: true, book });
} catch (e) {
res.status(500).json({ ok: false, error: e.message });
}
});

app.post('/api/upload', upload.single('pdf'), async (req, res) => {
try {
if (!req.file) return res.status(400).json({ ok: false, error: 'no file uploaded' });
res.json({ ok: true, path: req.file.path });
} catch (e) {
res.status(500).json({ ok: false, error: e.message });
}
});module.exports = app;
