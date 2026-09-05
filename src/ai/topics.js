'use strict';
/**
 * Offline knowledge bank for the Socratic tutor.
 * Each topic: keywords matched against the student's question, then a
 * three-language explanation, a step framework (never a final answer),
 * guiding questions, and one WORKED SIMILAR EXAMPLE (different numbers).
 */

const TOPICS = [
  {
    id: 'algebra',
    subject: 'ریاضی',
    keywords: ['algebra', 'equation', 'solve for x', 'variable', 'معادله', 'جبر', 'حل کن', 'x', 'مساوات', 'متغیر'],
    content: {
      fa: {
        summary: 'معادله یعنی دو طرف ترازو باید برابر بماند. هرچه را در یک طرف انجام می‌دهی، در طرف دیگر هم انجام بده تا متغیر تنها بماند.',
        steps: ['شرط و خواستهٔ مسئله را بنویس (چه معلوم است، چه مجهول است).', 'عملیات معکوس را برعکسِ ترتیب انجام بده (ابتدا جمع/تفریق، بعد ضرب/تقسیم).', 'جواب را در معادلهٔ اصلی جایگذاری کن تا درستی آن را بررسی کنی.'],
        questions: ['اگر متغیر را یک عدد ساده فرض کنی، کدام طرف بزرگ‌تر می‌شود؟', 'کدام عمل روی متغیر انجام شده است که باید برعکس شود؟'],
        example: 'مثال مشابه: 2x + 6 = 14 → ابتدا ۶ را از دو طرف کم می‌کنیم: 2x = 8، بعد بر ۲ تقسیم می‌کنیم: x = 4. بررسی: 2×4 + 6 = 14 ✔'
      },
      ps: {
        summary: 'معادله د تلی په شان ده: دواړه خواوې باید برابرې پاتې شي. هر څه چې په یوه خوا کوې، په بله خوا یې هم وکړه.',
        steps: ['معلومات او مجهول ولیکه.', 'معکوس عملیات په معکوس ترتیب وکاروه.', 'ځواب په اصلي معادله کې وازمایه.'],
        questions: ['که مجهول یو ساده عدد وګڼې، کومه خوا لویه کېږي؟', 'کوم عملیات پر مجهول شوي چې باید معکوس شي؟'],
        example: 'ورته مثال: 2x + 6 = 14 → لومړی له دواړو خواوو ۶ کموو: 2x = 8، بیا پر ۲ وېشو: x = 4. کتنه: 2×4 + 6 = 14 ✔'
      },
      en: {
        summary: 'An equation is a balance: both sides must stay equal. Whatever you do to one side, do to the other until the variable stands alone.',
        steps: ['Write what is known and what is unknown.', 'Undo operations in reverse order (add/subtract first, then multiply/divide).', 'Substitute your answer back to check it.'],
        questions: ['If you guess a simple number, which side becomes bigger?', 'Which operation is applied to the variable that must be undone?'],
        example: 'Similar example: 2x + 6 = 14 → subtract 6 from both sides: 2x = 8, then divide by 2: x = 4. Check: 2×4 + 6 = 14 ✔'
      }
    }
  },
  {
    id: 'fractions',
    subject: 'ریاضی',
    keywords: ['fraction', 'کسر', 'کسری', 'numerator', 'denominator', 'صورت', 'مخرج', 'برخه'],
    content: {
      fa: {
        summary: 'کسر یعنی «چند بخش از کل». برای جمع و تفریق باید مخرج‌ها یکی شود؛ برای ضرب، صورت در صورت و مخرج در مخرج.',
        steps: ['مخرج‌ها را مقایسه کن؛ اگر متفاوت بود مخرج مشترک پیدا کن.', 'صورت‌ها را با همان ضریب بزرگ کن و سپس عمل را انجام بده.', 'در پایان کسر را ساده کن (تقسیم بر بزرگ‌ترین مقسوم‌علیه مشترک).'],
        questions: ['مخرج مشترک کوچک این دو عدد چند می‌شود؟', 'آیا کسر جواب از یک بزرگ‌تر است؟ آن را به عدد مخلوط تبدیل کن.'],
        example: 'مثال مشابه: 1/3 + 1/6 → مخرج مشترک ۶ است؛ 1/3 = 2/6 پس 2/6 + 1/6 = 3/6 = 1/2.'
      },
      ps: {
        summary: 'کسر یعنې «د ټول څو برخې». د جمع او تفریق لپاره مخرجونه باید یو شي؛ د ضرب لپاره صورت په صورت او مخرج په مخرج.',
        steps: ['مخرجونه پرتله کړه؛ که توپیر لري ګډ مخرج پیدا کړه.', 'صورتونه په هماغه ضریب لوی کړه بیا عملیه وکړه.', 'په پای کې کسر ساده کړه.'],
        questions: ['د دې دوو عددونو کوچنی ګډ مخرج څو دی؟', 'آیا ځواب له یوه لوی دی؟ په مخلوط عدد یې واړوه.'],
        example: 'ورته مثال: 1/3 + 1/6 → ګډ مخرج ۶ دی؛ 1/3 = 2/6 نو 2/6 + 1/6 = 3/6 = 1/2.'
      },
      en: {
        summary: 'A fraction means "how many parts of a whole". To add or subtract, make the denominators the same; to multiply, multiply top by top and bottom by bottom.',
        steps: ['Compare denominators; if they differ, find a common one.', 'Scale the numerators with the same factor, then operate.', 'Simplify the result at the end.'],
        questions: ['What is the lowest common denominator here?', 'Is the answer bigger than 1? Convert it to a mixed number.'],
        example: 'Similar example: 1/3 + 1/6 → common denominator 6; 1/3 = 2/6 so 2/6 + 1/6 = 3/6 = 1/2.'
      }
    }
  },
  {
    id: 'geometry',
    subject: 'ریاضی',
    keywords: ['geometry', 'area', 'perimeter', 'triangle', 'circle', 'مثلث', 'دایره', 'مساحت', 'محیط', 'هندسه', 'زاویه', 'angle'],
    content: {
      fa: {
        summary: 'در هندسه اول شکل را بشناس و فرمول درست را انتخاب کن. محیط یعنی دورِ شکل، مساحت یعنی سطحِ درونِ شکل.',
        steps: ['اندازه‌های معلوم را روی شکل علامت بزن.', 'فرمول مناسب را بنویس (محیط = جمع اضلاع، مساحت مستطیل = طول × عرض).', 'واحد را فراموش نکن (سانتی‌متر، متر مربع).'],
        questions: ['آیا خواستهٔ سؤال محیط است یا مساحت؟', 'کدام اندازه‌ها داده نشده و باید خودت حساب کنی؟'],
        example: 'مثال مشابه: مستطیل با طول ۷ و عرض ۳ → محیط = ۲×(۷+۳) = ۲۰ و مساحت = ۷×۳ = ۲۱.'
      },
      ps: {
        summary: 'په هندسه کې لومړی شکل وپېژنه او سم فورمول غوره کړه. محیط د شکل چاپېره دی، مساحت دننه سطحه ده.',
        steps: ['معلوم اندازې پر شکل په نښه کړه.', 'مناسب فورمول ولیکه.', 'واحد مه هېروه.'],
        questions: ['پوښتنه محیط غواړي که مساحت؟', 'کوم اندازې نه دي ورکړل شوي چې باید حساب یې کړې؟'],
        example: 'ورته مثال: مستطیل چې اوږدوالی یې ۷ او پلنوالی ۳ دی → محیط = ۲×(۷+۳) = ۲۰ او مساحت = ۲۱.'
      },
      en: {
        summary: 'In geometry, first identify the shape and pick the right formula. Perimeter is the distance around; area is the surface inside.',
        steps: ['Mark the known measurements on the shape.', 'Write the matching formula.', 'Do not forget the unit (cm, m²).'],
        questions: ['Does the question ask for perimeter or area?', 'Which measurements are missing that you must calculate first?'],
        example: 'Similar example: a rectangle 7 by 3 → perimeter = 2×(7+3) = 20, area = 7×3 = 21.'
      }
    }
  },
  {
    id: 'photosynthesis',
    subject: 'علوم',
    keywords: ['photosynthesis', 'plant', 'chlorophyll', 'فتوسنتز', 'نبات', 'گیاه', 'برگ', 'سبزینه', 'نور', 'بوټی', 'پاڼه'],
    content: {
      fa: {
        summary: 'فتوسنتز راهی است که گیاه با آن از نور خورشید، آب و دی‌اکسیدکربن غذا (قند) و اکسیژن می‌سازد.',
        steps: ['سه مادهٔ ورودی را نام ببر: نور، آب، دی‌اکسیدکربن.', 'دو مادهٔ خروجی را نام ببر: قند و اکسیژن.', 'نقش سبزینه (کلروفیل) در برگ را توضیح بده: جذب نور.'],
        questions: ['اگر گیاه در تاریکی بماند چه می‌شود؟ چرا؟', 'چرا برگ‌ها سبز به نظر می‌رسند؟'],
        example: 'مثال مشابه برای توضیح: برگی را در نظر بگیر که فقط نیمی از آن با کاغذ سیاه پوشانده شده؛ بعد از چند روز فقط بخش نور دیده رنگ نشاسته می‌گیرد.'
      },
      ps: {
        summary: 'فتوسنتز هغه لاره ده چې بوټی د لمر له رڼا، اوبو او کاربن ډای اکسایډ څخه خواړه (قند) او اکسیجن جوړوي.',
        steps: ['درې ننوتونکي مواد ووایه: رڼا، اوبه، کاربن ډای اکسایډ.', 'دوه وتونکي مواد ووایه: قند او اکسیجن.', 'د پاڼې د کلوروفیل رول تشریح کړه.'],
        questions: ['که بوټی په تیاره کې پاتې شي څه کېږي؟ ولې؟', 'ولې پاڼې شنې ښکاري؟'],
        example: 'ورته مثال: یوه پاڼه چې نیمایي یې په تور کاغذ پوښل شوې وي؛ څو ورځې وروسته یوازې د رڼا لیدلې برخه نشایسته لري.'
      },
      en: {
        summary: 'Photosynthesis is how a plant uses sunlight, water and carbon dioxide to make food (sugar) and oxygen.',
        steps: ['Name the three inputs: light, water, carbon dioxide.', 'Name the two outputs: sugar and oxygen.', 'Explain the role of chlorophyll in the leaf: capturing light.'],
        questions: ['What happens if a plant is kept in the dark, and why?', 'Why do leaves look green?'],
        example: 'Similar example: a leaf half-covered with black paper — after a few days only the lit part tests positive for starch.'
      }
    }
  },
  {
    id: 'water_cycle',
    subject: 'علوم',
    keywords: ['water cycle', 'evaporation', 'condensation', 'rain', 'دوره آب', 'چرخه آب', 'تبخیر', 'باران', 'اوبو دوران', 'بړاس'],
    content: {
      fa: {
        summary: 'چرخهٔ آب چهار مرحله دارد: تبخیر، تراکم، بارش و جمع‌آوری. آب در این چرخه از بین نمی‌رود، فقط تغییر حالت می‌دهد.',
        steps: ['تبخیر: خورشید آب را به بخار تبدیل می‌کند.', 'تراکم: بخار در هوای سرد به قطره تبدیل می‌شود و ابر می‌سازد.', 'بارش و بازگشت آب به رودها و دریاها.'],
        questions: ['در کوه‌های سرد افغانستان برف چه نقشی در ذخیرهٔ آب دارد؟', 'اگر تبخیر نبود چه می‌شد؟'],
        example: 'مثال مشابه: ظرف آبی را کنار پنجره بگذار؛ بعد از چند روز سطح آب کم می‌شود و روی شیشه قطره می‌نشیند — همان تبخیر و تراکم.'
      },
      ps: {
        summary: 'د اوبو دوره څلور پړاوه لري: تبخیر، تراکم، اورښت او راټولېدل. اوبه نه ورکېږي، یوازې حالت بدلوي.',
        steps: ['تبخیر: لمر اوبه په بړاس بدلوي.', 'تراکم: بړاس په سړه هوا کې څاڅکي او ورېځ جوړوي.', 'اورښت او بېرته سیندونو ته ګرځېدل.'],
        questions: ['د افغانستان په سړو غرونو کې واوره د اوبو په زېرمه کې څه رول لري؟', 'که تبخیر نه وای څه به کېدل؟'],
        example: 'ورته مثال: د اوبو لوښی کړکۍ ته نږدې کېږده؛ څو ورځې وروسته اوبه کمې شي او پر ښيښه څاڅکي کېني.'
      },
      en: {
        summary: 'The water cycle has four stages: evaporation, condensation, precipitation and collection. Water is never lost — it only changes state.',
        steps: ['Evaporation: the sun turns water into vapour.', 'Condensation: vapour cools into droplets and forms clouds.', 'Precipitation and the return of water to rivers and seas.'],
        questions: ['What role does snow in Afghanistan\'s mountains play in storing water?', 'What would happen without evaporation?'],
        example: 'Similar example: leave a bowl of water by a window — after days the level drops and droplets form on the glass: evaporation and condensation.'
      }
    }
  },
  {
    id: 'essay_writing',
    subject: 'دری',
    keywords: ['essay', 'انشا', 'مقاله', 'writing', 'paragraph', 'پاراګراف', 'لیکنه', 'write', 'composition'],
    content: {
      fa: {
        summary: 'انشای خوب سه بخش دارد: مقدمه (معرفی موضوع)، بدنه (دو تا سه پاراگراف با مثال) و نتیجه (خلاصه و نظر تو).',
        steps: ['موضوع و هدف را در یک جمله بنویس.', 'برای هر پاراگراف یک نکتهٔ اصلی و یک مثال واقعی انتخاب کن.', 'در پایان نتیجه بگیر و نظر خودت را بنویس.'],
        questions: ['یک خاطره یا مثال واقعی که به موضوع ربط دارد چیست؟', 'اگر خواننده فقط یک جمله بخواند، کدام جمله باید باشد؟'],
        example: 'مثال مشابه: موضوع «روز بارانی» — مقدمه: صدای باران روی بام؛ بدنه: بوی خاک و بازی کودکان؛ نتیجه: باران برای کشاورزی نعمت است.'
      },
      ps: {
        summary: 'ښه انشا درې برخې لري: سریزه، منځ (دوه یا درې پراګرافه له مثال سره) او پایله.',
        steps: ['موضوع او هدف په یوه جمله ولیکه.', 'د هر پراګراف لپاره یوه اصلي خبره او یو ریښتینی مثال غوره کړه.', 'په پای کې پایله او خپل نظر ولیکه.'],
        questions: ['کومه ریښتینې خاطره له موضوع سره تړاو لري؟', 'که لوستونکی یوازې یوه جمله ولولي، هغه باید کومه وي؟'],
        example: 'ورته مثال: موضوع «باراني ورځ» — سریزه: د باران غږ؛ منځ: د خاورې بوی او د ماشومانو لوبې؛ پایله: باران د کرنې لپاره نعمت دی.'
      },
      en: {
        summary: 'A good essay has three parts: an introduction, a body (two or three paragraphs with examples) and a conclusion with your own view.',
        steps: ['State the topic and purpose in one sentence.', 'Give each paragraph one main point and one real example.', 'Finish with a conclusion and your own opinion.'],
        questions: ['Which real memory or example connects to the topic?', 'If the reader reads only one sentence, which should it be?'],
        example: 'Similar example: topic "A rainy day" — intro: the sound of rain on the roof; body: the smell of earth and children playing; conclusion: rain is a blessing for farming.'
      }
    }
  },
  {
    id: 'english_grammar',
    subject: 'English',
    keywords: ['grammar', 'tense', 'verb', 'present', 'past', 'noun', 'sentence', 'گرامر', 'زمان', 'فعل', 'جمله'],
    content: {
      fa: {
        summary: 'هر جملهٔ انگلیسی معمولاً «فاعل + فعل + مفعول» است. زمان فعل نشان می‌دهد کار کی اتفاق افتاده است.',
        steps: ['فاعل را پیدا کن (who / what).', 'زمان را از قید زمان معلوم کن (yesterday → گذشته، every day → سادهٔ حال).', 'شکل درست فعل را انتخاب کن و جمله را بلند بخوان.'],
        questions: ['قید زمان در جمله کدام است؟', 'آیا فعل باید سوم‌شخص (he/she) باشد؟'],
        example: 'مثال مشابه: "She goes to school every day" (حال ساده) در برابر "She went to school yesterday" (گذشتهٔ ساده).'
      },
      ps: {
        summary: 'هره انګلیسي جمله معمولاً «فاعل + فعل + مفعول» ده. د فعل زمان ښیي چې کار کله شوی دی.',
        steps: ['فاعل پیدا کړه.', 'د وخت له قیده زمان معلومه کړه.', 'د فعل سمه بڼه غوره کړه او جمله په لوړ غږ ولوله.'],
        questions: ['په جمله کې د وخت قید کوم دی؟', 'آیا فعل باید دریم شخص وي؟'],
        example: 'ورته مثال: "She goes to school every day" د "She went to school yesterday" پر وړاندې.'
      },
      en: {
        summary: 'An English sentence is usually subject + verb + object, and the tense shows when the action happens.',
        steps: ['Find the subject (who / what).', 'Use the time expression to choose the tense (yesterday → past, every day → present simple).', 'Pick the right verb form and read the sentence aloud.'],
        questions: ['Which time expression is in the sentence?', 'Does the verb need the third-person -s?'],
        example: 'Similar example: "She goes to school every day" (present simple) vs "She went to school yesterday" (past simple).'
      }
    }
  },
  {
    id: 'afghanistan_history',
    subject: 'تاریخ',
    keywords: ['history', 'afghanistan', 'kabul', 'تاریخ', 'افغانستان', 'کابل', 'غزنی', 'هرات', 'تاریخچه', 'تاريخ'],
    content: {
      fa: {
        summary: 'برای پاسخ به سؤال تاریخی، سه چیز را روشن کن: چه زمانی، کجا، و چرا مهم بود.',
        steps: ['دورهٔ زمانی را مشخص کن (قرن یا سال).', 'مکان و افراد اصلی را نام ببر.', 'یک پیامد بنویس: این رویداد چه چیزی را تغییر داد؟'],
        questions: ['منبع یا کتابی که از آن خوانده‌ای کدام است؟', 'چرا این رویداد هنوز هم مهم است؟'],
        example: 'مثال مشابه: پاسخ خوب دربارهٔ یک شهر تاریخی: زمان ساخت، نام بانی، نقش آن در تجارت، و وضعیت امروز آن.'
      },
      ps: {
        summary: 'د تاریخي پوښتنې لپاره درې شیان روښانه کړه: کله، چېرته، او ولې مهم وو.',
        steps: ['وخت (پېړۍ یا کال) معلوم کړه.', 'ځای او اصلي کسان وپېژنه.', 'یوه پایله ولیکه: دا پېښې څه بدل کړل؟'],
        questions: ['کوم کتاب یا سرچینه دې لوستلې ده؟', 'ولې دا پېښه لا هم مهمه ده؟'],
        example: 'ورته مثال: د یوه تاریخي ښار په اړه ښه ځواب: د جوړېدو وخت، د بنسټګر نوم، د سوداګرۍ رول، او نننی حالت.'
      },
      en: {
        summary: 'To answer a history question, make three things clear: when, where, and why it mattered.',
        steps: ['Fix the time period (century or year).', 'Name the place and the main people.', 'Write one consequence: what changed because of it?'],
        questions: ['Which book or source did you read this in?', 'Why does the event still matter today?'],
        example: 'Similar example: a strong answer about a historic city covers when it was built, who founded it, its trade role, and its state today.'
      }
    }
  }
];

