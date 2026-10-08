(() => {
const CH = window.CHAPTERS;
const CFG = window.QNA_CONFIG || {};
const COLORS = [['yellow', '질문'], ['pink', '막힘'], ['green', '핵심'], ['blue', '팁']];
const GROUPS = [['intro', '들어가며'], ['main', '본과정'], ['adv', '심화'], ['app', '부록']];
const $ = s => document.querySelector(s);
const main = $('#main');
const safe = (fn, fb) => { try { return fn(); } catch { return fb; } };

// 작은 DOM 헬퍼: h('div', {class:'x', onclick: fn}, ...children). 문자열 자식은 텍스트로만 들어간다(XSS 안전).
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v; // 워크북 원문(신뢰 데이터)에만 사용
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}
const colorOf = p => COLORS.some(c => c[0] === p.color) ? p.color : 'yellow';
const label = c => (COLORS.find(x => x[0] === c) || COLORS[0])[1];
const chById = id => CH.find(c => c.id === id);
const chNum = c => c.group === 'app' ? '부록 ' + c.num : c.num + '장';
const plain = s => s.replace(/\*\*|`/g, '');

// ---------- 저장소: Supabase(실시간) 또는 로컬(이 브라우저 + 탭 간 동기화) ----------
function makeStore() {
  if (CFG.supabaseUrl && CFG.supabaseKey && window.supabase) {
    const db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    return {
      live: true,
      // ponytail: 전체 글을 한 번에 로드, 글이 수천 개를 넘으면 장별 페이지 로딩으로 바꿀 것
      async list() { const { data, error } = await db.from('posts').select('*').order('id').limit(5000); if (error) throw error; return data; },
      async add(p) { const { data, error } = await db.from('posts').insert(p).select().single(); if (error) throw error; return data; },
      onInsert(cb) { db.channel('posts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, e => cb(e.new)).subscribe(); },
    };
  }
  const KEY = 'qna-local-posts';
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('qna') : null;
  const read = () => safe(() => JSON.parse(localStorage.getItem(KEY) || '[]'), []);
  return {
    live: false,
    async list() { return read(); },
    async add(p) {
      const row = { ...p, id: Date.now(), created_at: new Date().toISOString() };
      localStorage.setItem(KEY, JSON.stringify([...read(), row]));
      bc?.postMessage(row);
      return row;
    },
    onInsert(cb) { if (bc) bc.onmessage = e => cb(e.data); },
  };
}

// ---------- 상태 ----------
const store = makeStore();
const posts = new Map();
const applied = new Set();
const hidden = new Set(safe(() => JSON.parse(localStorage.getItem('qna-hidden') || '[]'), []));
const treeOpen = new Set(['g-intro', 'g-main', 'g-adv', 'g-app']);
let cur = null, replyTo = null, chatFilter = 'all', pending = null, firstChat = true;
const ANIMALS = ['수달', '고래', '부엉이', '다람쥐', '펭귄', '여우', '판다', '고슴도치', '너구리', '토끼', '참새', '해달'];
let nick = safe(() => localStorage.getItem('qna-nick')) ||
  `익명 ${ANIMALS[Math.random() * ANIMALS.length | 0]} ${(Math.random() * 256 | 0).toString(16).toUpperCase().padStart(2, '0')}`;
safe(() => localStorage.setItem('qna-nick', nick));

const channel = () => cur || 'lounge';
const all = () => [...posts.values()];
const roots = ch => all().filter(p => !p.parent_id && (!ch || p.chapter === ch));
const repliesOf = id => all().filter(p => p.parent_id === id);
const isMark = p => !p.parent_id && p.quote && /^(guide|s\d+)$/.test(p.block || '');
const visibleMark = p => isMark(p) && !hidden.has(colorOf(p));
const fmt = ts => {
  const d = new Date(ts), now = new Date(), hm = d.toTimeString().slice(0, 5);
  return d.toDateString() === now.toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

// ---------- 상단: 카테고리 + 마킹 바 ----------
function renderCatnav() {
  const nav = $('#catnav');
  nav.replaceChildren();
  GROUPS.forEach(([g], gi) => {
    if (gi) nav.append(h('span', { class: 'sep' }));
    CH.filter(c => c.group === g).forEach(c =>
      nav.append(h('a', { href: '#' + c.id, 'data-id': c.id }, h('span', { class: 'n' }, c.num), c.short)));
  });
}

function renderLegend() {
  $('#legend').replaceChildren(...COLORS.map(([c, name]) => h('button', {
    class: `c-${c}${hidden.has(c) ? ' off' : ''}`, title: `${name} 마킹 보이기/숨기기`,
    onclick() {
      hidden.has(c) ? hidden.delete(c) : hidden.add(c);
      safe(() => localStorage.setItem('qna-hidden', JSON.stringify([...hidden])));
      renderLegend(); refresh();
    },
  }, h('i', { style: `background:var(--${c})` }), h('span', {}, name))));
  COLORS.forEach(([c]) => document.body.classList.toggle('hide-' + c, hidden.has(c)));
}

function renderStrip() {
  const marks = roots(cur).filter(visibleMark).slice(cur ? 0 : -30);
  const strip = $('#markstrip');
  if (!marks.length) {
    strip.replaceChildren(h('span', { class: 'empty' },
      cur ? '이 장의 마킹 없음 · 본문을 드래그해서 첫 마킹을 남겨보세요' : '아직 마킹이 없어요 · 장을 열고 본문을 드래그하세요'));
    return;
  }
  strip.replaceChildren(...marks.map(p => {
    const n = repliesOf(p.id).length;
    return h('button', {
      class: `chip c-${colorOf(p)}${n ? '' : ' open'}`, title: `${p.body}\n— ${p.nick}`,
      onclick: () => go(`#${p.chapter}:m${p.id}`),
    }, h('b', {}, cur ? (n ? `A${n}` : 'Q') : chById(p.chapter)?.num ?? ''), h('span', {}, p.quote));
  }));
}

