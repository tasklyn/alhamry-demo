#!/usr/bin/env node
// حارسُ الانجراف — أثرٌ يمنع، لا عَرْضٌ يُخبر.
//
// القاعدةُ المفروضة، واحدةٌ لا أكثر:
//   إذا كان إنذارُ الانجراف ناطقاً (نصيبُ العسير في آخر HARD_WIN مدخلاً
//   أدنى من الكلّيّ بـTHRESHOLD نقطةً فأكثر) — فلا يُقبَل commit
//   يضيف مداخلَ سهلةً فقط إلى BENCH.
//
// حدُّ الضمان، مصرَّحٌ به: يُتجاوَز بـ`git commit --no-verify`.
//   فهو لا يمنع الانجرافَ منعاً — بل يجعل التجاوزَ فعلاً ظاهراً لا صمتاً.
//
// ── جولة ٣٨٣: الإعفاءُ المشروط ──
// العطبُ المرصود: ستُّ تجاوزاتٍ للحارس منذ بنائه (٣١١ · ٣١٢ · ٣١٣ · ٣١٤ · ٣٥٥ · ٣٨٢)،
//   وكلُّها جولاتٌ داخليّةٌ بأمرِ معيارها. والأداةُ لا تفرّق بين جولةٍ سهلةٍ وجولةٍ
//   مُنعت من الاستعلام. وجولةُ ٣١٣ سمّت الخطرَ بنصّه: «الاستثناءُ المُعلَنُ ثلاثَ
//   مرّاتٍ متتاليةٍ لم يعد استثناءً بل قاعدةً غيرَ مكتوبة».
//
// فتُكتَب القاعدةُ ويُوضَع لها ثمن، ولا يُوسَّع البابُ:
//   ١) الإعفاءُ **لا يُصدِره القائمُ بالجولة لنفسه**: يُسمّي في تقريره الجولةَ التي
//      أذنت له، ولا يُقبَل إلّا إذا كان **معيارُ تلك الجولة نفسُه** — المكتوبُ قبل
//      أن تُعرَف حاجةُ اليوم — ينهى عن الاستعلام نصّاً.
//   ٢) والإعفاءُ **دَينٌ لا عفو**: إن لم يُضَف مدخلٌ عسيرٌ خلال DEBT_WIN جولاتٍ
//      بعده، مُنع الالتزامُ **ولو كان الإنذارُ صامتاً**.
//   ٣) والسجلُّ يُطبَع في كلّ تشغيل — فيُرى تكرارُ الاستثناء لا يُنسى.
//
// الاستعمال: node tools/drift-check.mjs   (يقرأ agents.html في الشجرة مقابلَ HEAD)
//   node tools/drift-check.mjs --audit ٣١١ ٣١٢ …   (فحصٌ رجعيّ: أكان يُعفى؟)
//   يخرج بـ0 إذا مرّ، وبـ1 إذا مُنع، وبـ2 إذا تعذّر الفحصُ نفسُه.

import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILE = 'agents.html';
const THRESHOLD = 10;
const DEBT_WIN = 3;            // جولاتٌ يجب أن يُسدَّد الدَّينُ خلالها
const RESEARCH = 'research';

// ── أدواتُ الإعفاء ──
const AR_DIGITS = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
const toNum = s => Number(String(s).replace(/[٠-٩]/g, d => AR_DIGITS[d]));
// تُجرَّد الحركاتُ والتطويلُ قبل المطابقة — فالنصُّ مشكولٌ في التقارير.
const bare = s => String(s).replace(/[\u064B-\u0652\u0640]/g, '');

