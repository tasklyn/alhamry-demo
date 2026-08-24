#!/usr/bin/env node
// حارسُ دعوى «قطّ» — إجراءٌ يعمل، لا فقرةٌ تُقرأ.
//
// السبب، مقيسٌ لا مظنون: أُنشئ الإجراءُ الثامن في ٣٤٧ ليعرضَ القاعدةَ الجديدةَ
//   على السجلّ يومَ تُكتَب. ثمّ كُتبت في ٣٥٥ دعوى «ولم يُصوَّب إليه استعلامٌ قطّ»
//   عن البند العاشر — والسجلُّ يحمل جولةَ ٢٥٣ بعنوان «الإسنادُ الخارجيّ — لأوّل مرّة»
//   عن البند نفسِه. فالإجراءُ لم يمنع، لأنّ مُطلِقاتِه تسمّي «قاعدة» و«معيار»
//   ولا تسمّي **دعوى عن السجلّ نفسِه**، ولأنّه نصٌّ يُقرَأ لا أثرٌ يمنع.
//
// القاعدةُ المفروضة، واحدة: إذا أضاف الالتزامُ سطراً يدّعي «قطّ» أو «لأوّل مرّة»،
//   استُخرجت منه رموزُه (لاتينيّةً وأرقاماً عربيّةً وهنديّةً)، وفُتِّش عنها في نسخة
//   الأساس من `agents.html` و`research/`. فإن وُجد سطرٌ يحمل الرمزَ نفسَه **ومعه
//   علامةُ إسنادٍ خارجيّ** — مُنع الالتزامُ حتى يُقرأ ذلك السطرُ ويُحكَم عليه.
//
// حدُّ الضمان، مصرَّحٌ به:
//   · السطرُ الحاملُ ⚠ أو «نُقض» أو «صُحّح» يُستثنى — لأنّه اقتباسُ تصحيحٍ لا دعوى.
//     وهذا الاستثناءُ ثغرةٌ بذاته: تُمرَّر الدعوى الكاذبةُ بوسمِ ⚠. ويُذكَر ولا يُخفى.
//   · المطابقةُ بالرمز لا بالمعنى — فما صيغ بلا رمزٍ مشترَك لا يُلتقَط.
//   · وقيدُ الوقت (٣٨٧) يُستثنى به ما لاصقَه «اليوم» أو «في هذه الجولة» — وثغرتُه
//     أن يُلصَق القيدُ بدعوى عن السجلّ فتُمرَّر. ويُذكَر ولا يُخفى.
//     ولا يلتقط ما كان من الصنف نفسِه بلا لفظِ قيد («ولم تُجرَّب محاولةٌ ثانية») — فهو أضيقُ من الصنف.
//   · يُتجاوَز بـ`git commit --no-verify` — والتجاوزُ يُذكَر في تقرير الجولة.
//
// الاستعمال:
//   node tools/never-check.mjs              # المُهيَّأ للالتزام مقابل HEAD
//   node tools/never-check.mjs <BASE>       # اختبارٌ رجعيّ: الشجرةُ عند <BASE>..HEAD

import { execFileSync } from 'node:child_process';

const NEVER = /قطُّ|قطّ|لأوّل مرّة|أوّلَ مرّة|لأوّلِ مرّة|لم يُجرَّب|لم تُجرَّب|لم يُطلَب|لم تُفتَح بعدُ/;
const QUOTED = /⚠|نُقض|صُحّح|تصحيحٌ|تصحيح ٱ|كان خطأً/;