// ---------- 좌측: 폴더 트리 ----------
function dots(list) {
  const cs = [...new Set(list.map(colorOf))];
  return h('span', { class: 'dots' }, ...cs.map(c => h('i', { style: `background:var(--${c})` })));
}

function renderTree() {
  const tree = $('#tree');
  const folder = (key, cls, summary, body) => {
    const d = h('details', { class: cls, open: treeOpen.has(key) }, h('summary', {}, ...summary), body);
    d.addEventListener('toggle', () => d.open ? treeOpen.add(key) : treeOpen.delete(key));
    return d;
  };
  tree.replaceChildren(
    h('a', { href: '#', class: 'mono', style: 'font-size:.72rem;text-decoration:none;color:var(--text-3)' }, '← 전체 보기'),
    ...GROUPS.map(([g, name]) => folder('g-' + g, 'grp', [name],
      h('div', {}, ...CH.filter(c => c.group === g).map(c => {
        const marks = roots(c.id).filter(visibleMark);
        const sec = i => marks.filter(p => p.block === 's' + i);
        const d = folder(c.id, 'ch' + (c.id === cur ? ' current' : ''),
          [h('span', { class: 'num' }, c.num), h('span', { class: 't' }, c.short), dots(marks)],
          h('ul', {},
            h('li', {}, h('a', { href: `#${c.id}:guide` }, '★ 가이드')),
            ...c.sections.map((s, i) => h('li', {}, h('a', { href: `#${c.id}:s${i + 1}`, title: s.title }, s.title, ' ', dots(sec(i + 1)))))));
        d.querySelector('summary').addEventListener('click', () => { if (cur !== c.id) go('#' + c.id); });
        return d;
      })))),
    h('p', { class: 'mode-note' }, '본문을 드래그하면 형광펜·메모지로 마킹하고 질문할 수 있어요. 모든 글은 익명입니다.'),
  );
}

