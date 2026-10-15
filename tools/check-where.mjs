// data/where.js 검사: Step 개수가 워크북(data/chapters.js)과 같은지, 장소 키가 전부 정의돼 있는지
// 사용: node tools/check-where.mjs   (워크북 원고를 고쳐 build.mjs를 돌린 뒤 함께 실행)
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = { window: {} };
for (const f of ['data/chapters.js', 'data/where.js']) vm.runInNewContext(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx);
const { CHAPTERS: CH, WHERE: W } = ctx.window;
const bad = [];
for (const c of CH) {
  const s = W.STEPS[c.id];
  if (c.steps.length && !s) bad.push(`${c.id}: STEPS 없음`);
  if (s && s.length !== c.steps.length) bad.push(`${c.id}: 워크북 Step ${c.steps.length}개 ≠ where ${s.length}개`);
}
const keys = [...Object.values(W.STEPS).flat().flatMap(s => s.w), ...Object.values(W.FILES).flat().map(f => f[1]),
  ...W.LOOP.map(l => l[0]), ...W.SUBMIT.map(l => l[0]), ...W.SUBMIT1.map(l => l[0])];
for (const k of new Set(keys)) if (!W.PLACES[k]) bad.push(`정의 안 된 장소: ${k}`);
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log(`OK — ${Object.keys(W.STEPS).length}개 장, Step ${Object.values(W.STEPS).flat().length}개`);
