// public/app.js - frontend in Dari
const content = document.getElementById('content');
const tabBooks = document.getElementById('tabBooks');
const tabQuizzes = document.getElementById('tabQuizzes');
const tabAdmin = document.getElementById('tabAdmin');

tabBooks.onclick = ()=>{ showBooks(); setActive(tabBooks); };
tabQuizzes.onclick = ()=>{ showQuizzes(); setActive(tabQuizzes); };
tabAdmin.onclick = ()=>{ showAdmin(); setActive(tabAdmin); };

function setActive(btn){
  document.querySelectorAll('.nav .btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

// initial
showBooks();

async function fetchBooks(q='', grade='') {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (grade) params.set('grade', grade);
  const r = await fetch('/api/books?' + params.toString());
  return await r.json();
}

async function showBooks(){
  content.innerHTML = `<div class="grid">
    <div>
      <div class="card">
        <div><input id="searchQ" placeholder="جست‌وجو بر اساس عنوان یا موضوع" /></div>
        <div><select id="gradeSel"><option value="">همهٔ صنوف</option>${[...Array(12)].map((_,i)=>`<option value="${i+1}">صنف ${i+1}</option>`).join('')}</select></div>
        <div><button class="btn" id="doSearch">جست‌وجو</button></div>
      </div>
      <div id="bookList" class="card" style="margin-top:12px;min-height:300px">در حال بارگذاری...</div>
    </div>
    <div>
      <div class="card">
        <h3>نمایشگر PDF</h3>
        <div id="viewerMsg">یک کتاب را انتخاب کنید</div>
        <div id="viewer"></div>
      </div>
      <div class="card" style="margin-top:12px">
        <h4>اشتراک سریع</h4>
        <div class="small">برای اشتراک، لینک کتاب را کپی کنید</div>
      </div>
    </div>
  </div>`;
  document.getElementById('doSearch').onclick = loadBooks;
  loadBooks();
}

async function loadBooks(){
  const q = document.getElementById('searchQ').value.trim();
  const grade = document.getElementById('gradeSel').value;
  const r = await fetchBooks(q, grade);
  const list = document.getElementById('bookList');
  list.innerHTML = '';
  if (!r.books || r.books.length===0){ list.innerHTML = '<div class="small">کتابی یافت نشد</div>'; return; }
  r.books.forEach(b=>{
    const el = document.createElement('div');
    el.className = 'book';
    el.innerHTML = `<strong>${b.title}</strong><div class="small">${b.subject || ''} — صنف ${b.grade || '-'} — ${b.source||''}</div>
      <div style="margin-top:6px"><button class="btn viewBtn" data-url="${b.url}">مشاهده</button> <button class="btn muted copyBtn" data-url="${b.url}">کپی لینک</button></div>`;
    list.appendChild(el);
  });
  document.querySelectorAll('.viewBtn').forEach(btn=>{
    btn.onclick = ()=> {
      const url = btn.dataset.url;
      const viewer = document.getElementById('viewer');
      document.getElementById('viewerMsg').style.display = 'none';
      viewer.innerHTML = `<iframe src="https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true"></iframe>`;
    };
  });
  document.querySelectorAll('.copyBtn').forEach(btn=>{
    btn.onclick = ()=> { navigator.clipboard.writeText(btn.dataset.url); alert('لینک کپی شد'); };
  });
}

// quizzes
async function showQuizzes(){
  content.innerHTML = `<div class="grid">
    <div>
      <div class="card">
        <h3>آزمون‌ها</h3>
        <div><select id="qGrade"><option value="">همهٔ صنوف</option>${[...Array(12)].map((_,i)=>`<option value="${i+1}">صنف ${i+1}</option>`).join('')}</select></div>
        <div><button class="btn" id="loadQ">بارگذاری آزمون‌ها</button></div>
      </div>
      <div id="quizList" class="card" style="margin-top:12px;min-height:300px">در حال بارگذاری...</div>
    </div>
    <div>
      <div class="card">
        <h3>اجرای آزمون</h3>
        <div id="quizArea">ابتدا یک آزمون انتخاب کنید</div>
      </div>
    </div>
  </div>`;
  document.getElementById('loadQ').onclick = loadQuizzes;
  loadQuizzes();
}

async function loadQuizzes(){
  const grade = document.getElementById('qGrade').value;
  const params = new URLSearchParams();
  if (grade) params.set('grade', grade);
  const r = await fetch('/api/quizzes?' + params.toString());
  const d = await r.json();
  const list = document.getElementById('quizList');
  list.innerHTML = '';
  if (!d.quizzes || d.quizzes.length===0){ list.innerHTML = '<div class="small">آزمونی یافت نشد</div>'; return; }
  d.quizzes.forEach(q=>{
    const el = document.createElement('div');
    el.className = 'book';
    el.innerHTML = `<strong>${q.title}</strong><div class="small">${q.subject} — صنف ${q.grade || '-'}</div>
      <div style="margin-top:6px"><button class="btn startBtn" data-id="${q.id}">شروع آزمون</button></div>`;
    list.appendChild(el);
  });
  document.querySelectorAll('.startBtn').forEach(b=>b.onclick = ()=> startQuiz(b.dataset.id));
}

async function startQuiz(id){
  const r = await fetch('/api/quizzes');
  const d = await r.json();
  const quiz = d.quizzes.find(q => q.id === id);
  if (!quiz) { alert('آزمون پیدا نشد'); return; }
  const area = document.getElementById('quizArea');
  let idx = 0;
  let score = 0;
  area.innerHTML = '';
  function renderQuestion(){
    const item = quiz.questions[idx];
    area.innerHTML = `<div><strong>سؤال ${idx+1}:</strong><div style="margin-top:8px">${item.q}</div></div>`;
    item.options.forEach((op,i)=>{
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.display='block';
      btn.style.marginTop='8px';
      btn.textContent = op;
      btn.onclick = ()=> {
        if (i === item.answer) { score++; alert('درست!'); } else { alert('نادرست. توضیح: ' + (item.explanation || '')); }
        idx++;
        if (idx < quiz.questions.length) renderQuestion(); else {
          area.innerHTML = `<div><h3>نتیجه: ${score} / ${quiz.questions.length}</h3></div>`;
        }
      };
      area.appendChild(btn);
    });
  }
  renderQuestion();
}

// admin
function showAdmin(){
  content.innerHTML = `<div class="grid">
    <div>
      <div class="card">
        <h3>افزودن کتاب (URL)</h3>
        <input id="ab_title" placeholder="عنوان کتاب" />
        <input id="ab_subject" placeholder="موضوع" />
        <input id="ab_grade" placeholder="صنف (1-12)" />
        <input id="ab_url" placeholder="نشانی PDF (http...)" />
        <button class="btn" id="addBookBtn">افزودن کتاب</button>
        <div id="addBookMsg" class="small"></div>
      </div>

      <div class="card" style="margin-top:12px">
        <h3>بارگذاری PDF</h3>
        <input type="file" id="filePdf" />
        <input id="up_title" placeholder="عنوان (اختیاری)" />
        <input id="up_grade" placeholder="صنف (اختیاری)" />
        <button class="btn" id="uploadBtn">بارگذاری</button>
        <div id="uploadMsg" class="small"></div>
      </div>
    </div>
    <div>
      <div class="card">
        <h3>افزودن آزمون</h3>
        <input id="q_title" placeholder="عنوان آزمون" />
        <input id="q_grade" placeholder="صنف" />
        <input id="q_subject" placeholder="موضوع" />
        <textarea id="q_json" placeholder='سوال‌ها را به صورت JSON وارد کنید: [{"q":"...","options":["a","b","c","d"],"answer":0,"explanation":"..."}]'></textarea>
        <button class="btn" id="addQuizBtn">افزودن آزمون</button>
        <div id="addQuizMsg" class="small"></div>
      </div>
    </div>
  </div>`;

  document.getElementById('addBookBtn').onclick = async ()=>{
    const title = document.getElementById('ab_title').value.trim();
    const subject = document.getElementById('ab_subject').value.trim();
    const grade = document.getElementById('ab_grade').value.trim();
    const url = document.getElementById('ab_url').value.trim();
    const msg = document.getElementById('addBookMsg');
    msg.innerText = 'در حال ارسال...';
    const r = await fetch('/api/books', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({title,subject,grade,url,language:'دری',source:'admin'}) });
    const d = await r.json();
    msg.innerText = d.ok ? 'کتاب افزوده شد' : 'خطا: ' + JSON.stringify(d);
  };

  document.getElementById('uploadBtn').onclick = async ()=>{
    const f = document.getElementById('filePdf').files[0];
    const title = document.getElementById('up_title').value.trim();
    const grade = document.getElementById('up_grade').value.trim();
    if (!f) return alert('فایل را انتخاب کنید');
    const fd = new FormData();
    fd.append('pdf', f);
    fd.append('title', title);
    fd.append('grade', grade);
    const msg = document.getElementById('uploadMsg');
    msg.innerText = 'درحال بارگذاری...';
    const r = await fetch('/api/upload', { method:'POST', body: fd });
    const d = await r.json();
    msg.innerText = d.ok ? 'بارگذاری شد' : 'خطا: ' + JSON.stringify(d);
  };

  document.getElementById('addQuizBtn').onclick = async ()=>{
    const title = document.getElementById('q_title').value.trim();
    const grade = document.getElementById('q_grade').value.trim();
    const subject = document.getElementById('q_subject').value.trim();
    let qs = null;
    try { qs = JSON.parse(document.getElementById('q_json').value); } catch(e){ alert('JSON نامعتبر'); return; }
    const msg = document.getElementById('addQuizMsg');
    msg.innerText = 'درحال ارسال...';
    const r = await fetch('/api/quizzes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({title,grade,subject,questions:qs}) });
    const d = await r.json();
    msg.innerText = d.ok ? 'آزمون افزوده شد' : 'خطا: ' + JSON.stringify(d);
  };
}