// ---------- 홈 ----------
function renderHome() {
  cur = null;
  const rs = roots();
  const answered = rs.filter(p => repliesOf(p.id).length).length;
  const recent = rs.filter(p => p.chapter !== 'lounge').slice(-10).reverse();
  main.replaceChildren(
    h('header', { class: 'hero' },
      h('p', { class: 'eyebrow' }, 'Vibe Coding Workbook · Q&A'),
      h('h1', {}, '워크북 Q&A', h('small', {}, 'MARK · ASK · ANSWER')),
      h('p', { class: 'pitch' }, '모르는 부분에 형광펜을 긋고 질문하세요. 아는 사람이 답합니다. 로그인 없이, 전부 익명.'),
      h('div', { class: 'process-strip' }, ...['본문 드래그', '색 고르기', '질문 올리기', '누구나 답변', '상단 칩으로 바로 이동']
        .flatMap((t, i) => i ? [h('span', { class: 'sep' }, '→'), h('span', {}, t)] : [h('span', {}, t)])),
      h('p', { class: 'stats' }, `${CH.length} Chapters · ${rs.length} Questions · ${answered} Answered`)),
    ...GROUPS.map(([g, name], gi) => h('section', { class: 'category' },
      h('div', { class: 'category-head' }, h('span', { class: 'cat-num' }, String(gi + 1).padStart(2, '0')), h('h2', {}, name)),
      h('div', { class: 'grid' }, ...CH.filter(c => c.group === g).map(c => {
        const q = roots(c.id), open = q.filter(p => !repliesOf(p.id).length).length;
        return h('a', { class: 'card', href: '#' + c.id },
          h('div', { class: 'card-top' }, h('span', { class: 'card-num' }, chNum(c)),
            h('span', { class: 'status ' + (open ? 'filled' : q.length ? 'outline' : 'faint') },
              open ? `답변 대기 ${open}` : q.length ? `Q ${q.length}` : 'Q 0')),
          h('p', { class: 'card-title' }, c.title.replace(/^.+?\.\s*/, '')),
          c.goal && h('p', { class: 'card-desc' }, plain(c.goal)));
      })))),
    h('section', { class: 'category' },
      h('div', { class: 'category-head' }, h('span', { class: 'cat-num' }, 'NEW'), h('h2', {}, '최근 질문')),
      recent.length ? h('div', {}, ...recent.map(p => h('a', {
        class: 'post', href: `#${p.chapter}:m${p.id}`, style: 'display:block;text-decoration:none',
      }, h('div', { class: 'post-meta' }, h('b', {}, chNum(chById(p.chapter) || { num: '?' })), fmt(p.created_at),
          h('span', { class: 'tag' }, `답변 ${repliesOf(p.id).length}`)),
        p.quote && h('span', { class: `post-quote c-${colorOf(p)}` }, p.quote),
        h('p', { class: 'post-body' }, p.body))))
      : h('p', { class: 'card-desc' }, '아직 질문이 없어요.')),
  );
}

// ---------- 장 화면 ----------
function guideBlock(title, body) {
  return body && h('div', { class: 'd-block' }, h('h2', {}, title), body);
}