// وسمُ الإعفاء في تقرير الجولة، ويسمّي الجولةَ الآذنة:
//   **إعفاءُ الانجراف — بإذن معيار ٣٨١:** …
const MARK = /إعفاء\s*الانجراف\s*—\s*بإذن\s*معيار\s*([٠-٩0-9]+)/;
// نهيٌ عن الاستعلام — ويُقرأ من **المعيار** وحدَه لا من ذيل التقرير.
// جولة ٣٨٤: كان يُقرأ من آخر ١٨٠٠ حرف، فوقع في سبع مطابقاتٍ كاذبةٍ من أربعَ عشرة —
//   وسببُها سطرٌ قياسيٌّ في قسم «ما لم أستطع الوصول إليه»: «لا استعلامَ خارجيّ — بأمر
//   المعيار». وذلك وصفُ الجولة **لنفسها**، لا أمرٌ للتالية — فكان يُجيز الإذنَ الذاتيَّ
//   الذي بُني القيدُ الأوّلُ لمنعه. وفيها ٣٦٤ و٣٦٩ وقد **أمر معيارُهما باستعلامٍ خارجيّ**.
// والمعيارُ في هذه التقارير بنيةٌ ثابتة: **آخرُ اقتباسٍ (`> …`) في الملفّ**.
const BAN  = /لا\s*(?:تجر|تجري|يجر)?\s*استعلام/;
// جولة ٣٩٧: كان يُقرأ **آخرُ سطرٍ** من الاقتباس، والمعيارُ يُكتَب **كتلةً** من أسطرٍ
//   متتالية. فأُخفق إعفاءُ ٣٩٧ لأنّ النهيَ في السطر ما قبل الأخير. فصار يُقرأ
//   **آخرُ كتلةٍ متّصلة** من أسطر الاقتباس. وقِيس أثرُه قبل التثبيت: لا يُعفي جولةً
//   كان معيارُها يأمر بالاستعلام، ولا يُسقِط إعفاءً صحيحاً.
function criterion(text) {
  const lines = text.split('\n');
  let end = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (/^>/.test(lines[i])) { end = i; break; }
  if (end < 0) return '';
  let start = end;
  while (start > 0 && /^(>|\s*$)/.test(lines[start - 1])) {
    if (/^\s*$/.test(lines[start - 1]) && !/^>/.test(lines[start - 2] || '')) break;
    start--;
  }
  return lines.slice(start, end + 1).filter(l => /^>/.test(l)).map(l => l.replace(/^>[ \t]?/, '')).join(' ');
}

function reports(dir = RESEARCH) {
  const out = new Map();
  for (const f of readdirSync(dir)) {
    const m = f.match(/-round(\d+)\.md$/);
    if (m) out.set(Number(m[1]), `${dir}/${f}`);
  }
  return out;
}

// أَأَذِن معيارُ الجولة `by` بجولةٍ بلا استعلام؟ — يُقرأ من خاتمة تقريرها.
function permits(by, R) {
  const f = R.get(by);
  if (!f) return { ok:false, why:`لا تقريرَ للجولة ${by}` };
  const crit = criterion(bare(readFileSync(f, 'utf8')));
  return BAN.test(crit)
    ? { ok:true,  why:`معيارُ ${by} ينهى عن الاستعلام نصّاً` }
    : { ok:false, why:`معيارُ ${by} لا ينهى عن الاستعلام — الجولةُ الداخليّةُ اختيارٌ لا أمر` };
}

// إعفاءاتٌ مُعلَنةٌ في الشجرة: [{round, by, ok, why}]
// جولة ٣٨٣: أوّلُ تشغيلٍ كشف ثغرةً في الأداة نفسِها — **المثالُ في التوثيق عُدَّ إعلاناً**.
// فتُنزَع كتلُ الشيفرة (```…```) قبل المطابقة، ويُشترَط أن يتلوَ الوسمَ سببٌ مكتوب
// لا نقاطَ حذف. والحدُّ باقٍ: المطابقةُ بالنصّ لا بالمعنى.
const stripFences = t => t.replace(/```[\s\S]*?```/g, '');
const REASON = /^\s*[^\s…\-–—]/;

function exemptions(R) {
  const out = [];
  for (const [round, f] of [...R].sort((a,b)=>a[0]-b[0])) {
    const body = stripFences(bare(readFileSync(f, 'utf8')));
    const m = body.match(MARK);
    if (!m) continue;
    const rest = body.slice(m.index + m[0].length).replace(/^[:：*\s]+/, '').split('\n')[0];
    if (!REASON.test(rest)) continue;                 // وسمٌ بلا سبب: مثالٌ لا إعلان
    const by = toNum(m[1]);
    out.push({ round, by, ...permits(by, R) });
  }
  return out;
}

