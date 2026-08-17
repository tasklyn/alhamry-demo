# إجراءاتُ الرصد — أين تُخزَّن ومتى تُعاد

> أنشأته **جولة ٢٣٤** تنفيذاً لمعيار ٢٣٣: «حين تصف إجراءً، اكتب أين يُخزَّن ومتى يُعاد — وإلّا فقد وصفتَ ولم تُنشئ».
>
> **الحالُ قبله، مقيسة:** كلُّ أدوات الرصد كانت في مجلّد عملٍ مؤقّت (**٤١٩ ملفّاً**) لا يُحفَظ ولا يُدفَع؛ **والمستودعُ لا يحمل سطراً واحداً منها**. فكلُّ إجراءٍ وُصف في التقارير كان يعيش في وصفه فقط.

---

## ١. المُحقِّق — عرضٌ ونظافةُ تشغيل

**متى يُعاد:** بعد كلّ تعديلٍ على `agents.html`، قبل النشر.
**أيُّ نسخة:** **الموسَّع** عند تغييرٍ في السلوك أو الوسم · **الضيّق** عند إضافة نصوصٍ فقط (`BENCH`/`GATES_ACTIVE`). **ويُذكَر في التقرير أيُّهما شُغِّل** (قاعدةُ جولة ٢٣١).
**ما يفحصه:** أخطاءُ الكونسول · التجاوزُ الأفقي (`scrollWidth − clientWidth`) · وجودُ علاماتِ نصّ الجولة.

```js
// الموسَّع: ٨ حالاتٍ × ٣ عروض = ٢٤. (جولة ٢٣١ — وقبلها كان يفحص الحالةَ الافتراضيةَ وحدَها)
import {chromium} from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const states = [
  ['حقيقية · افتراضي', async p=>{}],
  ['عرض',              async p=>{await p.evaluate(()=>useDemo());}],
  ['عرض + منطقة',      async p=>{await p.evaluate(()=>{useDemo();state.region='RUH';render();});}],
  ['عرض + مدى ٩٠',     async p=>{await p.evaluate(()=>{useDemo();state.range=90;render();});}],
  ['عرض + المبيعات',   async p=>{await p.evaluate(()=>{useDemo();state.metric='sales';render();});}],
  ['عرض + جدول',       async p=>{await p.evaluate(()=>{useDemo();state.tbl=true;render();});}],
  ['عرض + تبويب المتجر',async p=>{await p.evaluate(()=>{useDemo();state.product='P-140';state.tab='store';render();});}],
  ['عرض + مسحُ الشريحة',async p=>{await p.evaluate(()=>{useDemo();state.product=null;render();});}],
];
let bad = 0;
for (const w of [1560, 1100, 420]) for (const [name, act] of states) {
  const p = await b.newPage({viewport:{width:w, height:900}});
  const errs = []; p.on('console', m=>{if(m.type()==='error') errs.push(m.text())});
  p.on('pageerror', e=>errs.push(String(e)));
  await p.goto('file:///home/user/alhamry-demo/agents.html'); await p.waitForTimeout(450);
  await act(p); await p.waitForTimeout(450);
  const ov = await p.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (ov !== 0 || errs.length) { bad++; console.log('✗', w, name, 'ov='+ov, 'errs='+errs.length); }
  await p.close();
}
console.log(bad === 0 ? 'كلُّ الحالات نظيفة' : 'فاشلة: ' + bad);
await b.close();
```

---

## ٢. مزامنةُ نسخة الأرتيفكت — نقلٌ ثمّ مقارنةٌ كاملة

**متى يُعاد:** قبل كلّ نشرٍ للأرتيفكت.
**العطبُ الذي عالجه:** جولة ٢٣١ — نقلُ أربعِ كتلٍ بلا فحصِ ما وراءها ترك سطراً متخلّفاً **تسعَ جولاتٍ** في النسخة المنشورة.
**حدُّه المعلَن:** يقارن منطقةَ `<script>` وحدَها — لأنّ نسخة الأرتيفكت تحمل تصميماً مختلفاً عمداً.

