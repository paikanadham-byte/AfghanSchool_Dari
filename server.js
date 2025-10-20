// server.js - Afghanistan Online School (Dari) prototype
require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
const fs = require('fs-extra');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
app.use(bodyParser.json());
app.use(cors());
app.use(morgan('dev'));

const DATA_BOOKS = path.join(__dirname,'books.json');
const DATA_QUIZZES = path.join(__dirname,'quizzes.json');
const UPLOAD_DIR = path.join(__dirname,'uploads');
fs.ensureDirSync(UPLOAD_DIR);

// ensure seed
async function ensureSeed() {
  if (!(await fs.pathExists(DATA_BOOKS))) {
    const seed = {
      meta: { created: new Date().toISOString() },
      books: [
        { id: "en-g12", title: "English — صنف 12", grade: 12, subject: "English", language: "دری/پشتو", source: "MOE", url: "https://moe.gov.af/sites/default/files/2020-03/G12-Ps-English.pdf" },
        { id: "en-g11", title: "English — صنف 11", grade: 11, subject: "English", language: "دری/پشتو", source: "MOE", url: "https://moe.gov.af/sites/default/files/2020-03/G11-Ps-English.pdf" },
        { id: "en-g10", title: "English — صنف 10", grade: 10, subject: "English", language: "دری/پشتو", source: "MOE", url: "https://moe.gov.af/sites/default/files/2020-03/G10-Ps-English.pdf" },
        { id: "math-g9", title: "ریاضی — صنف 9", grade: 9, subject: "ریاضی", language: "دری", source: "MOE", url: "https://moe.gov.af/sites/default/files/2020-03/G9-Ps-English.pdf" }
      ]
    };
    await fs.writeJson(DATA_BOOKS, seed, { spaces: 2 });
    console.log('Seeded books.json');
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
        },
        {
          id: "g12-english-1",
          grade: 12,
          subject: "English",
          title: "انگلیسی — نمونه سوال ۱",
          questions: [
            { q: "Choose the correct plural: 'child'", options: ["childs","childes","children","childer"], answer: 2, explanation: "Correct plural is 'children'." }
          ]
        }
      ]
    };
    await fs.writeJson(DATA_QUIZZES, q, { spaces: 2 });
    console.log('Seeded quizzes.json');
  }
}

ensureSeed();

async function readJsonSafe(p) {
  return (await fs.readJson(p));
}

// file upload via multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g,'_'))
});
const upload = multer({ storage });

// API: list books
app.get('/api/books', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    const grade = req.query.grade ? parseInt(req.query.grade) : null;
    const subject = (req.query.subject || '').toLowerCase();
    const data = await readJsonSafe(DATA_BOOKS);
    let books = (data.books || []).slice();
    if (grade) books = books.filter(b => b.grade === grade);
    if (subject) books = books.filter(b => (b.subject||'').toLowerCase().includes(subject));
    if (q) books = books.filter(b =>
      (b.title||'').toLowerCase().includes(q) ||
      (b.subject||'').toLowerCase().includes(q) ||
      (b.source||'').toLowerCase().includes(q)
    );
    res.json({ ok:true, books });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// API add book by URL
app.post('/api/books', async (req, res) => {
  try {
    const { title, grade, subject, url, language, source } = req.body;
    if (!title || !url) return res.status(400).json({ ok:false, error:'title and url required' });
    const data = await readJsonSafe(DATA_BOOKS);
    const id = (title.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + Date.now()).slice(0,60);
    const book = { id, title, grade: grade?parseInt(grade):null, subject:subject||'', url, language:language||'', source:source||'' };
    data.books = data.books || [];
    data.books.push(book);
    await fs.writeJson(DATA_BOOKS, data, { spaces: 2 });
    res.json({ ok:true, book });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// upload local pdf
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'no file uploaded' });
    const data = await readJsonSafe(DATA_BOOKS);
    const id = 'local-' + Date.now();
    const url = '/uploads/' + req.file.filename;
    const book = { id, title: req.body.title || req.file.originalname, grade: req.body.grade?parseInt(req.body.grade):null, subject: req.body.subject||'', url, language: req.body.language||'', source: req.body.source||'uploaded' };
    data.books = data.books || [];
    data.books.push(book);
    await fs.writeJson(DATA_BOOKS, data, { spaces: 2 });
    res.json({ ok:true, book });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// serve uploads
app.use('/uploads', express.static(UPLOAD_DIR));

// quizzes endpoints
app.get('/api/quizzes', async (req,res) => {
  try {
    const grade = req.query.grade ? parseInt(req.query.grade) : null;
    const subject = (req.query.subject || '').toLowerCase();
    const data = await readJsonSafe(DATA_QUIZZES);
    let qs = (data.quizzes || []).slice();
    if (grade) qs = qs.filter(q => q.grade === grade);
    if (subject) qs = qs.filter(q => (q.subject||'').toLowerCase().includes(subject));
    res.json({ ok:true, quizzes: qs });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

app.post('/api/quizzes', async (req,res) => {
  try {
    const { grade, subject, title, questions } = req.body;
    if (!title || !questions || !Array.isArray(questions)) return res.status(400).json({ ok:false, error:'title and questions array required' });
    const data = await readJsonSafe(DATA_QUIZZES);
    const id = 'q-' + Date.now();
    const qobj = { id, grade: grade?parseInt(grade):null, subject: subject||'', title, questions };
    data.quizzes = data.quizzes || [];
    data.quizzes.push(qobj);
    await fs.writeJson(DATA_QUIZZES, data, { spaces: 2 });
    res.json({ ok:true, quiz: qobj });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// serve frontend
app.use(express.static(path.join(__dirname,'public')));
app.get('*', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