const sh = a => { try { return execFileSync('git', a, { encoding:'utf8', maxBuffer: 64*1024*1024 }); } catch { return ''; } };
// التزاماتُ الجولات — من صدر رسائلها «جولة NNN…»، مقروءةً مرّةً واحدة.
//   ⚠ جولة ٤٢٤: كُتبت أوّلاً دالّةٌ ثانيةٌ لهذا الغرض بنمطٍ أضيقَ (يشترط نقطتين ولا
//   يُجرّد الحركات) — وهو بناءُ تنفيذٍ ثانٍ لشيءٍ قائم، وهو ما يُنهى عنه. فحُذفت
//   الثانيةُ ووُسِّعت هذه لتردَّ الخريطةَ كلَّها، وبقي تنفيذٌ واحد.
let _roundCommits = null;
function roundCommits() {
  if (_roundCommits) return _roundCommits;
  const seen = new Set();
  _roundCommits = [];
  for (const line of sh(['log', '--format=%H%x09%s', '-600']).split('\n')) {
    const [h, subj = ''] = line.split('\t');
    const m = bare(subj).match(/^جولة\s*([٠-٩0-9]+)/);
    if (!m) continue;
    const r = toNum(m[1]);
    if (!Number.isFinite(r) || seen.has(r)) continue;   // أوّلُ ورودٍ هو الأحدث، ويُبقى عليه
    seen.add(r);
    _roundCommits.push({ round: r, hash: h });
  }
  return _roundCommits;
}