/** Dari ⇄ Pashto ⇄ English glossary of everyday school words. */
const VOCAB = [
  { en: 'homework', fa: 'کار خانه / وظیفه', ps: 'کورنۍ دنده' },
  { en: 'teacher', fa: 'معلم / استاد', ps: 'ښوونکی' },
  { en: 'student', fa: 'شاگرد / محصل', ps: 'زده کوونکی' },
  { en: 'school', fa: 'مکتب / مدرسه', ps: 'ښوونځی' },
  { en: 'class', fa: 'صنف', ps: 'ټولګی' },
  { en: 'exam', fa: 'امتحان', ps: 'ازموینه' },
  { en: 'book', fa: 'کتاب', ps: 'کتاب' },
  { en: 'notebook', fa: 'کتابچه', ps: 'کتابچه' },
  { en: 'pen', fa: 'قلم', ps: 'قلم' },
  { en: 'question', fa: 'سؤال', ps: 'پوښتنه' },
  { en: 'answer', fa: 'جواب', ps: 'ځواب' },
  { en: 'lesson', fa: 'درس', ps: 'درس' },
  { en: 'subject', fa: 'موضوع / مضمون', ps: 'مضمون' },
  { en: 'timetable', fa: 'جدول درسی', ps: 'د درس جدول' },
  { en: 'holiday', fa: 'رخصتی', ps: 'رخصتي' },
  { en: 'absent', fa: 'غیرحاضر', ps: 'غیرحاضر' },
  { en: 'present', fa: 'حاضر', ps: 'حاضر' },
  { en: 'grade / mark', fa: 'نمره', ps: 'نمره' },
  { en: 'improvement', fa: 'بهبود', ps: 'ښه والی' },
  { en: 'parent', fa: 'والدین', ps: 'مور او پلار' },
  { en: 'principal', fa: 'مدیر مکتب', ps: 'د ښوونځي مدیر' },
  { en: 'library', fa: 'کتابخانه', ps: 'کتابتون' },
  { en: 'clinic', fa: 'کلینیک', ps: 'کلینیک' },
  { en: 'doctor', fa: 'داکتر', ps: 'ډاکټر' },
  { en: 'nurse', fa: 'نرس', ps: 'نرس' },
  { en: 'medicine', fa: 'دوا', ps: 'درمل' },
  { en: 'appointment', fa: 'ملاقات / وقت', ps: 'ملاقات' },
  { en: 'fever', fa: 'تب', ps: 'تبه' },
  { en: 'pain', fa: 'درد', ps: 'درد' },
  { en: 'vaccination', fa: 'واکسین', ps: 'واکسین' },
  { en: 'patient', fa: 'مریض', ps: 'ناروغ' },
  { en: 'pharmacy', fa: 'دواخانه', ps: 'درملتون' },
  { en: 'queue / token', fa: 'نوبت', ps: 'نوبت' },
  { en: 'water', fa: 'آب', ps: 'اوبه' },
  { en: 'sun', fa: 'آفتاب / خورشید', ps: 'لمر' },
  { en: 'to study', fa: 'درس خواندن', ps: 'درس لوستل' },
  { en: 'to write', fa: 'نوشتن', ps: 'لیکل' },
  { en: 'to read', fa: 'خواندن', ps: 'لوستل' },
  { en: 'difficult', fa: 'مشکل / دشوار', ps: 'ستونزمن' },
  { en: 'easy', fa: 'آسان', ps: 'اسان' }
];

