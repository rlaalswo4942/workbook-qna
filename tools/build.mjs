// 워크북 .md → data/chapters.js + files/*.md 생성
// 사용: node tools/build.mjs [워크북 폴더]   (기본: ~/Desktop/C++_워크북)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SRC = process.argv[2] || path.join(os.homedir(), 'Desktop', 'C++_워크북');
const OUT = path.resolve(import.meta.dirname, '..');

const SHORT = {
  ch0: '들어가며', ch1: '환경설정', ch2: 'Git·배포', ch3: 'Canvas', ch4: '게임루프',
  ch5: '입력처리', ch6: '충돌·점수', ch7: '디버깅', ch8: '게임답게', ch9: '플레이테스트',
  ch10: '완성·발표', ch11: '온라인', ch12: '더 멀리', appA: '도구 연결', appB: '프롬프트',
  appC: '용어집', appD: '문제해결', appE: '제출·루브릭',
};

// 본문에 없는 필수 참고 링크 보강 [라벨, URL]
const EXTRA = {
  ch1: [['Live Server 확장', 'https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer'], ['MDN · HTML 기초', 'https://developer.mozilla.org/ko/docs/Learn/Getting_started_with_the_web/HTML_basics']],
  ch2: [['GitHub Pages 문서', 'https://docs.github.com/ko/pages/getting-started-with-github-pages'], ['VS Code · 소스 제어', 'https://code.visualstudio.com/docs/sourcecontrol/overview']],
  ch3: [['MDN · Canvas 튜토리얼', 'https://developer.mozilla.org/ko/docs/Web/API/Canvas_API/Tutorial'], ['MDN · 도형 그리기', 'https://developer.mozilla.org/ko/docs/Web/API/Canvas_API/Tutorial/Drawing_shapes']],
  ch4: [['MDN · requestAnimationFrame', 'https://developer.mozilla.org/ko/docs/Web/API/Window/requestAnimationFrame'], ['MDN · 기초 애니메이션', 'https://developer.mozilla.org/ko/docs/Web/API/Canvas_API/Tutorial/Basic_animations']],
  ch5: [['MDN · KeyboardEvent.key', 'https://developer.mozilla.org/ko/docs/Web/API/KeyboardEvent/key'], ['MDN · addEventListener', 'https://developer.mozilla.org/ko/docs/Web/API/EventTarget/addEventListener'], ['MDN · if...else', 'https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Statements/if...else']],
  ch6: [['MDN · 2D 충돌 감지', 'https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection'], ['MDN · Array', 'https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Array'], ['MDN · for 문', 'https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Statements/for']],
  ch7: [['Chrome DevTools · 콘솔', 'https://developer.chrome.com/docs/devtools/console'], ['MDN · console.log', 'https://developer.mozilla.org/ko/docs/Web/API/console/log_static'], ['MDN · JS 에러 레퍼런스', 'https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Errors']],
  ch8: [['MDN · localStorage', 'https://developer.mozilla.org/ko/docs/Web/API/Window/localStorage'], ['MDN · Audio', 'https://developer.mozilla.org/ko/docs/Web/API/HTMLAudioElement'], ['Kenney (무료 에셋)', 'https://kenney.nl'], ['OpenGameArt', 'https://opengameart.org']],
  ch9: [['MDN · 터치 이벤트', 'https://developer.mozilla.org/ko/docs/Web/API/Touch_events'], ['MDN · viewport meta', 'https://developer.mozilla.org/ko/docs/Web/HTML/Viewport_meta_tag']],
  ch10: [['GitHub · README 문법', 'https://docs.github.com/ko/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax']],
  ch11: [['MDN · fetch', 'https://developer.mozilla.org/ko/docs/Web/API/Fetch_API/Using_Fetch'], ['Supabase JS 문서', 'https://supabase.com/docs/reference/javascript/introduction']],
  ch12: [['Phaser', 'https://phaser.io'], ['Phaser 예제', 'https://phaser.io/examples']],
};

function meta(file) {
  let m = file.match(/_(\d+)장_/);
  if (m) {
    const n = +m[1];
    return { id: 'ch' + n, num: String(n).padStart(2, '0'), order: n,
      group: n === 0 ? 'intro' : n <= 10 ? 'main' : 'adv' };
  }
  m = file.match(/_부록([A-Z])_/);
  if (m) return { id: 'app' + m[1], num: m[1], order: 100 + m[1].charCodeAt(0), group: 'app' };
  return null;
}