// يقتطع `const NAME = [ ... ]` باحترام الاقتباس، ثمّ يُقيّمه.
function pluck(src, name) {
  const head = `const ${name} = [`;
  const i = src.indexOf(head);
  if (i < 0) throw new Error(`لم يُعثَر على ${name}`);
  let j = i + head.length - 1, depth = 0, q = null, esc = false;
  for (; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (q) { if (c === '\\') esc = true; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`قوسٌ غيرُ مغلَق في ${name}`);
  return eval('(' + src.slice(i + head.length - 1, j + 1) + ')');
}

function load(src) {
  return { BENCH: pluck(src, 'BENCH'), EASY_MARK: pluck(src, 'EASY_MARK'),
           HARD_WIN: Number((src.match(/const HARD_WIN\s*=\s*(\d+)/) || [])[1] || 20) };
}

function isHard(entry, marks) {
  return !marks.some(m => String(entry.src || '').includes(m));
}

function share(list, marks) {
  const hard = list.filter(e => isHard(e, marks)).length;
  return { hard, total: list.length, pct: list.length ? Math.round(hard * 100 / list.length) : 0 };
}


// اقترانُ الدَّين بسداده (٤٢٤) — دالّةٌ صِرفٌ تُختبَر بلا سجلٍّ ولا git.
//   EX:   [{round, ok, by}]           — الإعفاءاتُ المُعلَنة
//   hard: [{k, after}]                — المداخلُ العسيرةُ والجولةُ التي أُضيف فيها كلٌّ
//   ترجع: [{round, by, paidBy}]       — مرتَّبةً تصاعديّاً، وpaidBy مفتاحُ المدخل أو null
// والقاعدةُ: أقدمُ دَينٍ يأخذ أقدمَ سدادٍ متاحٍ **أُضيف بعده** — ولا يُستهلَك مرّتين.
function settle(EX, hard) {
  const debts = EX.filter(e => e.ok).slice().sort((a, b) => a.round - b.round);
  const pool  = hard.slice().sort((a, b) => a.after - b.after || String(a.k).localeCompare(String(b.k)));
  const used  = new Set();
  return debts.map(e => {
    const h = pool.find(x => !used.has(x.k) && x.after > e.round);
    if (h) used.add(h.k);
    return { round: e.round, by: e.by, paidBy: h ? h.k : null, paidAt: h ? h.after : null };
  });
}

// أصلُ كلِّ مدخلٍ عسيرٍ: أوّلُ جولةٍ ظهر فيها — مقيساً بحدود الإعفاءات وحدَها.
//   ⚠ أوّلُ تنفيذٍ (٤٢٤) مشى على **كلّ** التزامات الجولات من أوّل إعفاءٍ فصاعداً، ولم
//   يبذر المرئيَّ بما كان موجوداً **عند** ذلك الالتزام — فنسب ٢٩٣ مدخلاً إلى جولة ٣٨٤،
//   والمقيسُ في ٤٢٣ خمسةٌ وسبعون. وكشفه التناقضُ لا المراجعة (نظيرُ ٤٠٣ و٤١٠ و٤١٦).
//   ولم يكن يغيّر الحصيلة (المنسوبُ إلى ٣٨٤ لا يُسدِّد ٣٨٤ ولا ما بعدها) — **لكنّه خطأ،
//   والخطأُ الذي لا يضرّ اليومَ يضرّ غداً**. فصُحّح، ومعه ضُيِّق المشيُ:
//   لا يُحتاج إلّا إلى **ترتيب المدخل بالنسبة لجولات الإعفاء** — فيُمشى على التزاماتها
//   وحدَها (ستَّ عشرةَ بدل أربعين)، وتُبذَر المجموعةُ بما كان عند أوّلها.
function hardOrigins(nowBench, marks, exRounds, curRound) {
  const marks_ = marks;
  const bounds = [...new Set(exRounds)].sort((a, b) => a - b);
  if (!bounds.length) return [];
  const byRound = new Map(roundCommits().map(r => [r.round, r.hash]));
  const at = r => {
    const h = byRound.get(r); if (!h) return null;
    try { return load(execFileSync('git', ['show', `${h}:${FILE}`], { encoding:'utf8', maxBuffer: 64*1024*1024 })); }
    catch { return null; }
  };
  const seenK = new Set();
  const base = at(bounds[0]);
  if (base) base.BENCH.forEach(e => seenK.add(e.k));   // البذرُ: ما كان **عند** أوّل إعفاء لا يُنسَب إليه
  const origins = [];
  for (let i = 1; i < bounds.length; i++) {
    const then = at(bounds[i]); if (!then) continue;
    for (const e of then.BENCH) {
      if (seenK.has(e.k)) continue;
      seenK.add(e.k);
      if (isHard(e, marks_)) origins.push({ k: e.k, after: bounds[i - 1] + 1 });
    }
  }
  // ⚠ وعطبٌ ثالثٌ كُشف بالتشغيل: آخرُ حدٍّ هو **جولةُ اليوم**، ولا التزامَ لها بعد.
  //   فسقط قارئُها، فوقع كلُّ ما أُضيف منذ الحدِّ الذي قبلَه في «ما بعد آخرِ إعفاء»
  //   ونُسب إلى `آخرُ حدٍّ + ١` — فطبعت الأداةُ «إعفاءُ ٤٢٤ سُدِّد في ٤٢٥» بمدخلٍ من ٤٢٣.
  //   وجولةٌ لم تأتِ لا تُسدِّد، والسدادُ لا يسبق الدَّين. فتُنسَب البقيّةُ **للجولة الجارية**:
  //   فلا تُسدِّد دَينَ نفسِها (الشرطُ `after > round`)، وتُسدِّد ما قبلَها.
  for (const e of nowBench) {
    if (seenK.has(e.k)) continue;
    seenK.add(e.k);
    if (isHard(e, marks_)) origins.push({ k: e.k, after: curRound });
  }
  return origins;
}

// ── أنماطُ الفحص: --audit (رجعيّ) و--selftest (على مادّةٍ مُصطنَعة) ──
const argv = process.argv.slice(2);

function ledgerLines(EX) {
  return EX.map(e => `      · جولة ${e.round} — بإذن ${e.by}: ` +
    (e.ok ? `✔ مقبول (${e.why})` : `✗ مردود (${e.why})`));
}

// ── جولة ٤٢٤: اختبارُ اقتران الدَّين بسداده — مكتوبٌ قبل التعديل ──
// العطبُ المقيسُ في ٤٢٣: الدَّينُ غيرُ مقرونٍ بإعفائه. `paidHard` يعدّ كلَّ مدخلٍ
//   عسيرٍ أُضيف بعد الإعفاء، فمدخلٌ واحدٌ يُبرئ كلَّ إعفاءٍ سبقه. وقِيس بالعدد:
//   ستَّ عشرةَ إعفاءةً كلُّها مُسدَّدة · وخمسون من خمسةٍ وسبعين مدخلاً تُسدِّد أكثرَ
//   من إعفاءٍ واحد · وأكثرُها يُسدِّد الستَّ عشرةَ جميعاً.
// والقرارُ كُتب بالنصّ قبل الشيفرة (معيارُ ٤٢٣):
//   ١) المدخلُ العسيرُ يُحتسَب **لأقدمِ دَينٍ لم يُسدَّد** — لا لأحدثه؛ لأنّ احتسابَه
//      لأحدثه يُبقي الأقدمَ معلَّقاً أبداً، وهو الذي بُني الدفترُ ليُظهره.
//   ٢) **ولا يُسدِّد المدخلُ دَيناً نشأ بعد إضافته** — فالسدادُ لا يسبق الدَّين.
//   ٣) وما لم يُمَسّ اليومَ ويُسمّى: **أالسدادُ المتأخّرُ (بعد أجل DEBT_WIN) يُبرئ؟**
//      الحالُ أنّه يُبرئ. وهو سؤالٌ مؤجَّلٌ لا مقضيٌّ — تغييرٌ واحدٌ في الجولة.
//
// وتُقاس البنيةُ على مادّةٍ مُصطنَعةٍ لا على السجلّ، كيلا يكون الاختبارُ صدىً للحال:
//   node tools/drift-check.mjs --ledgertest
const LEDGER_CASES = [
  { name: 'إعفاءان ومدخلٌ عسيرٌ واحد — واحدٌ يُسدَّد والآخرُ لا',
    ex: [10, 20], hard: [{ k:'h1', after: 21 }],
    want: { paid: [10], unpaid: [20] } },
  { name: 'إعفاءان ومدخلان — كلاهما يُسدَّد',
    ex: [10, 20], hard: [{ k:'h1', after: 11 }, { k:'h2', after: 21 }],
    want: { paid: [10, 20], unpaid: [] } },
  { name: 'السدادُ لا يسبق الدَّين — مدخلٌ أُضيف قبل الإعفاء لا يُبرئه',
    ex: [30], hard: [{ k:'h1', after: 5 }],
    want: { paid: [], unpaid: [30] } },
  { name: 'الأقدمُ أوّلاً — المدخلُ الوحيدُ يذهب للأقدم',
    ex: [10, 20, 30], hard: [{ k:'h1', after: 31 }],
    want: { paid: [10], unpaid: [20, 30] } },
  { name: 'سلسلةٌ متتاليةٌ بثلاثة إعفاءاتٍ ومدخلين — واحدٌ يبقى',
    ex: [40, 41, 42], hard: [{ k:'h1', after: 41 }, { k:'h2', after: 43 }],
    want: { paid: [40, 41], unpaid: [42] } },
  { name: 'الجولةُ الجاريةُ لا تُسدِّد دَينَ نفسِها',
    ex: [50], hard: [{ k:'h1', after: 50 }],
    want: { paid: [], unpaid: [50] } },
  { name: 'لا إعفاء — لا دَين',
    ex: [], hard: [{ k:'h1', after: 1 }],
    want: { paid: [], unpaid: [] } },
];

// عرضُ الدفتر على السجلّ الحقيقيّ — يُخبر ولا يمنع (٤٢٤).
if (argv[0] === '--ledger') {
  const src  = readFileSync(FILE, 'utf8');
  const nowB = load(src);
  const R2   = reports();
  const EX2  = exemptions(R2);
  const cur2 = R2.size ? Math.max(...R2.keys()) : 0;
  const acc  = EX2.filter(e => e.ok);
  const H    = hardOrigins(nowB.BENCH, nowB.EASY_MARK, acc.map(e => e.round), cur2);
  const S    = settle(EX2, H);
  console.log(`دفترُ الدَّين — إعفاءاتٌ مقبولة: ${acc.length} · مداخلُ عسيرةٌ صالحةٌ للسداد: ${H.length} · الجولةُ الجارية: ${cur2}`);
  for (const d of S) {
    console.log(`  ${d.paidBy ? '✔' : '✗'} إعفاءُ ${d.round} (بإذن ${d.by}) — ` +
      (d.paidBy ? `سُدِّد بمدخلٍ أُضيف **بعد جولة ${d.paidAt - 1}** (حدٌّ أدنى لا تاريخٌ` +
                  `؛ المشيُ بحدود الإعفاءات): «${String(d.paidBy).replace(/<[^>]+>/g,'').slice(0,40)}»`
                : `**غيرُ مُسدَّد** — أجلُه ${d.round + DEBT_WIN}`));
  }
  const un = S.filter(d => !d.paidBy);
  console.log(`  الحصيلة: مُسدَّدٌ ${S.length - un.length} · غيرُ مُسدَّدٍ ${un.length}` +
    (un.length ? ` (${un.map(d => d.round).join(' · ')})` : ''));
  process.exit(0);
}

if (argv[0] === '--ledgertest') {
  console.log('اختبارُ اقتران الدَّين بسداده — على مادّةٍ مُصطنَعة، لا على السجلّ.');
  let pass = 0;
  for (const c of LEDGER_CASES) {
    const got = settle(c.ex.map(r => ({ round: r, ok: true, by: r - 1 })), c.hard);
    const paid = got.filter(x => x.paidBy).map(x => x.round);
    const unpaid = got.filter(x => !x.paidBy).map(x => x.round);
    const ok = String(paid) === String(c.want.paid) && String(unpaid) === String(c.want.unpaid);
    if (ok) pass++;
    console.log(`  ${ok ? '✔' : '✗'} ${c.name}`);
    if (!ok) console.log(`      المنتظَر: مُسدَّد=[${c.want.paid}] غيرُ مُسدَّد=[${c.want.unpaid}]` +
                         ` · والحاصل: مُسدَّد=[${paid}] غيرُ مُسدَّد=[${unpaid}]`);
  }
  console.log(`  الحصيلة: ${pass} من ${LEDGER_CASES.length}.`);
  process.exit(pass === LEDGER_CASES.length ? 0 : 1);
}

if (argv[0] === '--audit') {
  const R = reports();
  const rounds = argv.slice(1).map(toNum).filter(Number.isFinite);
  console.log('فحصٌ رجعيّ — أكان الإعفاءُ المشروطُ ليقبل هذه الجولات؟');
  console.log('  (الشرط: معيارُ الجولة السابقة ينهى عن الاستعلام نصّاً — والنهيُ يُقرأ في خاتمتها)');
  let pass = 0;
  for (const r of rounds) {
    const v = permits(r - 1, R);
    if (v.ok) pass++;
    console.log(`  جولة ${r} — بإذن ${r-1}: ${v.ok ? '✔ يُعفى' : '✗ لا يُعفى'} — ${v.why}`);
  }
  console.log(`  الحصيلة: ${pass} من ${rounds.length} تُعفى · ${rounds.length - pass} تبقى ممنوعة.`);
  process.exit(0);
}

if (argv[0] === '--selftest') {
  const dir = argv[1];
  if (!dir) { console.error('  --selftest يحتاج مجلَّدَ مادّةٍ مُصطنَعة'); process.exit(2); }
  const R = reports(dir);
  const EX = exemptions(R);
  console.log(`اختبارُ البنية على مادّةٍ مُصطنَعة (${dir}) — تقاريرُ: ${R.size} · إعفاءاتٌ مُعلَنة: ${EX.length}`);
  ledgerLines(EX).forEach(l => console.log(l));
  const cur = Math.max(...R.keys());
  const due = EX.filter(e => e.ok && cur > e.round + DEBT_WIN);
  console.log(`  الجولةُ الجارية: ${cur} · نافذةُ السداد: ${DEBT_WIN} · دُيونٌ حلَّ أجلُها: ${due.length}`);
  due.forEach(e => console.log(`      · دَينُ جولة ${e.round} — أجلُه ${e.round + DEBT_WIN}، ولم يُسدَّد بعدُ في هذا الاختبار`));
  process.exit(0);
}

let now, head;
try {
  now = load(readFileSync(FILE, 'utf8'));
  head = load(execFileSync('git', ['show', `HEAD:${FILE}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  console.error('حارسُ الانجراف: تعذّر الفحص —', e.message);
  console.error('  ولا يُمرَّر بالصمت: أصلِح الفحصَ أو تجاوَزْ صراحةً بـ--no-verify.');
  process.exit(2);
}

const seen = new Set(head.BENCH.map(e => e.k));
const added = now.BENCH.filter(e => !seen.has(e.k));

const all = share(now.BENCH, now.EASY_MARK);
const win = share(now.BENCH.slice(0, now.HARD_WIN), now.EASY_MARK);
const gap = all.pct - win.pct;
const alarm = gap >= THRESHOLD;

const addedHard = added.filter(e => isHard(e, now.EASY_MARK));

console.error(`حارسُ الانجراف — الكلّيّ ${all.hard}/${all.total} (${all.pct}٪) · ` +
  `آخر ${now.HARD_WIN}: ${win.hard}/${win.total} (${win.pct}٪) · فارق ${gap} نقطة · ` +
  `الإنذار: ${alarm ? 'ناطق' : 'صامت'}`);
console.error(`  مداخلُ مضافةٌ في هذا الالتزام: ${added.length} — منها عسيرة: ${addedHard.length}`);

// ── السجلُّ والدَّين — يُقرآن في كلّ تشغيل، ناطقاً كان الإنذارُ أم صامتاً ──
const R  = reports();
const EX = exemptions(R);
const cur = R.size ? Math.max(...R.keys()) : 0;
const mine = EX.find(e => e.round === cur);            // إعفاءُ هذه الجولة، إن أُعلن

console.error(`  سجلُّ الإعفاءات المُعلَنة: ${EX.length}` +
  (EX.length ? ` (${EX.map(e => (e.ok ? '' : '؟') + e.round).join(' · ')})` : ' — لا إعفاءَ في السجلّ'));

// دَينٌ حلَّ أجلُه (٤٢٤: مقروناً بسداده وحدَه).
//   كان: كلُّ مدخلٍ عسيرٍ أُضيف بعد الإعفاء يُبرئه — فمدخلٌ واحدٌ يُبرئ ما سبقه جميعاً،
//   وقِيس في ٤٢٣ أنّ الدفترَ لا يتراكم البتّة (١٦ إعفاءةً كلُّها مُسدَّدة، وواحدٌ يُسدِّد ١٦).
//   وصار: يُقرَن كلُّ دَينٍ بمدخلٍ واحدٍ **يُستهلَك**، والأقدمُ أوّلاً — بدالّة settle الصِرفة
//   المُختبَرة على مادّةٍ مُصطنَعة (--ledgertest)، وتُعرَض على السجلّ بـ--ledger.
//   وما لم يُمَسّ ويُسمّى: **السدادُ المتأخّرُ بعد الأجل يُبرئ كما كان** — سؤالٌ مؤجَّل.
const settled = settle(EX, hardOrigins(now.BENCH, now.EASY_MARK,
                                       EX.filter(e => e.ok).map(e => e.round), cur));
const unpaid = settled
  .filter(d => !d.paidBy && d.round !== cur && cur > d.round + DEBT_WIN)
  .map(d => ({ ...d, due: d.round + DEBT_WIN }));

if (unpaid.length) {
  console.error('');
  console.error('  ✗ مُنع: دَينُ إعفاءٍ حلَّ أجلُه ولم يُسدَّد — والإعفاءُ دَينٌ لا عفو.');
  unpaid.forEach(e => console.error(`      · إعفاءُ جولة ${e.round} (بإذن ${e.by}) — أجلُه ${e.due}، والجاريةُ ${cur}: لا مدخلَ عسيرٌ غيرُ مستهلَكٍ أُضيف بعده.`));
  console.error('');
  console.error('  السدادُ مدخلٌ واحدٌ مصدرُه خارجُ هذا الملفّ — أو تجاوزٌ صريحٌ يُذكَر:');
  console.error('      git commit --no-verify');
  process.exit(1);
}

if (added.length === 0) {
  console.error('  مرّ: لا مدخلَ جديداً في BENCH — فلا شيءَ يُحكَم عليه.');
  process.exit(0);
}
if (!alarm) {
  console.error('  مرّ: الإنذارُ صامت.');
  process.exit(0);
}
if (addedHard.length > 0) {
  console.error('  مرّ: الإنذارُ ناطقٌ وفيه مدخلٌ عسيرٌ واحدٌ فأكثر.');
  process.exit(0);
}

// الإعفاءُ المشروط — ولا يُصدِره القائمُ بالجولة لنفسه (٣٨٣).
if (mine) {
  if (mine.ok) {
    console.error('');
    console.error(`  مرّ بإعفاءٍ مشروط: ${mine.why}.`);
    console.error(`      ولا يُنسى: هذا دَينٌ — أجلُه جولة ${cur + DEBT_WIN}، يُسدَّد بمدخلٍ عسيرٍ واحد.`);
    process.exit(0);
  }
  console.error('');
  console.error(`  ✗ الإعفاءُ المُعلَنُ مردود: ${mine.why}.`);
}

console.error('');
console.error('  ✗ مُنع: الإنذارُ ناطق، وكلُّ ما يضيفه هذا الالتزامُ إلى BENCH سهل.');
added.forEach(e => console.error(`      · ${String(e.k).slice(0, 60)}`));
console.error('');
console.error('  إمّا أن تُضيف مدخلاً مصدرُه خارجُ هذا الملفّ، وإمّا أن تُعلِن إعفاءً مشروطاً');
console.error('  في تقرير الجولة إن كان معيارُ الجولة السابقة قد نهى عن الاستعلام نصّاً:');
console.error('      **إعفاءُ الانجراف — بإذن معيار ٣٨١:** …');
console.error('  وإمّا أن تتجاوز صراحةً: git commit --no-verify — والتجاوزُ يُذكَر في التقرير.');
process.exit(1);
