// crawler.js - simple crawler to find PDF links on MOE and add to books.json
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const DATA_FILE = path.join(__dirname,'books.json');

async function fetchPage(url) {
  try {
    const r = await axios.get(url, { timeout: 10000 });
    return r.data;
  } catch (e) {
    console.error('fetch error', url, e.message);
    return '';
  }
}

function extractPdfLinks(html, baseUrl) {
  const regex = /href=["']([^"']+\.pdf)["']/gi;
  const links = [];
  let m;
  while ((m = regex.exec(html))) {
    let link = m[1];
    if (!link.startsWith('http')) {
      try { link = new URL(link, baseUrl).href; } catch(e){ continue; }
    }
    links.push(link);
  }
  return links;
}

async function crawl() {
  const seeds = [
    'https://moe.gov.af/',
    'https://moe.gov.af/sites/default/files/'
  ];
  const found = new Set();
  for (const s of seeds) {
    console.log('Fetching', s);
    const html = await fetchPage(s);
    const pdfs = extractPdfLinks(html, s).filter(l => l.includes('moe.gov.af') && l.endsWith('.pdf'));
    pdfs.forEach(p => found.add(p));
  }
  console.log('Found', found.size, 'pdfs');
  if (found.size === 0) return;

  let data = { meta:{}, books:[] };
  if (await fs.pathExists(DATA_FILE)) data = await fs.readJson(DATA_FILE);

  const existing = new Set((data.books||[]).map(b => b.url));
  for (const url of found) {
    if (existing.has(url)) continue;
    const fname = path.basename(url);
    let grade = null;
    const mg = fname.match(/g(\d{1,2})/i);
    if (mg) grade = parseInt(mg[1],10);
    let subject = 'عمومی';
    if (/english/i.test(fname)) subject = 'English';
    if (/math|riyaz/i.test(fname)) subject = 'ریاضی';
    const book = { id: 'auto-' + Date.now() + '-' + Math.floor(Math.random()*9999), title: `${subject} - صنف ${grade||'؟'} (MOE)`, grade: grade, subject: subject, language: 'دری', source: 'MOE', url };
    data.books = data.books || [];
    data.books.push(book);
    console.log('Added', url);
  }
  await fs.writeJson(DATA_FILE, data, { spaces: 2 });
  console.log('books.json updated');
}

crawl().catch(e=>{ console.error('crawl failed', e); process.exit(1); });