function renderChapter(c) {
  cur = c.id;
  applied.clear();
  treeOpen.add(c.id);
  const li = s => h('li', { html: marked.parseInline(s) });
  const isApp = c.group === 'app';
  const guide = h('div', { class: 'guide', id: `${c.id}-guide`, 'data-block': 'guide' },
    h('p', { class: 'eyebrow' }, 'Guide · 핵심 요약'),
    c.goals.length ? guideBlock('학습 목표', h('ul', {}, c.goals.map(li))) : null,
    c.concepts.length ? guideBlock('핵심 개념', h('div', { class: 'pill-list' }, c.concepts.map(t => h('span', {}, t.replace(/^\d+\.\d+\s*/, ''))))) : null,
    c.steps.length ? guideBlock('실습 순서', h('ol', {}, c.steps.map(t => h('li', {}, t.replace(/^Step \d+\.\s*/, ''))))) : null,
    c.tasks.length ? guideBlock('과제', h('ul', {}, c.tasks.map(t => h('li', { class: 'task' + (/필수/.test(t) ? ' must' : '') },
      t.replace(/\s*\(필수\)/, ''), /필수/.test(t) && h('span', { class: 'badge' }, '필수'))))) : null,
    c.checklist.length ? guideBlock('제출 체크리스트', h('ul', { class: 'check' }, c.checklist.map(li))) : null,
    (isApp || !c.goals.length) ? guideBlock('구성', h('ul', {}, c.sections.map((s, i) => h('li', {}, h('a', { href: `#${c.id}:s${i + 1}` }, s.title))))) : null,
    c.links.length ? guideBlock('필수 링크', h('div', { class: 'links' }, c.links.map(([t, u]) => h('a', { href: u, target: '_blank', rel: 'noopener' }, t + ' ↗')))) : null,
    c.troubles.length ? guideBlock('자주 막히는 지점', h('table', { class: 'trouble' }, c.troubles.map(r =>
      h('tr', {}, r.map(cell => h('td', { html: marked.parseInline(cell) })))))) : null,
  );
  const folders = c.sections.map((s, i) => h('details', { class: 'folder', id: `${c.id}-s${i + 1}` },
    h('summary', {}, s.title, h('span', { class: 'cnt' })),
    h('div', { class: 'md', 'data-block': 's' + (i + 1), html: marked.parse(s.md) })));
  const expand = h('button', { onclick() { const open = !folders.every(f => f.open); folders.forEach(f => f.open = open); } }, '모두 펼치기 / 접기');

  main.replaceChildren(...[
    h('header', { class: 'detail-head' },
      h('p', { class: 'detail-tags' }, h('span', {}, GROUPS.find(g => g[0] === c.group)[1]), h('span', {}, '·'), h('span', {}, chNum(c))),
      h('h1', {}, c.title),
      h('div', { class: 'detail-links' },
        h('a', { class: 'btn-line', href: 'files/' + encodeURIComponent(c.file), download: c.file }, '⬇ 원문 .md 받기'),
        h('a', { class: 'btn-line', href: 'files/' + encodeURIComponent(c.file), target: '_blank' }, '원문 파일 열기 ↗'),
        h('button', { class: 'btn-line', onclick: openChat }, '💬 이 장 질문방'))),
    c.goal && h('p', { class: 'hook', html: marked.parseInline(c.goal) }),
    c.time && h('p', { class: 'hook-sub' }, '⏱ ' + c.time),
    !c.goal && h('div', { style: 'border-top:1px solid var(--ink);margin-bottom:2rem' }),
    guide,
    h('div', { class: 'src-head', id: `${c.id}-src` }, h('h2', {}, '원문 · 섹션 폴더'), expand),
    c.intro && h('div', { class: 'intro md', 'data-block': 's0', html: marked.parse(c.intro) }),
    ...folders,
  ].filter(Boolean));
  // 원문 후처리: 로컬 이미지는 자리표시, 외부 링크는 새 탭
  main.querySelectorAll('.md img').forEach(img => {
    if (!/^https?:/.test(img.getAttribute('src'))) img.replaceWith(h('span', { class: 'img-ph' }, `[이미지: ${img.alt}]`));
  });
  main.querySelectorAll('.md a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
}

function updateFolderCounts() {
  if (!cur) return;
  const marks = roots(cur).filter(visibleMark);
  main.querySelectorAll('details.folder').forEach(f => {
    const b = 's' + f.id.split('-s')[1];
    f.querySelector('.cnt').replaceChildren(...marks.filter(p => p.block === b).map(p => h('i', { style: `background:var(--${colorOf(p)})` })));
  });
}

// ---------- 마킹: 텍스트 오프셋으로 저장하고 다시 감싸기 ----------
function nearest(text, q, at) {
  let best = -1;
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) if (best < 0 || Math.abs(i - at) < Math.abs(best - at)) best = i;
  return best;
}

function applyMark(p) {
  if (applied.has(p.id)) return;
  const root = main.querySelector(`[data-block="${p.block}"]`);
  if (!root) return;
  const text = root.textContent;
  const start = text.substr(p.start_offset, p.quote.length) === p.quote ? p.start_offset : nearest(text, p.quote, p.start_offset || 0);
  if (start < 0) return; // 원문이 바뀌어 위치를 못 찾음 → 채팅에서만 보임
  const end = start + p.quote.length;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts = [];
  for (let n, pos = 0; pos < end && (n = walker.nextNode()); pos += n.data.length) {
    const s = Math.max(start - pos, 0), e = Math.min(end - pos, n.data.length);
    if (s < e && n.data.slice(s, e).trim()) parts.push([n, s, e]);
  }
  parts.forEach(([n, s, e], k) => {
    if (e < n.data.length) n.splitText(e);
    const t = s > 0 ? n.splitText(s) : n;
    const m = h('mark', { class: `hl ${p.style === 'sticky' ? 'sticky' : 'highlight'} c-${colorOf(p)}${k === parts.length - 1 ? ' last' : ''}`, 'data-id': p.id, title: p.body });
    t.before(m);
    m.append(t);
  });
  applied.add(p.id);
}

const seltool = $('#seltool');
$('#selColors').append(...COLORS.map(([c, name]) => h('button', {
  class: `swatch c-${c}`,
  onmousedown: e => e.preventDefault(), // 선택 영역 유지
  onclick: () => startAsk(c),
}, name)));

function currentSelection() {
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const el = n => n.nodeType === 1 ? n : n.parentElement;
  const block = el(r.startContainer)?.closest('[data-block]');
  if (!block || block !== el(r.endContainer)?.closest('[data-block]') || !main.contains(block)) return null;
  const raw = r.toString();
  if (!raw.trim()) return null;
  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(r.startContainer, r.startOffset);
  return { r, block: block.dataset.block, start_offset: pre.toString().length + (raw.length - raw.trimStart().length), quote: raw.trim().slice(0, 300) };
}

