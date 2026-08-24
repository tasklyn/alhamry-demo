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
// نهيٌ عن الاستعلام، يُطلَب في **خاتمة** التقرير الآذن (حيث يُكتَب المعيار):
const BAN  = /لا\s*(?:تجر|تجري|يجر)?\s*استعلام/;
const TAIL = 1800;

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
  const t = bare(readFileSync(f, 'utf8'));
  const tail = t.slice(-TAIL);
  return BAN.test(tail)
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
// التزامُ جولةٍ بعينها — من صدر رسالته «جولة NNN…»
function commitOf(round) {
  for (const line of sh(['log','--format=%H%x09%s']).split('\n')) {
    const [h, subj=''] = line.split('\t');
    const m = bare(subj).match(/^جولة\s*([٠-٩0-9]+)/);
    if (m && toNum(m[1]) === round) return h;
  }
  return null;
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

// ── أنماطُ الفحص: --audit (رجعيّ) و--selftest (على مادّةٍ مُصطنَعة) ──
const argv = process.argv.slice(2);

function ledgerLines(EX) {
  return EX.map(e => `      · جولة ${e.round} — بإذن ${e.by}: ` +
    (e.ok ? `✔ مقبول (${e.why})` : `✗ مردود (${e.why})`));
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

// دَينٌ حلَّ أجلُه: إعفاءٌ مقبولٌ مضى عليه DEBT_WIN جولاتٍ ولم يتبعه مدخلٌ عسير.
const unpaid = [];
for (const e of EX) {
  if (!e.ok || e.round === cur) continue;
  const h = commitOf(e.round);
  if (!h) continue;
  let paidHard = 0;
  try {
    const then = load(execFileSync('git', ['show', `${h}:${FILE}`], { encoding:'utf8', maxBuffer: 64*1024*1024 }));
    const thenK = new Set(then.BENCH.map(x => x.k));
    paidHard = now.BENCH.filter(x => !thenK.has(x.k) && isHard(x, now.EASY_MARK)).length;
  } catch { continue; }
  if (paidHard === 0 && cur > e.round + DEBT_WIN) unpaid.push({ ...e, due: e.round + DEBT_WIN });
}

if (unpaid.length) {
  console.error('');
  console.error('  ✗ مُنع: دَينُ إعفاءٍ حلَّ أجلُه ولم يُسدَّد — والإعفاءُ دَينٌ لا عفو.');
  unpaid.forEach(e => console.error(`      · إعفاءُ جولة ${e.round} (بإذن ${e.by}) — أجلُه ${e.due}، والجاريةُ ${cur}: صفرُ مدخلٍ عسيرٍ بعده.`));
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