// الدعوى الواقعةُ بين «…» منقولةٌ لا مُدّعاة — تُستثنى وحدَها لا السطرُ كلُّه.
// وهذا حدٌّ معلَن: تُمرَّر الدعوى الكاذبةُ بوضعها بين قوسين.
function assertsNever(line) {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '«') { depth++; continue; }
    if (c === '»') { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    NEVER.lastIndex = 0;
    const m = line.slice(i).match(NEVER);
    if (m && m.index === 0) return true;
  }
  return false;
}
const EXTERNAL = /إسنادٌ خارجيّ|إسناد خارجيّ|مصدرٌ خارجيّ|مصدر خارجيّ|https?:|\.sa\b|\.int\b|\.org\b|\.com\b|\.net\b/;
const STOP = new Set(['code','dir','ltr','rtl','href','span','div','class','http','https','www',
                      'PENDING','BENCH','GATES','ACTIVE','ACCEPT','RULES','SEASONS','REAL','BUNDLE',
                      'true','false','null','const','max','src','basis',
                      // أسماءُ ملفّات المستودع وأدواتِه — ترد في كلّ سطرٍ يصف عملاً، فلا تدلّ على موضوع
                      'agents.html','research','tools','node','git','commit','drift','never',
                      'drift-check.mjs','never-check.mjs','check.mjs','check','PROCEDURES.md','githooks']);
// رمزٌ ينتهي بامتدادِ ملفٍّ ليس موضوعَ دعوى بل موضعَ عمل
const PATHY = /\.(mjs|html|md|js|json|tsv|sh)$/;
const MAX_HITS = 200;

const arg = process.argv[2];
// «<BASE>» تعني <BASE>..HEAD · و«<A>..<B>» تُقرَأ كما هي، والأساسُ <A>
const range = arg ? (arg.includes('..') ? arg : `${arg}..HEAD`) : null;
const base = arg ? (arg.includes('..') ? arg.split('..')[0] : arg) : 'HEAD';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

let diff;
try {
  diff = range
    ? git(['diff', range, '-U0', '--', 'agents.html', 'research/'])
    : git(['diff', '--cached', '-U0', '--', 'agents.html', 'research/']);
} catch (e) {
  console.error('حارسُ «قطّ»: تعذّر قراءةُ الفرق —', e.message);
  process.exit(2);
}

const added = diff.split('\n')
  .filter(l => l.startsWith('+') && !l.startsWith('+++'))
  .map(l => l.slice(1));

const ASKING = /؟/;   // سطرٌ فيه استفهام: الدعوى فيه سؤالٌ يُقاس لا خبرٌ يُثبَت

// جولة ٣٨٧ — الصنفُ الثاني من عطب ٣٨٥: **وصفُ فعلِ هذه الجولة لا تاريخِ السجلّ**.
//   «ولم يُجرَّب اليومَ» إخبارٌ عمّا لم أفعله، لا حكمٌ على ما في السجلّ — فلا يُفحَص.
//   والقيدُ **ملاصقٌ** لا مجرَّدُ ورودٍ في السطر: «لم يُصوَّب إليه استعلامٌ قطّ، وصُوِّب
//   اليومَ» دعوى حقيقيّةٌ فيها «اليوم» — ولا تُستثنى، لأنّ بين الدعوى والقيد فاصلاً.
//   وتُشترَط الملاصقةُ لكلّ دعوى في السطر: دعوى واحدةٌ غيرُ مقيَّدةٍ تُبقي السطرَ مفحوصاً.
// وقِيس أثرُه قبل تثبيته على ٣٥٦–٣٨٦: **يُسقِط ٣ أسطرٍ من ١٦، وكلُّها من الصنف الثاني،
//   وصفرُ دعوى حقيقيّةٍ عن السجلّ**. ولو أسقط واحدةً لَما ثُبِّت (معيارُ ٣٨٦).
const QUAL = /^[\s:،]{0,3}(اليومَ?|في هذه الجولة|هذه الجولة|في هذا الالتزام|هذا الالتزام|في الجولة)/;
function neverSpans(line) {          // مواضعُ الدعوى خارجَ «…»
  const out = []; let d = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '«') { d++; continue; }
    if (c === '»') { d = Math.max(0, d - 1); continue; }
    if (d > 0) continue;
    const m = line.slice(i).match(NEVER);
    if (m && m.index === 0) { out.push({ i, len: m[0].length }); i += m[0].length - 1; }
  }
  return out;
}
function boundToNow(line) {
  const ms = neverSpans(line);
  return ms.length > 0 && ms.every(({ i, len }) => QUAL.test(line.slice(i + len, i + len + 30)));
}
const claims = added.filter(l => NEVER.test(l));
const quoted = claims.filter(l => QUOTED.test(l) || !assertsNever(l));
const asking = claims.filter(l => !quoted.includes(l) && ASKING.test(l));
const nowly = claims.filter(l => !quoted.includes(l) && !asking.includes(l) && boundToNow(l));
const live  = claims.filter(l => !quoted.includes(l) && !asking.includes(l) && !nowly.includes(l));
const skipped = quoted.length;