function showSeltool(e) {
  setTimeout(() => {
    const s = currentSelection();
    if (!s) { seltool.hidden = true; return; }
    seltool.hidden = false;
    const rect = s.r.getBoundingClientRect();
    const below = e?.type === 'touchend';
    seltool.style.top = (scrollY + (below ? rect.bottom + 12 : rect.top - seltool.offsetHeight - 8)) + 'px';
    seltool.style.left = Math.max(8, Math.min(innerWidth - seltool.offsetWidth - 8, scrollX + rect.left + rect.width / 2 - seltool.offsetWidth / 2)) + 'px';
  });
}
main.addEventListener('mouseup', showSeltool);
main.addEventListener('touchend', showSeltool);
document.addEventListener('selectionchange', () => { if (getSelection().isCollapsed) seltool.hidden = true; });

const askDlg = $('#askDlg');
let askColor = 'yellow';
function renderAskColors() {
  $('#askColors').replaceChildren(...COLORS.map(([c, name]) => h('button', {
    type: 'button', class: `swatch c-${c}${c === askColor ? ' on' : ''}`, onclick: () => { askColor = c; renderAskColors(); },
  }, name)));
}
function startAsk(color) {
  pending = currentSelection();
  if (!pending) return;
  delete pending.r;
  askColor = color;
  renderAskColors();
  $('#askQuote').textContent = pending.quote;
  seltool.hidden = true;
  askDlg.showModal();
  $('#askBody').focus();
}
askDlg.addEventListener('close', async () => {
  if (askDlg.returnValue !== 'ok' || !pending) return;
  const body = $('#askBody').value.trim();
  if (!body) return;
  try {
    const row = await store.add({ ...pending, chapter: cur, color: askColor, style: new FormData($('#askForm')).get('style'), body, nick });
    $('#askBody').value = '';
    pending = null;
    getSelection().removeAllRanges();
    ingest(row);
    openChat();
    flashPost(row.id);
  } catch (err) {
    alert('저장 실패: ' + err.message);
    askDlg.showModal(); // 쓴 내용 보존
  }
});

// ---------- 우측: 채팅 ----------
function postEl(p, isReply) {
  const kids = isReply ? [] : repliesOf(p.id);
  return h('div', { class: 'post', id: 'post-' + p.id },
    h('div', { class: 'post-meta' }, h('b', {}, p.nick), fmt(p.created_at),
      isMark(p) && h('span', { class: 'tag' }, '● ' + label(colorOf(p)) + (p.style === 'sticky' ? ' · 메모' : ''))),
    isMark(p) && h('button', { class: `post-quote c-${colorOf(p)}`, onclick: () => go(`#${p.chapter}:m${p.id}`) },
      h('span', { class: 'go' }, '↗ 위치'), '“' + p.quote + '”'),
    h('p', { class: 'post-body' }, p.body),
    !isReply && h('div', { class: 'post-actions' }, h('button', { onclick: () => setReply(p) }, `↳ 답변하기${kids.length ? ` (${kids.length})` : ''}`)),
    kids.length ? h('div', { class: 'replies' }, kids.map(k => postEl(k, true))) : null);
}

function renderChat() {
  const c = chById(cur);
  $('#chatChannel').textContent = c ? chNum(c) + ' 질문방' : 'LOUNGE';
  $('#chatTitle').textContent = c ? c.short : '전체 라운지';
  $('#nick').textContent = nick + ' ✎';
  $('#mode').textContent = store.live ? '● LIVE · 실시간 저장' : '○ LOCAL · 이 브라우저에만 저장 (config.js 미설정)';
  const list = $('#chatList');
  const atBottom = firstChat || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  let rs = roots(channel());
  if (chatFilter === 'open') rs = rs.filter(p => !repliesOf(p.id).length);
  if (chatFilter === 'marks') rs = rs.filter(isMark);
  rs = rs.filter(p => !isMark(p) || !hidden.has(colorOf(p)));
  list.replaceChildren(...(rs.length ? rs.map(p => postEl(p)) : [h('p', { class: 'empty' },
    c ? '아직 글이 없어요.\n본문을 드래그해서 마킹하거나\n아래에 바로 질문을 남겨보세요.' : '자유롭게 이야기하는 곳이에요.\n장별 질문은 각 장을 열면 나와요.')]));
  if (atBottom) list.scrollTop = list.scrollHeight;
  firstChat = false;
}

