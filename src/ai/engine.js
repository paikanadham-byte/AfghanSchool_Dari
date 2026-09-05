'use strict';
/**
 * Socratic tutor / health-information assistant.
 *
 * Hard rule: the assistant EXPLAINS tasks, teaches method, checks reasoning and
 * gives similar worked examples — it never produces the answer to a student's
 * own homework. It runs fully offline by default; set OPENAI_API_KEY (or
 * AI_BASE_URL + AI_MODEL for a local/Ollama server) to upgrade to an LLM while
 * keeping the same guardrails.
 */
const U = require('../util');
const { TOPICS, VOCAB, STUDY_METHODS } = require('./topics');

const LANGS = ['fa', 'ps', 'en'];

// ------------------------------------------------------------- guardrails ---
const SOLVE_PATTERNS = [
 /\b(solve|do|finish|complete|write)\b[^.?!]{0,30}\b(homework|assignment|task|exercise|problem|it|this|for me)\b/i,
 /\b(give|tell|send|show)\b[^.?!]{0,20}\b(me\s+)?(the\s+)?(answer|solution|result)\b/i,
 /\bjust\s+(give|tell|write|do)\b/i,
 /\bwhat\s+is\s+the\s+answer\b/i,
 /حل\s*(کن|کاری|ش|م)?(\s|$|[؟?.!،])/, /(جواب|حل)\s*(را|ش|م)?\s*(را)?\s*(بده|بگیر|بنویس|برایم|بدې)/, /برای\s*من\s*(حل|بنویس)/, /خودت\s*(حل|بنویس)/,
 /جواب\s*(درست|صحیح)/, /حل\s*(یې|م)\s*(کړه|کړئ)/, /زما\s*(کورنۍ\s*دنده|وظیفه|مشق)\s*(حل|ولیکه|وکړه)/,
 /(ځواب|حل)\s*(راکړه|وکړه|ولیکه)/
];
const CHECK_PATTERNS = [
 /\b(check|review)\b[^.?!]{0,20}\b(my\s+)?(work|answer|solution)\b/i,
 /(جواب|حل)\s*(من|خودم|م)?\s*(را)?\s*(چک|بررسی|کنترول|کتنه)\s*(کن|کړه)/,
 /(درست|صحیح|سم|غلط|درسته)\s*(است|دی|ني)\s*[؟?]/,

 /آیا\s*(این|جواب)?\s*(درست|صحیح)/,
 /ځواب\s*(مې)?\s*(سم|غلط)\s*دی/
];
/** "How do I solve…" is a LEARNING request, not a request to do the work. */
const HOWTO_PATTERNS = [
 /\bhow\s+(do|can|to|should|would|did)\b/i, /\bsteps?\b/i, /\bmethod\b/i, /\bexplain\b/i, /\bteach\b/i, /\blearn\b/i,
 /چطور|چگونه|چیطور|چسان|روش|طریقه|یاد\s*بده|توضیح/,
 /څنګه|طریقه|لاره|راوښیه|تشریح/
];

const REFUSAL = {
 fa: {
 head: 'من کار خانهٔ شما را انجام نمی‌دهم، اما تا پایان کنار شما هستم تا خودتان آن را بسازید. ',
 body: 'چطور می‌توانم کمک کنم؟\n• سؤال را برایتان ساده توضیح بدهم\n• قدم‌های حل را یادتان بدهم\n• یک مثال مشابه با عددهای دیگر حل کنم\n• جوابی که خودتان نوشته‌اید را بررسی کنم و بگویم کجا مشکل دارد\n\nکدام یکی را می‌خواهید؟',
 tail: 'یادگاری: معلم شما روشِ فکر کردن شما را می‌خواهد، نه فقط جواب آخر.'
 },
 ps: {
 head: 'زه ستاسو کورنۍ دنده نه جوړوم، خو تر پایه له تاسو سره یم چې خپله یې جوړه کړئ. ',
 body: 'څنګه مرسته درسره کولای شم؟\n• پوښتنه درته ساده تشریح کړم\n• د حل ګامونه در وښیم\n• یوه ورته بېلګه له نورو عددونو سره حل کړم\n• هغه ځواب چې تا لیکلی وګورم او درته ووایم چې ستونزه چېرې ده\n\nکوم یو غواړې؟',
 tail: 'یاداښت: ښوونکی ستاسو د فکر کولو لاره غواړي، یوازې وروستی ځواب نه.'
 },
 en: {
 head: "I won't do your homework for you — but I'll stay with you until you can do it yourself. ",
 body: 'How can I help instead?\n• Explain what the question is asking\n• Teach you the steps and the method\n• Work through a similar example with different numbers\n• Review the answer you wrote and point out where it goes wrong\n\nWhich one would you like?',
 tail: 'Remember: your teacher wants to see how you think, not just the final answer.'
 }
};

