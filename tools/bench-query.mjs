#!/usr/bin/env node
// أداةُ استعلامٍ على سجلَّي اللوحة — بُنيت في جولة ٤٠٤ ثمناً لدرس ٤٠٣.
//
//   العلّةُ: كنت أكتب لكلّ جولةٍ مِرشَحاً يقرأ agents.html سطراً سطراً، ثمّ أرميه.
//   وفي ٤٠٣ ظهر أنّ ١٠٩ من مداخل BENCH تمتدّ على أكثرَ من سطر، فكان المِرشَحُ
//   السطريُّ يحكم بغياب حقلٍ لم يره — حتى «صحّحتُ» بذلك رقماً صحيحاً في ٤٠٢.
//   والأداةُ الدائمةُ (drift-check.mjs) كانت مصيبةً لأنّها تحلّل الكائنات.
//
//   فالقاعدةُ المُنفَّذةُ هنا: ما يُقاس به السجلُّ يُقرأ بما يُقرأ به السجلّ.
//
// الاستعمال:
//   node tools/bench-query.mjs count <حقل> <نمط>     — كم مدخلاً يطابق النمطُ ذلك الحقل
//   node tools/bench-query.mjs count any <نمط>       — النمطُ في أيّ حقل
//   node tools/bench-query.mjs list  <حقل> <نمط>     — يعرض المطابقات (k و on)
//   node tools/bench-query.mjs field <اسم>           — توزيعُ حقلٍ: كم مدخلاً يحمله
//   node tools/bench-query.mjs stats                 — أعدادٌ عامّة
// والحقولُ: k v on src basis max prec any

import fs from 'fs';

const FILE = process.env.BENCH_FILE || 'agents.html';
const REPORTS = process.env.BENCH_REPORTS || 'research';

// المُحلِّلُ نفسُه المستعمَل في drift-check.mjs — لا نسخةَ ثانيةً بسلوكٍ ثانٍ.
function pluck(src, name) {
  const head = 'const ' + name + ' = [';
  const i = src.indexOf(head);
  if (i < 0) throw new Error('لم يُوجد: ' + name);
  let depth = 0, j = i + head.length - 1, q = null;
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (!depth) break; }
  }
  return eval('(' + src.slice(i + head.length - 1, j + 1) + ')');
}

const src = fs.readFileSync(FILE, 'utf8');
const BENCH = pluck(src, 'BENCH');
const GATES = pluck(src, 'GATES_ACTIVE');