```python
import io, difflib
src = io.open(SRC, encoding='utf-8').read()
art = io.open(ART, encoding='utf-8').read()
def blk(t, n):
    i = t.index('const %s = [' % n); j = t.index('\n];', i) + 3; return t[i:j]
for n in ['BENCH', 'GATES_ACTIVE', 'SEASONS_DEMO', 'GATES']:
    new = blk(src, n); old = blk(art, n)
    assert art.count(old) == 1, n
    art = art.replace(old, new, 1)
io.open(ART, 'w', encoding='utf-8').write(art)
def js(t):
    i = t.index('<script>'); j = t.rindex('</script>'); return t[i:j].split('\n')
d = [l for l in difflib.unified_diff(js(src), js(art), lineterm='', n=0)
     if l[:1] in '+-' and l[:3] not in ('+++', '---')]
assert len(d) == 0, d          # التغييرُ خارج الكتل يُنقَل يدوياً ثمّ يُفحَص هنا
```

---

## ٣. فحصُ التكرار — على مخزنين ثمّ على المعايير

**متى يُعاد:** في أوّل كلّ جولة، قبل اختيار الزاوية.
**خطوتان لا واحدة** (وهذا عطبُ جولة ٢٣٣: كانت تُنفَّذ الأولى وحدَها):

1. **الدعاوى** — استعلامُ `BENCH` و`GATES_ACTIVE` معاً بصياغة اللوحة نفسِها (أرقامٌ عربيةٌ هندية، بلا إسقاط الأرقام ولا الكلمات القصيرة). **والمطابقةُ الزوجيةُ الشاملةُ عديمةُ الجدوى — أثبتته جولة ١٩١.**
2. **المعايير** — **قراءةُ `research/CRITERIA.md`**، لا مطابقتُه. **جولة ١٩٦ قاست أنّ زوجاً مكرَّراً يقيناً يسجّل تشابهاً ٠٫٠٦٢ — فالمطابقةُ لا تكشفه، والقراءةُ تكشفه.**

---

## ٤. قاعدةُ الإغلاق — ما يُصلَح وما يُترَك

**مصدرها:** جولة ٢٢٢.
**متى تُطبَّق:** عند كلّ عيبٍ يُرصَد.

| يُغلَق | يُترَك لصاحب اللوحة |
|---|---|
| ما له **جوابٌ واحدٌ يُثبته الملفُّ نفسُه** — اسمٌ لا وجودَ له · نصٌّ يناقض نصّاً · قيمةٌ وضعتُها أنا بمعنىً خاطئ | ما يحتاج **حكماً** — عتبةٌ · لونٌ · وجهةُ رابط · دعوى تسويق · تغييرُ ما تُبلِّغه اللوحة |

**وما أُغلق حتى الآن:** التذييلُ يتبع `DATA_MODE` و`DEMO_BUNDLE` (٢٢٢) · آفاقُ `max` في السجلّ (٢٣٠) · سطرٌ متخلّفٌ في نسخة الأرتيفكت (٢٣١).

---

## ٥. كتابةُ الجولة

**متى:** في آخر كلّ جولة، قبل الدفع.
**أين:** `research/<تاريخُ اليوم>-round<رقم>.md` — **بتاريخ الكتابة الفعليّ** (صُحِّح في جولة ٢١٩ بعد أربعين ملفّاً بتاريخٍ خاطئ).
**ماذا يلزم:** الزاويةُ ومعيارُها · الفحصُ قبل النتيجة · حدُّ الدعوى صراحةً · **ما لم يُفعَل ولماذا** · **الفحوصُ التي لم تجد شيئاً — تُكتَب كما تُكتَب التي وجدت** · ما تغيّر على اللوحة · معيارُ الجولة القادمة.

---

## ٦. حدُّ هذا الملفّ

**يصف ستّةَ إجراءاتٍ يعملُ بها الراصدُ اليوم.** **ولا يزعم أنّها كلُّ ما يُفعَل** — بعضُ الخطوات ما زالت في الرأس، وستُضاف حين تُوصَف.
**وموضعُ الأدوات نفسِها ما زال مجلّدَ عملٍ مؤقّتاً** — **والمحفوظُ هنا نصُّها لا ملفّاتُها.**