/** Normalise Pashto/Dari spelling variants so red-flag detection still matches. */
const normalise = (s) => String(s || '')
 .replace(/[ېۍ]/g, 'ي').replace(/ګ/g, 'ک').replace(/ړ/g, 'ر').replace(/ډ/g, 'د')
 .replace(/ڼ/g, 'ن').replace(/ښ/g, 'خ').replace(/ړ/g, 'ر').replace(/ی/g, 'ي')
 .replace(/[ؤئ]/g, 'و').replace(/‌/g, '');

const RED_FLAGS = [
 { re: /chest\s*pain|(درد|خوږ|درد کوي)[^.?!]{0,12}(سينه|سینه)|(سينه|سینه)[^.?!]{0,12}(درد|خوږ)/i, text: { fa: 'درد سینه', ps: 'د سینې درد', en: 'chest pain'} },
 { re: /can'?t\s*breathe|difficult\w*\s*breath|تنگی\s*نفس|نفس\s*تنگی|د\s*ساه\s*(تنګي|تنگی)|ساه\s*(نه\s*راځي|اخیستل\s*نه)/i, text: { fa: 'تنگی نفس', ps: 'د ساه تنګي', en: 'difficulty breathing'} },
 { re: /unconscious|faint\w*|بی\s*هوش|بيهوښ|بې\s*هوښ|بېهوښ/i, text: { fa: 'بی‌هوشی', ps: 'بې هوښي', en: 'fainting / unconsciousness'} },
 { re: /seizure|convulsion|fit\b|تشنج|اختلاج|صرع/i, text: { fa: 'تشنج', ps: 'اختلاج', en: 'seizure'} },
 { re: /heavy\s*bleed|خونریزی|خون\s*ریزی|وینه\s*(ډېر|زیات|نه\s*درېږي|بند|درېدل)/i, text: { fa: 'خون‌ریزی شدید', ps: 'د وینې ډېر بهېدل', en: 'heavy bleeding'} },
 { re: /poison|زهر|زهري|مسموم/i, text: { fa: 'مسمومیت', ps: 'زهري کېدل', en: 'poisoning'} },
 { re: /(pregnan\w*|حاملگی|امیدواري|اميدوارۍ)[^.?!]{0,20}(bleed|خون|وینه)|(خون|وینه)[^.?!]{0,15}(حاملگی|امیدواري)/i, text: { fa: 'خون‌ریزی در حاملگی', ps: 'د امیدوارۍ پر مهال وینه', en: 'bleeding in pregnancy'} },
 { re: /(تب|تبه)[^.?!]{0,12}(شدید|زیات|لوړ|لوړه)|high\s*fever/i, text: { fa: 'تب شدید', ps: 'لوړه تبه', en: 'high fever'} }
];

const URGENT = {
 fa: 'این گفتگو جایگزین داکتر نیست. اگر نشانه‌های خطر (درد سینه، تنگی نفس، بی‌هوشی، خون‌ریزی شدید، تشنج، یا تب شدید در طفل) دارید، همین امروز به نزدیک‌ترین کلینیک یا شفاخانه مراجعه کنید و این پیام را به داکتر نشان بدهید.',
 ps: 'دا خبرې اترې د ډاکټر ځای نه نیسي. که د خطر نښې (د سینې درد، د ساه تنګي، بې هوښي، ډېره وینه، اختلاج، یا د ماشوم لوړه تبه) لرئ، نن نږدې کلینیک یا روغتون ته ولاړ شئ او دا پیغام ډاکټر ته وښایاست.',
 en: 'This chat does not replace a doctor. If you have danger signs (chest pain, difficulty breathing, fainting, heavy bleeding, a seizure, or high fever in a baby), go to the nearest clinic or hospital today and show this message to the doctor.'
};

const HEALTH_NOTE = {
 fa: '\n\nمن داکتر نیستم و تشخیص نمی‌دهم؛ فقط معلومات عمومی می‌دهم. برای درمان باید معاینه شوید.',
 ps: '\n\nزه ډاکټر نه یم او تشخیص نه کوم؛ یوازې عمومي معلومات ورکوم. د درملنې لپاره باید معاینه شئ.',
 en: '\n\nI am not a doctor and cannot diagnose; I only share general health information. You need an examination for treatment.'
};

// ------------------------------------------------------------------ intents -
function isSolveRequest(q) {
 const text = String(q || '');
 if (HOWTO_PATTERNS.some((re) => re.test(text))) return false;
 return SOLVE_PATTERNS.some((re) => re.test(text));
}

function detectIntent(q) {
 const text = String(q || '').toLowerCase();
 if (CHECK_PATTERNS.some((re) => re.test(text))) return 'check_work';
 if (isSolveRequest(q)) return 'solve_request';
 if (/(معنی|مانا|ترجمه|translate|meaning|یعنے|یعنی|what does)/i.test(q)) return 'meaning';
 if (/(حفظ|یاد\s*بگیرم|memor|remember)/i.test(q)) return 'memorize';
 if (/(برنامه|پلان|plan|schedule|وقت\s*بندی)/i.test(q)) return 'plan';
 if (/(امتحان|ازموینه|exam|test)/i.test(q)) return 'exam';
 if (/(تمرکز|حواس|focus|concentrat)/i.test(q)) return 'focus';
 if (/(یادداشت|خلاصه|note|summar)/i.test(q)) return 'notes';
 if (/(نکته\s*بهبود|بهبود|improve|ضعیف|کمک\s*می\s*خواهم)/i.test(q)) return 'improve';
 if (/(چرا|why|ولې)/i.test(q)) return 'why';
 if (/(چطور|چگونه|how|څنګه)/i.test(q)) return 'how';
 if (/(مثال|example|نمونه)/i.test(q)) return 'example';
 return 'explain';
}

function matchTopic(q) {
 const text = String(q || '').toLowerCase();
 let best = null;
 let bestScore = 0;
 for (const topic of TOPICS) {
 let score = 0;
 for (const kw of topic.keywords) {
 const needle = kw.toLowerCase();
 if (text.includes(needle)) score += needle.length >= 4 ? 3 : 2;
 }
 if (score > bestScore) { bestScore = score; best = topic; }
 }
 return bestScore >= 2 ? best : null;
}

function lookupVocab(q) {
 const text = String(q || '').toLowerCase();
 return VOCAB.filter((v) => {
 const words = [v.en, ...String(v.fa).split(/[\s\/]+/), ...String(v.ps).split(/[\s\/]+/)];
 return words.some((w) => w && w.length > 2 && new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(text));
 });
}

// ---------------------------------------------------------------- responses -
const wrap = (parts) => parts.filter(Boolean).join('\n\n').trim();

const SUGGESTIONS = {
 fa: ['قدم‌های حل را یاد بده', 'یک مثال مشابه حل کن', 'این سؤال را ساده توضیح بده', 'چطور درس بخوانم؟'],
 ps: ['د حل ګامونه راوښیه', 'یوه ورته بېلګه حل کړه', 'دا پوښتنه ساده تشریح کړه', 'څنګه درس ولولم؟'],
 en: ['Teach me the steps', 'Show a similar example', 'Explain the question simply', 'How should I study?']
};

function explainTask(context, lang) {
 const hw = context.homework || null;
 if (!hw) return null;
 const title = U.tr(hw.title, lang);
 const subject = U.tr(hw.subject_name, lang) || '';
 const instructions = U.tr(hw.instructions, lang) || '';
 const L = {
 fa: {
 head: `وظیفه: ${title}${subject ? `— ${subject}`: ''}`,
 what: `چه خواسته شده: ${instructions || 'متن وظیفه را در بالا بخوان و زیر کلمات کلیدی خط بکش.'}`,
 steps: [
 '۱. کلمات کلیدی وظیفه را مشخص کن (چه چیزی دقیقاً خواسته شده؟).',
 '۲. آنچه را از قبل می‌دانی یادداشت کن.',
 `۳. برای این کار حدود ${hw.est_minutes || 30} دقیقه وقت بگذار و اول سخت‌ترین بخش را شروع کن.`,
 `۴. پیش از تسلیمی، کارت را یک بار بلند بخوان و ببین آیا به همهٔ بخش‌های خواسته جواب داده‌ای.`
 ].join('\n'),
 due: hw.due_at ? `وقت تسلیمی: ${U.jalali(hw.due_at, 'fa', { digits: true })} (${U.dueLabel(hw.due_at, 'fa')})`: ''
 },
 ps: {
 head: `دنده: ${title}${subject ? `— ${subject}`: ''}`,
 what: `څه غوښتل شوي: ${instructions || 'د دندې متن پورته ولوله او مهم کلیمې په نښه کړه.'}`,
 steps: [
 '۱. د دندې مهمې کلیمې معلومې کړه.',
 '۲. هغه څه چې له مخکې یې پېژنې یاداښت کړه.',
 `۳. د دې کار لپاره شاوخوا ${hw.est_minutes || 30} دقیقې وخت وټاکه او لومړی ستونزمنه برخه پیل کړه.`,
 '۴. تر سپارلو مخکې خپل کار په لوړ غږ ولوله او وګوره چې ټولو برخو ته دې ځواب ورکړی دی.'
 ].join('\n'),
 due: hw.due_at ? `د سپارلو وخت: ${U.jalali(hw.due_at, 'ps', { digits: true })} (${U.dueLabel(hw.due_at, 'ps')})`: ''
 },
 en: {
 head: `Task: ${title}${subject ? `— ${subject}`: ''}`,
 what: `What is being asked: ${instructions || 'Read the task text above and underline the key words.'}`,
 steps: [
 '1. Identify the key words (what exactly is required?).',
 '2. Note what you already know about it.',
 `3. Give it about ${hw.est_minutes || 30} minutes and start with the hardest part.`,
 '4. Before submitting, read your work aloud once and check you answered every part.'
 ].join('\n'),
 due: hw.due_at ? `Due: ${hw.due_at.slice(0, 10)} (${U.dueLabel(hw.due_at, 'en')})`: ''
 }
 }[lang];
 return wrap([L.head, L.what, L.steps, L.due]);
}

function topicAnswer(topic, lang) {
 const c = topic.content[lang] || topic.content.fa;
 return wrap([
 c.summary,
 ''+ { fa: 'قدم‌ها:', ps: 'ګامونه:', en: 'Steps:'}[lang] + '\n'+ c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
 ''+ { fa: 'سؤال‌های راهنما:', ps: 'لارښوونکې پوښتنې:', en: 'Guiding questions:'}[lang] + '\n'+ c.questions.map((s) => `• ${s}`).join('\n'),
 ''+ { fa: 'مثال مشابه (اعداد متفاوت):', ps: 'ورته بېلګه (نور عددونه):', en: 'Similar example (different numbers):'}[lang] + '\n'+ c.example
 ]);
}

function genericAnswer(lang) {
 return {
 fa: wrap([
 'بیا با هم قدم‌به‌قدم پیش می‌رویم:',
 '۱. صورت سؤال را با صدای بلند بخوان و زیر کلمات کلیدی خط بکش.',
 '۲. بنویس چه چیزی معلوم است و چه چیزی مجهول است.',
 '۳. یک راه حل ساده انتخاب کن و اول با یک مثال کوچک امتحان کن.',
 '۴. اگر گیر کردی، دقیقاً همان جایی را که متوجه نشدی برایم بنویس تا همان بخش را توضیح بدهم.',
 'می‌توانی سؤال یا بخشی از وظیفه را اینجا بفرستی.'
 ]),
 ps: wrap([
 'راځه ګام په ګام مخکې لاړ شو:',
 '۱. پوښتنه په لوړ غږ ولوله او مهمې کلیمې په نښه کړه.',
 '۲. ولیکه چې څه معلوم دي او څه مجهول دي.',
 '۳. یوه ساده لاره غوره کړه او لومړی یې په کوچنۍ بېلګه وازمایه.',
 '۴. که بند پاتې شوې، هماغه برخه چې نه ده درته روښانه رالیږه چې هماغه درته تشریح کړم.',
 'کولای شې پوښتنه یا د دندې یوه برخه دلته راولېږې.'
 ]),
 en: wrap([
 "Let's go step by step:",
 '1. Read the question aloud and underline the key words.',
 '2. Write what is known and what is unknown.',
 '3. Choose a simple method and test it on a small example first.',
 '4. If you get stuck, send me the exact part you did not understand and I will explain that part.',
 'You can paste the question or a part of the task here.'
 ])
 }[lang];
}

function checkWorkAnswer(lang) {
 return {
 fa: wrap([
 'جوابی را که خودت نوشته‌ای اینجا بفرست. من با این چک‌لیست آن را می‌بینم و فقط می‌گویم کجا مشکل دارد (جواب را خودم نمی‌نویسم):',
 '• آیا خواستهٔ سؤال درست فهمیده شده؟',
 '• آیا هر قدم یک دلیل دارد؟',
 '• آیا محاسبه درست انجام شده؟',
 '• آیا واحد و علامت‌ها درست‌اند؟',
 '• آیا جواب منطقی به نظر می‌رسد؟'
 ]),
 ps: wrap([
 'هغه ځواب چې تا لیکلی دلته راولېږه. زه یې د دې کتلو په مرسته ګورم او یوازې درته وایم چې ستونزه چېرې ده (ځواب په خپله نه لیکم):',
 '• آیا د پوښتنې غوښتنه سمه پوه شوې ده؟',
 '• آیا هر ګام دلیل لري؟',
 '• آیا محاسبه سمه شوې ده؟',
 '• آیا واحد او نښې سمې دي؟',
 '• آیا ځواب منطقي ښکاري؟'
 ]),
 en: wrap([
 'Paste the answer you wrote. I will review it with this checklist and only point at where it goes wrong (I will not write the answer myself):',
 '• Was the question understood correctly?',
 '• Does every step have a reason?',
 '• Is the calculation correct?',
 '• Are the units and signs right?',
 '• Does the answer make sense?'
 ])
 }[lang];
}

function meaningAnswer(terms, lang) {
 if (!terms.length) return null;
 const lines = terms.slice(0, 5).map((v) => `• ${v.en} — ${v.fa} — ${v.ps}`);
 return wrap([
 { fa: 'واژه‌نامه:', ps: 'د کلیمو مانا:', en: 'Glossary:'}[lang],
 lines.join('\n')
 ]);
}

function healthAnswer(q, lang) {
 const text = normalise(q);
 const flags = RED_FLAGS.filter((f) => f.re.test(q) || f.re.test(text));
 const lines = {
 fa: ['من فقط معلومات عمومی سلامت می‌دهم و تشخیص نمی‌دهم.', '• نشانه‌های خود را با تاریخ و زمان بنویسید تا در وقت ملاقات به داکتر نشان بدهید.', '• آب کافی بنوشید، استراحت کنید و دوا را بدون نسخه مصرف نکنید.', '• اگر تب بیش از ۳ روز دوام کرد یا بدتر شدید، معاینه ضروری است.'],
 ps: ['زه یوازې عمومي روغتیایي معلومات ورکوم او تشخیص نه کوم.', '• خپلې نښې له نېټې او وخت سره ولیکئ چې د ملاقات پر مهال یې ډاکټر ته وښایاست.', '• کافي اوبه وڅښئ، دمه وکړئ او له نسخې پرته دوا مه اخلئ.', '• که تبه له ۳ ورځو زیاته دوام وکړي یا مو حالت خراب شي، معاینه اړینه ده.'],
 en: ['I only give general health information and cannot diagnose.', '• Write your symptoms with dates and times to show the doctor at your visit.', '• Drink enough water, rest, and do not take medicines without a prescription.', '• If fever lasts more than 3 days or you get worse, an examination is necessary.']
 }[lang];
 const flagText = flags.length
 ? `${URGENT[lang]}\n\n ${ { fa: 'نشانه‌ای که گفتید:', ps: 'هغه نښه چې یادونه مو وکړه:', en: 'The sign you mentioned:'}[lang] } ${flags.map((f) => f.text[lang]).join('، ')}`
 : null;
 const parts = flags.length ? [flagText, ...lines] : [...lines, HEALTH_NOTE[lang]];
 return wrap(parts);
}

// ------------------------------------------------------------------- LLM ----
const SYSTEM_PROMPT = {
 fa: `تو «همیار درسی» یک مکتب در افغانستان هستی. به دری/فارسی کوتاه و مهربان پاسخ بده.
قوانین سخت:
1. هرگز پاسخ نهایی وظیفهٔ شاگرد را نمی‌نویسی و مسئلهٔ او را حل نمی‌کنی.
2. در عوض: می‌فهمانی سؤال چه می‌خواهد، روش و قدم‌ها را یاد می‌دهی، یک مثال مشابه با اعداد دیگر حل می‌کنی، و سؤال‌های راهنما می‌پرسی.
3. اگر شاگرد خواست کارش را چک کنی، فقط محل اشتباه را نشان بده و راه اصلاح را بپرس.
4. لحن تشویق‌کننده و ساده داشته باش؛ از جمله‌های کوتاه استفاده کن.`,
 ps: `ته په افغانستان کې د یوه ښوونځي «درسي ملګری» یې. په پښتو لنډ او مهربانه ځواب ورکړه.
سخت قوانین:
1. هېڅکله د زده کوونکي د دندې وروستی ځواب نه لیکې او د هغه مسئله نه حل کوې.
2. پر ځای یې: تشریح کوې چې پوښتنه څه غواړي، طریقه او ګامونه ورښیې، یوه ورته بېلګه له نورو عددونو سره حل کوې، او لارښوونکې پوښتنې کوې.
3. که زده کوونکی وغواړي چې کار یې وګورې، یوازې د تېروتنې ځای وښایاست او د سمونې لار یې وپوښته.
4. تشویقوونکی او ساده لحن ولره؛ لنډې جملې وکاروه.`,
 en: `You are the study helper of a school in Afghanistan. Reply briefly and kindly in English.
Hard rules:
1. You never write the final answer to a student's own homework and never solve their problem.
2. Instead: explain what the question asks, teach the method and steps, work a similar example with different numbers, and ask guiding questions.
3. If the student asks you to check their work, only point at the mistake and ask how they would fix it.
4. Keep an encouraging, simple tone and short sentences.`
};
const CLINIC_SYSTEM = {
 fa: 'تو دستیار اطلاعات سلامت یک کلینیک در افغانستان هستی. هرگز تشخیص نمی‌دهی و دوا تجویز نمی‌کنی. فقط اطلاعات عمومی می‌دهی و در نشانه‌های خطر فوراً می‌گویی به کلینیک مراجعه کند.',
 ps: 'ته په افغانستان کې د یوه کلینیک د روغتیایي معلوماتو مرستیال یې. هېڅکله تشخیص نه کوې او دوا نه وړاندیز کوې. یوازې عمومي معلومات ورکوې او د خطر په نښو کې سملاسي وایې چې کلینیک ته ولاړ شي.',
 en: 'You are the health-information assistant of a clinic in Afghanistan. You never diagnose and never prescribe. You only give general information and tell the user to go to the clinic immediately for danger signs.'
};

async function callLLM({ lang, module, question, context, history }) {
 const key = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
 if (!key || String(process.env.AI_ENABLED || '1') === '0') return null;
 const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
 const model = process.env.AI_MODEL || 'gpt-4o-mini';
 const system = [
 module === 'clinic'? CLINIC_SYSTEM[lang] : SYSTEM_PROMPT[lang],
 context?.homework ? `Context — current task: ${U.tr(context.homework.title, lang)}. ${U.tr(context.homework.instructions, lang)}. You may explain this task but must never solve it.`: '',
 context?.subject ? `Subject: ${U.tr(context.subject, lang)}`: '',
 `Always answer in the language code: ${lang} (fa=Dari, ps=Pashto, en=English).`
 ].filter(Boolean).join('\n');
 const messages = [
 { role: 'system', content: system },
 ...history.slice(-6).map((m) => ({ role: m.role === 'assistant'? 'assistant': 'user', content: String(m.content).slice(0, 1200) })),
 { role: 'user', content: String(question).slice(0, 1500) }
 ];
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 25000));
 try {
 const res = await fetch(`${base}/chat/completions`, {
 method: 'POST',
 headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`},
 body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 700 }),
 signal: controller.signal
 });
 if (!res.ok) throw new Error(`llm_${res.status}`);
 const data = await res.json();
 const text = data?.choices?.[0]?.message?.content?.trim();
 return text || null;
 } catch (err) {
 console.warn('[ai] llm unavailable, using offline engine:', err.message);
 return null;
 } finally {
 clearTimeout(timer);
 }
}

// ------------------------------------------------------------------ entry ---
async function ask({ question, lang = 'fa', module = 'school', history = [], context = {} }) {
 const language = LANGS.includes(lang) ? lang : 'fa';
 const intent = detectIntent(question);
 const meta = { intent, lang: language, provider: 'offline', guardrail: false };

 // 1. Hard guardrail — never solve the student's own task --------------------
 if (module === 'school'&& intent === 'solve_request') {
 meta.guardrail = true;
 const r = REFUSAL[language];
 return { text: wrap([r.head, r.body, r.tail]), meta, suggestions: SUGGESTIONS[language].slice(0, 3) };
 }

 // 2. Try the LLM when configured ------------------------------------------
 if (context.preferLLM !== false) {
 const llm = await callLLM({ lang: language, module, question, context, history });
 if (llm) {
 meta.provider = process.env.AI_BASE_URL ? 'compatible': 'openai';
 meta.model = process.env.AI_MODEL || 'gpt-4o-mini';
 return { text: llm, meta, suggestions: SUGGESTIONS[language].slice(0, 3) };
 }
 }

 // 3. Offline engine --------------------------------------------------------
 if (module === 'clinic') {
 return { text: healthAnswer(question, language), meta, suggestions: [] };
 }
 if (intent === 'check_work') return { text: checkWorkAnswer(language), meta, suggestions: SUGGESTIONS[language].slice(0, 2) };

 const terms = lookupVocab(question);
 if (intent === 'meaning'&& terms.length) {
 return { text: meaningAnswer(terms, language), meta, suggestions: SUGGESTIONS[language].slice(0, 2) };
 }
 const methodKey = { memorize: 'memorize', plan: 'plan', exam: 'exam', focus: 'focus', notes: 'notes'}[intent];
 if (methodKey && STUDY_METHODS[methodKey]) {
 return { text: STUDY_METHODS[methodKey][language], meta, suggestions: SUGGESTIONS[language].slice(0, 2) };
 }

 const topic = matchTopic(question);
 if (topic) {
 const parts = [];
 if (context.homework) parts.push(explainTask(context, language));
 parts.push(topicAnswer(topic, language));
 meta.topic = topic.id;
 return { text: wrap(parts), meta, suggestions: SUGGESTIONS[language] };
 }
 if (context.homework) {
 const explained = explainTask(context, language);
 return {
 text: wrap([explained, genericAnswer(language)]),
 meta, suggestions: SUGGESTIONS[language]
 };
 }
 if (terms.length) return { text: meaningAnswer(terms, language), meta, suggestions: SUGGESTIONS[language].slice(0, 2) };
 return { text: genericAnswer(language), meta, suggestions: SUGGESTIONS[language] };
}

/** Short welcome shown when a chat opens. */
function greeting(lang = 'fa', module = 'school') {
 if (module === 'clinic') {
 return {
 fa: 'سلام! من دستیار اطلاعات سلامت هستم. می‌توانم دربارهٔ نشانه‌ها، آمادگی برای ملاقات، واکسین و دوا معلومات عمومی بدهم — اما تشخیص نمی‌دهم. در موارد عاجل فوراً به کلینیک مراجعه کنید.',
 ps: 'سلام! زه د روغتیایي معلوماتو مرستیال یم. کولای شم د نښو، د ملاقات چمتووالي، واکسین او دوا په اړه عمومي معلومات ورکړم — خو تشخیص نه کوم. په عاجلو حالاتو کې سملاسي کلینیک ته ولاړ شئ.',
 en: 'Hello! I am the health-information assistant. I can explain symptoms, how to prepare for a visit, vaccines and medicines in general — but I never diagnose. For emergencies go to the clinic immediately.'
 }[lang];
 }
 return {
 fa: 'سلام! من همیار درسی شما هستم. می‌توانم وظیفه را برایت توضیح بدهم، قدم‌ها را یادت بدهم و مثال مشابه حل کنم — اما کار خانه را به‌جای تو انجام نمی‌دهم. چه می‌خواهی یاد بگیری؟',
 ps: 'سلام! زه ستا درسي ملګری یم. کولای شم دنده درته تشریح کړم، ګامونه در وښیم او ورته بېلګه حل کړم — خو کورنۍ دنده ستا پر ځای نه جوړوم. څه غواړې زده کړې؟',
 en: "Hello! I'm your study helper. I can explain the task, teach you the steps and work a similar example — but I won't do your homework for you. What would you like to learn?"
 }[lang];
}

module.exports = { ask, greeting, detectIntent, REFUSAL, URGENT };