// h2 기준으로 자르되 코드 블록 안의 '#'은 무시
function splitSections(md) {
  const lines = md.split('\n');
  const out = [{ title: '', lines: [] }];
  let fence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (!fence && /^## /.test(line)) out.push({ title: line.slice(3).trim(), lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out.map(s => ({ title: s.title, md: s.lines.join('\n').trim() }));
}

const items = md => md.split('\n').filter(l => /^\s*- /.test(l)).map(l => l.replace(/^\s*- (\[[ x]\] )?/, '').trim());
const h3s = md => { let f = false; return md.split('\n').filter(l => { if (/^\s*```/.test(l)) f = !f; return !f && /^### /.test(l); }).map(l => l.slice(4).trim()); };
const find = (secs, re) => secs.find(s => re.test(s.title));

function table(md) {
  return md.split('\n').filter(l => /^\|/.test(l) && !/^\|[\s|:-]+\|$/.test(l)).slice(1)
    .map(l => l.split('|').slice(1, -1).map(c => c.trim()));
}

function links(md, id) {
  const found = (md.match(/https?:\/\/[^\s)>`"'\]]+/g) || [])
    .filter(u => !/[(.]{3}|\(|example\.com|127\.0\.0\.1|localhost|jimin-park|아이디/.test(u))
    .map(u => [u.replace(/^https?:\/\//, '').replace(/[.,/]+$/, ''), u.replace(/[.,]+$/, '')]);
  const all = [...found, ...(EXTRA[id] || [])];
  return all.filter((l, i) => all.findIndex(x => x[1] === l[1]) === i);
}

const chapters = [];
fs.mkdirSync(path.join(OUT, 'files'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });

for (const file of fs.readdirSync(SRC).filter(f => f.endsWith('.md'))) {
  const m = meta(file);
  if (!m) continue;
  // 개인 체크 표시는 공개본에서 초기화
  const md = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r\n/g, '\n').replace(/- \[x\]/g, '- [ ]');
  const clean = file.replace(/ \(\d+\)/, '');
  fs.writeFileSync(path.join(OUT, 'files', clean), md);

  const secs = splitSections(md);
  const intro = secs[0].md;
  const title = (intro.match(/^# (.+)$/m) || [, clean])[1].trim();
  const pick = re => (intro.match(re) || [, ''])[1].trim();
  const goalSec = find(secs, /학습 목표/);
  const taskSec = find(secs, /과제/);
  const checkSec = find(secs, /체크리스트/);
  const troubleSec = find(secs, /자주 막히는/);

  chapters.push({
    ...m, short: SHORT[m.id], title, file: clean,
    goal: pick(/^> \*\*이번 주 목표\*\*\s*(.+)$/m),
    time: pick(/^> \*\*시간 배분\*\*\s*(.+)$/m),
    goals: goalSec ? items(goalSec.md) : [],
    concepts: h3s((find(secs, /개념/) || {}).md || ''),
    steps: h3s((find(secs, /따라 하기/) || {}).md || ''),
    tasks: taskSec ? h3s(taskSec.md) : [],
    checklist: checkSec ? items(checkSec.md) : [],
    troubles: troubleSec ? table(troubleSec.md) : [],
    links: links(md, m.id),
    intro: intro.replace(/^# .+$/m, '').trim(),
    sections: secs.slice(1),
  });
}

chapters.sort((a, b) => a.order - b.order);
fs.writeFileSync(path.join(OUT, 'data', 'chapters.js'),
  '// tools/build.mjs가 생성 — 직접 수정하지 말 것\nwindow.CHAPTERS = ' + JSON.stringify(chapters) + ';\n');

// 최소 검증
console.assert(chapters.length === 18, 'chapters: ' + chapters.length);
console.assert(chapters.find(c => c.id === 'ch2').checklist.length > 0, 'ch2 checklist');
console.assert(!/- \[x\]/.test(JSON.stringify(chapters)), 'checked box leaked');
console.log(chapters.map(c => `${c.id} goals=${c.goals.length} concepts=${c.concepts.length} tasks=${c.tasks.length} links=${c.links.length} secs=${c.sections.length}`).join('\n'));