/** Study-coach answers for the questions students ask most. */
const STUDY_METHODS = {
  memorize: {
    fa: 'برای حفظ کردن: مطلب را به ۳ بخش کوچک تقسیم کن، هر بخش را بلند بخوان، سپس کتاب را ببند و از حفظ بنویس. ۲۰ دقیقه بعد دوباره امتحان کن؛ فاصله انداختن بین مرورها حفظ را قوی می‌کند.',
    ps: 'د یادولو لپاره: مطلب په درې کوچنیو برخو ووېشه، هره برخه په لوړ غږ ولوله، بیا کتاب وتړه او له یاده یې ولیکه. ۲۰ دقیقې وروسته بیا ازموینه وکړه.',
    en: 'To memorise: split the material into 3 small chunks, read each aloud, then close the book and write it from memory. Test yourself again 20 minutes later — spaced review makes memory stick.'
  },
  plan: {
    fa: 'نقشهٔ مطالعه: امروز ۳ کار مهم را بنویس، برای هر کدام ۲۵ دقیقه وقت بگذار و ۵ دقیقه استراحت کن. سخت‌ترین کار را اول انجام بده.',
    ps: 'د مطالعې پلان: نن درې مهم کارونه ولیکه، هر یوه ته ۲۵ دقیقې ورکړه او ۵ دقیقې دمه وکړه. تر ټولو ستونزمن کار لومړی وکړه.',
    en: 'Study plan: write your 3 most important tasks, work 25 minutes on each with a 5-minute break. Do the hardest one first.'
  },
  exam: {
    fa: 'آمادگی امتحان: خلاصهٔ هر درس را در یک صفحه بنویس، نمونه سوال حل کن، و شب امتحان زود بخواب. در جلسه اول سؤال‌های آسان را جواب بده.',
    ps: 'د ازموینې چمتووالی: د هر درس لنډیز په یوه مخ ولیکه، نمونې پوښتنې حل کړه، او د ازموینې شپه ویده شه. په تالار کې لومړی اسانې پوښتنې ځواب کړه.',
    en: 'Exam prep: summarise each lesson on one page, practise past questions, and sleep well. In the hall, answer the easy questions first.'
  },
  focus: {
    fa: 'برای تمرکز: گوشی را از اتاق بیرون بگذار، یک بطری آب و کاغذ کنار دستت باشد، و فقط یک کار را شروع کن. اگر حواس‌ت پرت شد، یک خط بنویس و دوباره برگرد.',
    ps: 'د تمرکز لپاره: موبایل له کوټې وباسه، اوبه او کاغذ څنګ ته کېږده، او یوازې یو کار پیل کړه. که حواس دې ووېشل شول، یوه کرښه ولیکه او بېرته راشه.',
    en: 'To focus: put your phone out of the room, keep water and paper beside you, and start just one task. When distracted, write one line and come back.'
  },
  notes: {
    fa: 'یادداشت خوب: فقط نکته‌های اصلی را بنویس، از علامت و رنگ استفاده کن، و در پایان هر درس ۳ خط خلاصه بنویس.',
    ps: 'ښه یاداښت: یوازې اصلي ټکي ولیکه، له نښو او رنګه کار واخله، او د هر درس په پای کې درې کرښې لنډیز ولیکه.',
    en: 'Good notes: write only main points, use symbols and colour, and end each lesson with a three-line summary.'
  }
};

module.exports = { TOPICS, VOCAB, STUDY_METHODS };