function setReply(p) {
  replyTo = p;
  const r = $('#replying');
  r.hidden = !p;
  if (p) r.replaceChildren(h('span', {}, `↳ ${p.nick}에게 답변: ${p.body}`), h('button', { type: 'button', onclick: () => setReply(null) }, '✕'));
  $('#msg').focus();
}

$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const ta = $('#msg'), body = ta.value.trim();
  if (!body) return;
  try {
    const row = await store.add({ chapter: replyTo?.chapter || channel(), parent_id: replyTo?.id ?? null, body, nick });
    ta.value = '';
    setReply(null);
    ingest(row);
    $('#chatList').scrollTop = 1e9;
  } catch (err) { alert('전송 실패: ' + err.message); }
});
$('#msg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
document.querySelectorAll('.chat-tabs button').forEach(b => b.addEventListener('click', () => {
  chatFilter = b.dataset.f;
  document.querySelectorAll('.chat-tabs button').forEach(x => x.classList.toggle('on', x === b));
  renderChat();
}));
$('#nick').addEventListener('click', () => {
  const v = prompt('닉네임 (익명, 30자 이내)', nick)?.trim();
  if (v) { nick = v.slice(0, 30); safe(() => localStorage.setItem('qna-nick', nick)); renderChat(); }
});

function flashPost(id) {
  const el = document.getElementById('post-' + id);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

// ---------- 패널 열고 닫기 (좁은 화면) ----------
function openChat() { document.body.classList.add('chat-open'); document.body.classList.remove('tree-open'); $('#chatDot').hidden = true; }
$('#btnChat').addEventListener('click', () => { document.body.classList.contains('chat-open') ? closePanels() : openChat(); $('#msg').focus(); });
$('#btnTree').addEventListener('click', () => document.body.classList.toggle('tree-open'));
$('#scrim').addEventListener('click', closePanels);
function closePanels() { document.body.classList.remove('chat-open', 'tree-open'); }
$('#tree').addEventListener('click', e => { if (e.target.closest('a')) document.body.classList.remove('tree-open'); });
main.addEventListener('click', e => {
  const m = e.target.closest('mark.hl');
  if (m && getSelection().isCollapsed) { openChat(); flashPost(m.dataset.id); }
});

// ---------- 라우팅: #ch2, #ch2:s3(섹션), #ch2:guide, #ch2:m123(마킹) ----------
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

function route() {
  const [id, part = ''] = decodeURIComponent(location.hash.slice(1)).split(':');
  const c = chById(id);
  const changed = (c ? c.id : null) !== cur || !main.firstChild;
  if (changed) { c ? renderChapter(c) : renderHome(); setReply(null); firstChat = true; }
  refresh();
  document.querySelectorAll('#catnav a').forEach(a => {
    a.classList.toggle('active', a.dataset.id === cur);
    if (a.dataset.id === cur) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  if (/^m\d+$/.test(part)) return jumpToMark(part.slice(1));
  const target = c && /^(s\d+|guide|src)$/.test(part) && document.getElementById(`${c.id}-${part}`);
  if (target) { if (target.tagName === 'DETAILS') target.open = true; target.scrollIntoView({ behavior: 'smooth' }); }
  else if (changed) scrollTo(0, 0);
}

function jumpToMark(id) {
  const ms = main.querySelectorAll(`mark[data-id="${id}"]`);
  if (ms.length) {
    const f = ms[0].closest('details');
    if (f) f.open = true;
    ms[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    ms.forEach(m => m.classList.add('flash'));
    setTimeout(() => ms.forEach(m => m.classList.remove('flash')), 1800);
  }
  if (innerWidth > 1240) flashPost(id);
}

// ---------- 갱신 ----------
let queued = false;
function refresh() {
  renderTree();
  renderStrip();
  renderChat();
  if (cur) { roots(cur).filter(isMark).forEach(applyMark); updateFolderCounts(); }
}
function ingest(p) {
  if (!p || posts.has(p.id)) return;
  posts.set(p.id, p);
  if (p.chapter === channel() && !document.body.classList.contains('chat-open') && innerWidth <= 1240) $('#chatDot').hidden = false;
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; if (!cur) renderHome(); refresh(); });
}

marked.use({ gfm: true });
renderCatnav();
renderLegend();
addEventListener('hashchange', route);
route();
store.list()
  .then(rows => { rows.forEach(r => posts.set(r.id, r)); if (!cur) renderHome(); route(); })
  .catch(err => { $('#mode').textContent = '불러오기 실패: ' + err.message; });
store.onInsert(ingest);
})();