// جولة ٤٠٥: بُنيت الأداةُ أمسِ على جدولين فقط (BENCH و GATES_ACTIVE)، فادّعيتُ
// في ٤٠٤ أنّ مضيفاً «لم يَرِد في السجلّ ولا مرّة» — وهو واردٌ في SEASONS_DEMO
// منذ جولة ٢٥١.
// فالبحثُ في جدولين ليس بحثاً في السجلّ. وهذه كلُّ جداول اللوحة العلويّة.
const ALL_TABLES = (src.match(/^const ([A-Z_]+) = \[/gm) || [])
  .map(m => m.replace(/^const /, '').replace(/ = \[$/, ''));
function everything() {
  const out = [];
  for (const t of ALL_TABLES) {
    let rows; try { rows = pluck(src, t); } catch { continue; }
    if (!Array.isArray(rows)) continue;
    rows.forEach((r, i) => out.push({ __table: t, __i: i + 1, ...(typeof r === 'object' && r ? r : { v: r }) }));
  }
  return out;
}

const strip = s => String(s == null ? '' : s).replace(/<[^>]+>/g, '');
const of = (e, f) => f === 'any' ? Object.values(e).map(strip).join(' ') : strip(e[f]);

// جولة ٤٠٧: بعد جرد ٤٠٦ — كان «البحثُ في السجلّ» يعني agents.html وحدَه،
// وresearch/ فيه ٤٠٧ ملفّاً و٤١٬٧١١ سطراً لا تراها أداة. وقِيس قبل التثبيت:
// الدعاوى الثلاثُ الباطلةُ في ٤٠٥ كان البحثُ في research/ يمنعها ثلاثَها.
//
// وما لا تقرؤه هذه الأداةُ بعد التوسيع — يُكتَب هنا لا في التقرير:
//   · تاريخَ git (رسائلَ الالتزامات، ونصوصَ الملفّات في نسخها السابقة)
//   · شيفرةَ tools/ و.githooks/ أنفسِها
//   · الأرتيفكتَ المنشورَ على claude.ai (نسخةٌ قد تسبق الشجرةَ أو تتأخّر عنها)
//   · أيَّ شيءٍ خارج هذا المستودع
// فمن ادّعى «فحصتُ السجلّ» بعد اليوم فقد فحص الشجرةَ الحاضرة، لا تاريخَها.
function reports() {
  let names;
  try { names = fs.readdirSync(REPORTS).filter(f => f.endsWith('.md')); }
  catch { return []; }
  return names.sort().map(f => ({ file: f, text: fs.readFileSync(REPORTS + '/' + f, 'utf8') }));
}

const [cmd, a, b] = process.argv.slice(2);

if (cmd === 'stats') {
  const has = f => BENCH.filter(e => e[f] != null && e[f] !== '').length;
  console.log('BENCH:', BENCH.length, '· GATES_ACTIVE:', GATES.length);
  for (const f of ['k','v','on','src','basis','max','prec'])
    console.log('  حقل', f.padEnd(6), has(f), '/', BENCH.length);
} else if (cmd === 'field') {
  const vals = {};
  BENCH.forEach(e => { const v = e[a] == null ? '(غائب)' : String(e[a]); vals[v] = (vals[v]||0)+1; });
  Object.entries(vals).sort((x,y)=>y[1]-x[1]).slice(0,25)
    .forEach(([v,c]) => console.log(String(c).padStart(5), '·', v.slice(0,90)));
} else if (cmd === 'count' || cmd === 'list') {
  const re = new RegExp(b, 'u');
  const hit = BENCH.filter(e => re.test(of(e, a)));
  console.log(`${hit.length} / ${BENCH.length}  (الحقل: ${a} · النمط: ${b})`);
  if (cmd === 'list') hit.forEach((e,i) =>
    console.log(String(i+1).padStart(4), (e.on||'—').padEnd(11), strip(e.k).slice(0,72)));
} else if (cmd === 'all') {
  // بحثٌ في كلّ جداول اللوحة لا في BENCH وحدَه — قاعدةُ منع التكرار تقتضيه.
  const re = new RegExp(a, 'u');
  const rows = everything();
  const hit = rows.filter(e => re.test(Object.entries(e)
      .filter(([k]) => !k.startsWith('__')).map(([,v]) => strip(v)).join(' ')));
  console.log(`${hit.length} / ${rows.length}  (كلُّ الجداول · النمط: ${a})`);
  const byT = {}; hit.forEach(e => (byT[e.__table] = (byT[e.__table]||0)+1));
  Object.entries(byT).forEach(([t,c]) => console.log('   ', t.padEnd(16), c));
  hit.slice(0, 40).forEach(e => console.log('  ·', (e.__table+'#'+e.__i).padEnd(20),
      strip(e.k || e.name || e.id || e.v).slice(0, 68)));
} else if (cmd === 'docs') {
  // بحثٌ في تقارير الجولات — ما لا تراه الجداول.
  const re = new RegExp(a, 'u');
  const hits = reports().filter(r => re.test(r.text));
  console.log(`${hits.length} / ${reports().length} ملفّاً  (research/ · النمط: ${a})`);
  hits.slice(0, 30).forEach(r => {
    const line = r.text.split('\n').find(l => re.test(l)) || '';
    console.log('  ·', r.file.padEnd(30), line.replace(/<[^>]+>/g, '').trim().slice(0, 74));
  });
  if (hits.length > 30) console.log(`  … و${hits.length - 30} ملفّاً أُخرى لم تُعرَض`);
} else if (cmd === 'seen') {
  // «أرُصد هذا من قبل؟» — الجداولُ والتقاريرُ معاً في نداءٍ واحد.
  const re = new RegExp(a, 'u');
  const rows = everything();
  const inTables = rows.filter(e => re.test(Object.entries(e)
      .filter(([k]) => !k.startsWith('__')).map(([,v]) => strip(v)).join(' ')));
  const inDocs = reports().filter(r => re.test(r.text));
  console.log(`النمط: ${a}`);
  console.log(`  في جداول اللوحة : ${inTables.length} / ${rows.length} صفّاً`);
  console.log(`  في تقارير الجولات: ${inDocs.length} / ${reports().length} ملفّاً`);
  if (inDocs.length) console.log('  أقدمُ تقريرٍ يذكره:', inDocs[0].file);
  const byT = {}; inTables.forEach(e => (byT[e.__table] = (byT[e.__table]||0)+1));
  Object.entries(byT).forEach(([t,c]) => console.log('     ', t.padEnd(16), c));
  console.log(inTables.length || inDocs.length
    ? '  ⟵ مرصودٌ من قبلُ: لا تُكتَب دعوى اكتشاف.'
    : '  ⟵ لا أثرَ له في الشجرة الحاضرة (ولا يُقال «قطّ»: تاريخُ git خارج هذه الأداة).');
} else {
  console.error('الاستعمال: count|list <حقل> <نمط> · all <نمط> · docs <نمط> · seen <نمط> · field <اسم> · stats');
  process.exit(2);
}