console.error(`حارسُ «قطّ» — أسطرٌ مضافةٌ: ${added.length} · فيها دعوى «قطّ»: ${claims.length}` +
  ` · مُستثناةٌ اقتباساً: ${skipped} · مُستثناةٌ استفهاماً: ${asking.length}` +
  ` · مُستثناةٌ بقيدِ الوقت: ${nowly.length} · مفحوصة: ${live.length}`);

if (live.length === 0) {
  console.error('  مرّ: لا دعوى «قطّ» تُفحَص في هذا الالتزام.');
  process.exit(0);
}

function tokens(line) {
  const out = new Set();
  for (const m of line.matchAll(/[A-Za-z_][A-Za-z0-9_.]{2,}/g)) {
    const t = m[0].replace(/[.]+$/, '');
    if (!STOP.has(t) && !PATHY.test(t) && t.length >= 3) out.add(t);
  }
  for (const m of line.matchAll(/[0-9]{3,}/g)) out.add(m[0]);
  for (const m of line.matchAll(/[٠-٩]{2,}/g)) out.add(m[0]);
  return [...out];
}

let blocked = 0;
for (const line of live) {
  const toks = tokens(line);
  const found = [];
  for (const t of toks) {
    let hits;
    try {
      hits = git(['grep', '-n', '-F', '--', t, base, '--', 'agents.html', 'research/'])
        .split('\n').filter(Boolean);
    } catch { continue; }           // git grep يخرج بـ1 حين لا يجد
    if (hits.length > MAX_HITS) continue;   // رمزٌ عامٌّ لا يصلح دليلاً
    // ترتيبُ الشواهد: التصريحُ بالإسناد الخارجيّ أقوى من مجرّد ورودِ رابط.
    const STRONG = /إسنادٌ خارجيّ|إسناد خارجيّ|مصدرٌ خارجيّ|مصدر خارجيّ/;
    const ev = hits.filter(h => EXTERNAL.test(h))
                   .sort((a, b) => (STRONG.test(b) ? 1 : 0) - (STRONG.test(a) ? 1 : 0));
    if (ev.length) found.push({ t, ev });
  }
  if (!found.length) continue;
  blocked++;
  console.error('');
  console.error(`  ✗ دعوى «قطّ» ولها في السجلّ ما يشبه أن يخالفها:`);
  console.error(`      ${line.trim().slice(0, 150)}`);
  for (const { t, ev } of found.slice(0, 4)) {
    console.error(`    · الرمز «${t}» — ${ev.length} سطراً بعلامة إسنادٍ خارجيّ، منها:`);
    for (const h of ev.slice(0, 2)) console.error(`        ${h.slice(0, 190)}`);
  }
}

if (!blocked) {
  console.error('  مرّ: لم يُعثَر في السجلّ على ما يخالف الدعاوى المفحوصة.');
  process.exit(0);
}

console.error('');
console.error(`  ✗ مُنع: ${blocked} دعوى «قطّ» لها في السجلّ سطرٌ مُسنَدٌ خارجياً يحمل رمزَها.`);
console.error('  اقرأ السطرَ المعروضَ واحكم: إن خالف فصحّح الدعوى، وإن لم يخالف فتجاوَز صراحةً:');
console.error('      git commit --no-verify');
console.error('  والتجاوزُ مقبول — بشرط أن يُذكَر في تقرير الجولة.');
process.exit(1);
