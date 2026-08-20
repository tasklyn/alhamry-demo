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
// الاستعمال: node tools/drift-check.mjs   (يقرأ agents.html في الشجرة مقابلَ HEAD)
//   يخرج بـ0 إذا مرّ، وبـ1 إذا مُنع، وبـ2 إذا تعذّر الفحصُ نفسُه.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FILE = 'agents.html';
const THRESHOLD = 10;

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

console.error('');
console.error('  ✗ مُنع: الإنذارُ ناطق، وكلُّ ما يضيفه هذا الالتزامُ إلى BENCH سهل.');
added.forEach(e => console.error(`      · ${String(e.k).slice(0, 60)}`));
console.error('');
console.error('  إمّا أن تُضيف مدخلاً مصدرُه خارجُ هذا الملفّ، وإمّا أن تتجاوز صراحةً:');
console.error('      git commit --no-verify');
console.error('  والتجاوزُ مقبول — بشرط أن يُذكَر في تقرير الجولة.');
process.exit(1);
