// BETTER ME — 화면과 상호작용
import {
  store, drafts, navStore, DOMAINS, domainName, UNITS, ALL_DAYS, DAY_NAMES, TEMPLATES, APP_VERSION, BUILD,
  todayKey, keyOf, addDays, weekdayOf, weekStartOf, monthStartOf, monthEndOf,
  fmtLong, fmtShort, fmtShortDay, fmtRange, fmtMonth, fmtClock, deviceTimeZone, nowISO, uuid, josa,
} from './store.js';
import * as M from './model.js';
import * as S from './stats.js';
import { coachReply, validateProposal } from './coach.js';
import { icon } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const D = () => store.db;
const tz = () => D().profile.timezoneID;
const today = () => todayKey(tz());

const TABS = [
  { id: 'home', label: '홈', icon: 'house' },
  { id: 'habits', label: '습관', icon: 'check' },
  { id: 'growth', label: '성장', icon: 'chart' },
  { id: 'coach', label: 'AI 코치', icon: 'bubble' },
  { id: 'settings', label: '설정', icon: 'gear' },
];
const emptyStacks = () => ({ home: [], habits: [], growth: [], coach: [], settings: [] });

const ui = {
  tab: 'home', stacks: emptyStacks(), scroll: {},
  homeDate: null, homeDomain: null,
  habitsScope: 'all', habitsQuery: '',
  growthMode: 'week', growthAnchor: null, growthTable: false, growthSel: null,
  onbStep: 0, onbPicks: null,
  coachContext: null,
};

// ---------- 포맷 ----------

function fmtNum(n, unit) {
  if (n == null || Number.isNaN(n)) return '–';
  return unit === '시간' ? (Math.round(n * 100) / 100).toLocaleString('ko-KR') : Math.round(n).toLocaleString('ko-KR');
}
const amount = (n, unit) => `${fmtNum(n, unit)}${unit}`;
function repeatText(wd) {
  if (wd.length === 7) return '매일';
  const key = [...wd].sort().join('');
  if (key === '12345') return '평일';
  if (key === '06') return '주말';
  return ALL_DAYS.filter(d => wd.includes(d)).map(d => DAY_NAMES[d]).join('·');
}
const targetText = v => (v.kind === 'check' ? '하루 1회' : amount(v.target, v.unit));
const domainDot = id => `<span class="dot dom-${id}" aria-hidden="true"></span>`;
function parseNum(s) {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').replace(/,/g, '').trim();
  if (!t) return NaN;
  return /^-?\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}
function unitError(n, unit) {
  if (unit === '시간') return Math.abs(n * 4 - Math.round(n * 4)) > 1e-9 ? '선택 단위와 맞는 값을 입력해 주세요 (0.25시간 단위)' : null;
  return Number.isInteger(n) ? null : '선택 단위와 맞는 값을 입력해 주세요';
}
const pct = r => `${Math.round(r * 100)}%`;

// ---------- 공통: 저장, 토스트, 시트, 대화상자 ----------

let toastTimer = null, toastAction = null;
function toast(msg, opts = {}) {
  const root = $('#toast-root');
  clearTimeout(toastTimer);
  toastAction = opts.onAction || null;
  root.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${opts.action ? `<button type="button" data-act="toastAction">${esc(opts.action)}</button>` : ''}</div>`;
  toastTimer = setTimeout(() => { root.innerHTML = ''; toastAction = null; }, opts.duration || (opts.action ? 5000 : 2600));
}

function save(mutator, retry = true) {
  try {
    return { ok: true, value: store.commit(mutator) };
  } catch (e) {
    console.error(e);
    toast('저장하지 못했어요. 기존 값을 그대로 두었어요.', retry ? { action: '다시 시도', onAction: () => { if (save(mutator, false).ok) render(); } } : {});
    return { ok: false, error: e };
  }
}

let sheet = null, lastFocus = null;
function openSheet(html, opts = {}) {
  if (sheet) return false; // 시트는 하나만
  lastFocus = document.activeElement;
  $('#sheet-root').innerHTML = `<div class="sheet-backdrop" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.label || '')}"><div class="sheet-handle" aria-hidden="true"></div>${html}</div></div>`;
  sheet = opts;
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => {
    if (sheet !== opts) return; // 이미 닫혔거나 다른 시트로 바뀜
    if (opts.onOpen) { try { opts.onOpen(); } catch { /* 초점 이동 실패는 무시 */ } }
    else $('#sheet-root .sheet h2, #sheet-root .sheet button')?.focus?.();
  });
  return true;
}
function closeSheet(force = false) {
  if (!sheet) return;
  if (!force && sheet.isDirty && sheet.isDirty()) {
    dialog({
      title: '작성 중인 내용이 있어요',
      message: '닫으면 지금까지 입력한 내용이 사라져요.',
      actions: [{ label: '계속 작성', style: 'btn-primary' }, { label: '변경 버리기', style: 'btn-danger', run: () => closeSheet(true) }],
    });
    return;
  }
  const s = sheet;
  sheet = null;
  $('#sheet-root').innerHTML = '';
  document.body.classList.remove('sheet-open');
  if (s.onClose) s.onClose();
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

let dialogActions = null;
function dialog({ title, message, actions }) {
  dialogActions = actions;
  $('#dialog-root').innerHTML = `<div class="dialog-backdrop"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" ${message ? 'aria-describedby="dlg-m"' : ''}>
    <h2 id="dlg-t" class="t-title">${esc(title)}</h2>${message ? `<p id="dlg-m" class="t-sub">${esc(message)}</p>` : ''}
    <div class="dialog-actions">${actions.map((a, i) => `<button type="button" class="btn ${a.style || 'btn-secondary'}" data-act="dlg" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div></div>`;
  $('#dialog-root button').focus();
}
function closeDialog() { $('#dialog-root').innerHTML = ''; dialogActions = null; }

function sheetHead(title, closeLabel = '닫기') {
  return `<div class="sheet-head"><h2 class="t-title" tabindex="-1">${esc(title)}</h2><button type="button" class="btn-text" data-act="closeSheet">${closeLabel}</button></div>`;
}

// ---------- 내비게이션 ----------

function persistNav() {
  navStore.set({ tab: ui.tab, stacks: ui.stacks, habitsScope: ui.habitsScope, growthMode: ui.growthMode });
}
function restoreNav() {
  const n = navStore.get();
  if (!n) return;
  if (TABS.some(t => t.id === n.tab)) ui.tab = n.tab;
  if (n.stacks && typeof n.stacks === 'object') {
    for (const t of TABS) if (Array.isArray(n.stacks[t.id])) ui.stacks[t.id] = n.stacks[t.id].filter(v => v && typeof v.view === 'string');
  }
  if (n.habitsScope) ui.habitsScope = n.habitsScope;
  if (n.growthMode === 'month' || n.growthMode === 'week') ui.growthMode = n.growthMode;
}
function push(view) {
  ui.stacks[ui.tab].push(view);
  persistNav();
  render();
  window.scrollTo(0, 0);
}
function pop() {
  ui.stacks[ui.tab].pop();
  persistNav();
  render();
}
function switchTab(id) {
  if (ui.tab === id) {
    if (ui.stacks[id].length) ui.stacks[id] = [];
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    ui.scroll[ui.tab] = window.scrollY;
  }
  const changed = ui.tab !== id;
  ui.tab = id;
  persistNav();
  render();
  if (changed) window.scrollTo(0, ui.scroll[id] || 0);
}
const backBar = () => `<div class="nav-bar"><button type="button" class="btn-text back" data-act="back">${icon('chevL', false, 20)}<span>뒤로</span></button></div>`;

// ---------- 렌더 ----------

function applyTheme() {
  const t = D().profile.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#141B18' : '#F6F7F3');
}

function render() {
  applyTheme();
  const app = $('#app');
  if (store.loadError) {
    app.innerHTML = renderLoadError();
    $('#tabbar').innerHTML = '';
    return;
  }
  if (!D().profile.onboardingCompleted) {
    document.body.classList.add('onboarding');
    app.innerHTML = renderOnboarding();
    $('#tabbar').innerHTML = '';
    return;
  }
  document.body.classList.remove('onboarding');
  const stack = ui.stacks[ui.tab];
  const top = stack[stack.length - 1];
  const views = { home: renderHome, habits: renderHabits, growth: renderGrowth, coach: renderCoach, settings: renderSettings };
  app.innerHTML = top ? renderPushed(top) : views[ui.tab]();
  renderTabbar();
}

function renderTabbar() {
  $('#tabbar').innerHTML = `<div class="tabs" role="tablist" aria-label="주요 메뉴">${TABS.map(t => {
    const sel = ui.tab === t.id;
    return `<button type="button" class="tab" role="tab" aria-selected="${sel}" aria-label="${t.label}" data-act="tab" data-tab="${t.id}">${icon(t.icon, sel, 26)}<span aria-hidden="true">${t.label}</span></button>`;
  }).join('')}</div>`;
}

function renderPushed(v) {
  if (v.view === 'habit') return renderHabitDetail(v.id);
  if (v.view === 'day') return renderDay(v.date);
  if (v.view === 'domain') return renderDomain(v);
  if (v.view === 'archived') return renderArchived();
  return `${backBar()}<p>화면을 찾을 수 없어요.</p>`;
}

// ---------- 온보딩 ----------

function renderOnboarding() {
  const s = ui.onbStep;
  if (!ui.onbPicks) ui.onbPicks = new Set(TEMPLATES.filter(t => t.preset).map(t => t.key));
  if (s === 0) {
    return `<div class="onb">
      <div class="onb-mark" aria-hidden="true">${icon('check', true, 64)}</div>
      <h1 class="t-large">BETTER ME</h1>
      <p class="lead">하루의 작은 행동을 기록하고, 돌아보고, 다음 행동 하나를 골라요.</p>
      <ul class="onb-points">
        <li>${icon('checkmark', false, 20)}회원가입 없이 이 기기에만 저장돼요</li>
        <li>${icon('checkmark', false, 20)}점수로 나를 평가하지 않아요</li>
        <li>${icon('checkmark', false, 20)}오늘 할 일을 10초 안에 확인하고 기록해요</li>
      </ul>
      <button type="button" class="btn btn-primary" data-act="onbNext">시작하기</button>
    </div>`;
  }
  if (s === 1) {
    return `<div class="onb">
      <p class="t-cap">1 / 2</p>
      <h1 class="t-large">다섯 가지 영역</h1>
      <p class="t-sub">삶을 다섯 영역으로 나눠 작은 습관을 만들어요. 어느 영역도 나를 평가하는 점수가 아니에요.</p>
      <ul class="domain-intro">${DOMAINS.map(d => `<li class="dom-${d.id}"><strong>${d.name}</strong><span>${d.purpose}</span><span class="t-cap">예: ${d.example}</span></li>`).join('')}</ul>
      <div class="btn-pair"><button type="button" class="btn btn-secondary" data-act="onbBack">이전</button><button type="button" class="btn btn-primary" data-act="onbNext">다음</button></div>
    </div>`;
  }
  const n = ui.onbPicks.size;
  return `<div class="onb">
    <p class="t-cap">2 / 2</p>
    <h1 class="t-large">무엇부터 시작할까요?</h1>
    <p class="t-sub">언제든 바꾸거나 지울 수 있어요. 하나도 고르지 않고 시작해도 괜찮아요.</p>
    <div class="pick-list">${TEMPLATES.map(t => {
      const on = ui.onbPicks.has(t.key);
      return `<button type="button" class="pick dom-${t.domain}" data-act="onbPick" data-key="${t.key}" aria-pressed="${on}">
        <span class="pick-box">${on ? icon('checkmark', false, 18) : ''}</span>
        <span class="pick-text"><strong>${esc(t.name)}${t.kind === 'numeric' ? ` ${amount(t.target, t.unit)}` : ''}</strong><span class="t-cap">${domainName(t.domain)} · 매일${t.preset ? '' : ' · 선택'}</span></span></button>`;
    }).join('')}</div>
    <p class="hint">웹 버전은 Apple Health를 읽을 수 없어서 걸음·수면은 직접 숫자로 기록해요.</p>
    <div class="btn-pair"><button type="button" class="btn btn-secondary" data-act="onbBack">이전</button><button type="button" class="btn btn-primary" data-act="onbStart">${n ? `${n}개로 시작하기` : '선택 없이 시작하기'}</button></div>
  </div>`;
}

function onbStart() {
  const t = todayKey(deviceTimeZone());
  const picks = TEMPLATES.filter(x => ui.onbPicks.has(x.key));
  const res = save(d => {
    d.profile.timezoneID = deviceTimeZone();
    for (const p of picks) M.createHabit(d, { ...p, weekdays: [...ALL_DAYS], startDate: t, note: '' }, nowISO());
    d.profile.onboardingCompleted = true;
  });
  if (!res.ok) return;
  ui.tab = 'home'; ui.stacks = emptyStacks(); ui.homeDate = null; ui.onbStep = 0; ui.onbPicks = null;
  persistNav();
  render();
  window.scrollTo(0, 0);
}

function renderLoadError() {
  return `<div class="onb">
    <h1 class="t-large">저장된 데이터를 읽지 못했어요</h1>
    <p class="t-sub">원본 데이터는 지우지 않고 그대로 두었어요. 원본을 파일로 저장해 두거나, 초기화하고 새로 시작할 수 있어요.</p>
    <button type="button" class="btn btn-primary" data-act="loadErrExport">원본 데이터 파일로 저장</button>
    <button type="button" class="btn btn-danger" data-act="loadErrReset">초기화하고 새로 시작</button>
  </div>`;
}

// ---------- 홈 ----------

function coachCardInfo() {
  const msgs = D().messages.filter(m => m.role === 'coach' && !m.safety);
  const withProp = [...msgs].reverse().find(m => D().proposals.some(p => p.messageID === m.id));
  const m = withProp || msgs[msgs.length - 1];
  if (!m) return { label: '코치', text: '오늘은 작은 것 하나부터 시작해 볼까요?' };
  const p = D().proposals.find(x => x.messageID === m.id);
  const isToday = keyOf(new Date(m.createdAt), tz()) === today();
  const cut = m.text.search(/[.?!]\s/);
  let text = p ? proposalHeadline(p) : cut > 0 ? m.text.slice(0, cut + 1) : m.text;
  if (p && p.appliedHabitID) text += ' · 추가됨';
  return { label: isToday ? '오늘의 제안' : '이전 제안', text };
}
function proposalHeadline(p) {
  const x = p.payload;
  if (p.action === 'create') return `${x.name}${x.kind === 'numeric' ? ` ${amount(x.target, x.unit)}` : ''}부터 해볼까요`;
  return `${josa(`‘${x.name}’`, '을', '를')} ${x.kind === 'numeric' ? amount(x.target, x.unit) : repeatText(x.weekdays)}(으)로 가볍게 해볼까요`;
}

function habitRow(it, date) {
  const { habit: h, plan: p, log, done } = it;
  let sub, aria;
  if (p.kind === 'check') {
    sub = done ? '완료' : '미완료';
    aria = `${h.name}, ${done ? '완료' : '미완료'}, ${done ? '미완료로 변경' : '완료로 변경'}`;
  } else {
    const val = log && typeof log.manualValue === 'number' ? log.manualValue : null;
    sub = `${val == null ? '0' : fmtNum(val, p.unit)} / ${amount(p.target, p.unit)}${done ? ' · 완료' : ''}`;
    aria = `${h.name}, ${val == null ? '기록 없음' : amount(val, p.unit)}, 목표 ${amount(p.target, p.unit)}, ${done ? '완료' : '미완료'}, 수치 입력`;
  }
  const prog = M.progressOf(p, log);
  return `<div class="hrow${done ? ' is-done' : ''}">
    <button type="button" class="status-btn${done ? ' done' : ''}" data-act="${p.kind === 'check' ? 'toggle' : 'record'}" data-id="${h.id}" data-date="${date}" aria-label="${esc(aria)}">
      <span class="ring">${done ? icon('checkmark', false, 18) : p.kind === 'numeric' ? icon('pencil', false, 16) : ''}</span></button>
    <button type="button" class="row-body" data-act="openHabit" data-id="${h.id}">
      <span class="row-title">${esc(h.name)}</span>
      <span class="row-sub">${domainDot(p.domain)}${domainName(p.domain)} · ${sub}</span>
      ${p.kind === 'numeric' ? `<span class="bar thin" aria-hidden="true"><i style="width:${pct(prog)}"></i></span>` : ''}
    </button>
  </div>`;
}

function renderHome() {
  const t = today();
  if (!ui.homeDate || ui.homeDate > t) ui.homeDate = t;
  const date = ui.homeDate;
  const isToday = date === t;
  const st = S.dayStats(D(), date);
  const items = ui.homeDomain ? st.items.filter(i => i.plan.domain === ui.homeDomain) : st.items;
  const nick = D().profile.nickname;
  const hasHabits = D().habits.length > 0;

  let summary;
  if (st.N === 0) {
    summary = `<div class="card summary">
      <h2 class="t-title">${isToday ? '오늘은 비어 있어요' : '이 날은 예정된 습관이 없었어요'}</h2>
      <p class="t-sub">${hasHabits ? '예정된 습관이 없는 날이에요.' : '작은 습관 하나로 시작해 볼까요?'}</p>
      ${isToday ? '<button type="button" class="btn btn-primary" data-act="newHabit">습관 추가</button>' : ''}
    </div>`;
  } else {
    const all = st.C === st.N;
    const caption = !isToday ? '이 날의 기록이에요' : all ? '오늘의 약속을 모두 마쳤어요' : `아직 ${st.N - st.C}번의 기회`;
    summary = `<button type="button" class="card summary as-button" data-act="goHabits" aria-label="${st.N}개 중 ${st.C}개 완료, ${caption}, 습관 탭으로 이동">
      <span class="summary-line"><span class="summary-num">${st.C} / ${st.N}</span><span class="t-sub">완료 · ${caption}</span></span>
      <span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${st.N}" aria-valuenow="${st.C}"><i style="width:${pct(st.C / st.N)}"></i></span>
    </button>`;
  }

  const chips = DOMAINS.map(d => {
    const x = st.byDomain[d.id];
    const sel = ui.homeDomain === d.id;
    return `<button type="button" class="chip dom-${d.id}" data-act="homeDomain" data-v="${d.id}" aria-pressed="${sel}">${sel ? icon('checkmark', false, 16) : ''}${d.name} <span class="chip-val">${x.N ? `${x.C}/${x.N}` : '–'}</span></button>`;
  }).join('');

  let list;
  if (!items.length && st.N > 0) {
    list = `<div class="card empty"><p>이 영역에는 ${isToday ? '오늘' : '이 날'} 예정된 습관이 없어요</p><button type="button" class="btn btn-secondary" data-act="homeDomain" data-v="${ui.homeDomain}">필터 해제</button></div>`;
  } else if (items.length) {
    list = `<div class="habit-list">${items.map(it => habitRow(it, date)).join('')}</div>`;
  } else list = '';

  const cc = coachCardInfo();
  return `
    <header class="page-head">
      <button type="button" class="date-btn" data-act="pickDate" aria-label="날짜 선택, 현재 ${fmtLong(date)}">${fmtLong(date)}${isToday ? '' : ' · 지난 날짜'} ${icon('chevR', false, 16)}</button>
      <h1 class="t-large">${nick ? `${esc(nick)}님, ` : ''}${isToday ? '오늘도 나답게' : '그날의 기록'}</h1>
      ${isToday ? '' : '<button type="button" class="btn-text" data-act="dateToday">오늘로 돌아가기</button>'}
    </header>
    ${summary}
    ${st.N ? `<section aria-label="영역별 현황"><div class="chip-row">${chips}</div></section>` : ''}
    ${list ? `<section class="section"><h2 class="t-title section-title">${isToday ? '오늘의 습관' : '그날의 습관'}${ui.homeDomain ? ` · ${domainName(ui.homeDomain)}` : ''}</h2>${list}</section>` : ''}
    <button type="button" class="card coach-card" data-act="goCoach">
      <span class="coach-label">${icon('bubble', false, 18)} ${cc.label}</span>
      <span class="coach-text">${esc(cc.text)}</span>
    </button>`;
}

// 체크 연타는 하나의 작업으로 처리
const tapLock = new Map();
function actToggle(el) {
  const id = el.dataset.id, date = el.dataset.date;
  const k = id + date, ms = Date.now();
  if (ms - (tapLock.get(k) || 0) < 600) return;
  tapLock.set(k, ms);
  if (date > today()) return;
  const plan = M.planFor(D(), id, date);
  if (!plan || !plan.scheduled) return;
  const wasDone = M.isDone(plan, M.getLog(D(), id, date));
  const res = save(d => M.setLog(d, id, date, { checked: !wasDone }, nowISO()));
  render();
  if (!res.ok) return;
  if (!wasDone) popRing(id, date);
  toast(wasDone ? '미완료로 바꿨어요' : '완료했어요', { action: '실행 취소', onAction: () => undoRecord(id, date, res.value) });
}
function popRing(id, date) {
  const el = document.querySelector(`.status-btn[data-id="${id}"][data-date="${date}"] .ring`);
  if (el) el.classList.add('pop');
}
function undoRecord(id, date, { prev, revision }) {
  const r = save(d => M.undoLog(d, id, date, prev, revision, nowISO()));
  if (!r.ok) return;
  toast(r.value ? '되돌렸어요' : '그 사이 새 기록이 있어 되돌리지 않았어요');
  render();
}

function openRecordSheet(id, date) {
  const t = today();
  if (date > t) return;
  const h = M.habit(D(), id);
  const p = M.planFor(D(), id, date);
  if (!h || !p) return;
  const log = M.getLog(D(), id, date);
  const done = M.isDone(p, log);
  const hasValue = log && typeof log.manualValue === 'number';
  let body;
  if (!p.scheduled) body = '<p class="notice">이 날은 예정된 날이 아니어서 기록하지 않아요.</p>';
  else if (p.kind === 'check') {
    body = `<button type="button" class="btn ${done ? 'btn-secondary' : 'btn-primary'}" data-act="recToggle" data-id="${id}" data-date="${date}">${done ? '미완료로 되돌리기' : '완료로 기록'}</button>`;
  } else {
    body = `<form id="numeric-form" data-id="${id}" data-date="${date}" class="stack" novalidate>
      <div class="field"><label for="num-input">기록값</label>
        <div class="input-unit"><input id="num-input" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${hasValue ? log.manualValue : ''}" aria-describedby="e-num"><span>${p.unit}</span></div>
        <p class="err" id="e-num" hidden></p>
        <p class="hint">목표 이상이면 완료로 표시돼요. 0도 기록할 수 있어요.</p></div>
      <button class="btn btn-primary" type="submit">저장</button>
      ${hasValue ? `<button type="button" class="btn btn-text danger" data-act="recClear" data-id="${id}" data-date="${date}">기록 지우기</button>` : ''}
    </form>`;
  }
  openSheet(`${sheetHead(h.name)}
    <p class="t-sub">${fmtLong(date)}${date === t ? ' · 오늘' : ''}</p>
    <dl class="kv">
      <div><dt>당시 목표</dt><dd>${targetText(p)}</dd></div>
      <div><dt>당시 반복</dt><dd>${repeatText(p.version.weekdays)}</dd></div>
      <div><dt>상태</dt><dd>${!p.scheduled ? '예정 아님' : done ? '완료' : '미완료'}${hasValue ? ` · ${amount(log.manualValue, p.unit)}` : ''}</dd></div>
    </dl>
    ${body}`, { label: `${h.name} 기록`, onOpen: () => ($('#num-input') || $('#sheet-root h2')).focus() });
}

function submitNumeric(form) {
  const id = form.dataset.id, date = form.dataset.date;
  const p = M.planFor(D(), id, date);
  const input = $('#num-input'), errEl = $('#e-num');
  const raw = input.value;
  const n = parseNum(raw);
  let err = null;
  if (!raw.trim()) err = '값을 입력해 주세요';
  else if (Number.isNaN(n)) err = '숫자로 입력해 주세요';
  else if (n < 0) err = '0 이상으로 입력해 주세요';
  else if (n > 1000000) err = '값이 너무 커요';
  else err = unitError(n, p.unit);
  if (err) {
    errEl.textContent = err; errEl.hidden = false;
    input.setAttribute('aria-invalid', 'true'); input.focus();
    return;
  }
  const before = M.isDone(p, M.getLog(D(), id, date));
  const res = save(d => M.setLog(d, id, date, { manualValue: n }, nowISO()));
  if (!res.ok) return; // 폼 보존
  closeSheet(true);
  render();
  const after = M.isDone(p, M.getLog(D(), id, date));
  if (after && !before) popRing(id, date);
  toast(after && !before ? '목표를 달성했어요' : '기록했어요', { action: '실행 취소', onAction: () => undoRecord(id, date, res.value) });
}

function openDatePicker() {
  const t = today();
  openSheet(`${sheetHead('날짜 선택')}
    <form id="date-form" class="stack" novalidate>
      <div class="field"><label for="date-input">기록을 볼 날짜</label><input type="date" id="date-input" max="${t}" value="${ui.homeDate}"></div>
      <p class="hint">지난 날짜는 읽고 고칠 수 있어요. 미래 날짜는 기록하지 않아요.</p>
      <button class="btn btn-primary" type="submit">이 날짜 보기</button>
      <button type="button" class="btn btn-secondary" data-act="dateToday">오늘로 돌아가기</button>
    </form>`, { label: '날짜 선택', onOpen: () => $('#date-input').focus() });
}

// ---------- 습관 목록 ----------

function statusBadge(st) {
  const { cur, latest } = st;
  if (!cur) return `${fmtShort(st.display.effectiveDate)} 시작`;
  const later = latest.effectiveDate > today();
  if (cur.status === 'active') {
    if (later && latest.status === 'paused') return `${fmtShort(latest.effectiveDate)}부터 일시중지`;
    if (later && latest.status === 'archived') return `${fmtShort(latest.effectiveDate)}부터 보관`;
    if (later) return '내일부터 변경';
    return '';
  }
  if (cur.status === 'paused') return later && latest.status === 'active' ? `${fmtShort(latest.effectiveDate)} 재개` : '일시중지';
  return later && latest.status === 'active' ? `${fmtShort(latest.effectiveDate)} 복원` : '보관';
}

function habitListRow(h, st) {
  const v = st.display;
  const b = statusBadge(st);
  return `<div class="hrow">
    <button type="button" class="row-body pad-l" data-act="openHabit" data-id="${h.id}">
      <span class="row-title">${esc(h.name)}${b ? ` <span class="badge">${esc(b)}</span>` : ''}</span>
      <span class="row-sub">${domainDot(v.domain)}${targetText(v)} · ${repeatText(v.weekdays)} · ${domainName(v.domain)}</span>
    </button>
    <button type="button" class="icon-btn" data-act="habitMore" data-id="${h.id}" aria-label="${esc(h.name)} 더보기">${icon('more')}</button>
  </div>`;
}

function renderHabitList() {
  const t = today();
  const q = ui.habitsQuery.trim().toLowerCase();
  const rows = D().habits.map(h => ({ h, st: M.habitState(D(), h.id, t) })).filter(({ h, st }) => {
    if (!q && st.category === 'archived') return false;
    if (ui.habitsScope !== 'all' && st.display.domain !== ui.habitsScope) return false;
    if (q && !(h.name.toLowerCase().includes(q) || (h.note || '').toLowerCase().includes(q))) return false;
    return true;
  });
  if (!rows.length) {
    return `<div class="card empty"><p>이 조건의 습관이 없어요</p><button type="button" class="btn btn-secondary" data-act="clearFilters">필터 해제</button></div>`;
  }
  return `<div class="habit-list">${rows.map(r => habitListRow(r.h, r.st)).join('')}</div>`;
}

function templateChips() {
  return `<div class="chip-wrap">${TEMPLATES.map(tp => `<button type="button" class="chip dom-${tp.domain}" data-act="template" data-key="${tp.key}">${esc(tp.name)}${tp.kind === 'numeric' ? ` ${amount(tp.target, tp.unit)}` : ''}</button>`).join('')}</div>`;
}

function renderHabits() {
  const t = today();
  const all = D().habits;
  const draft = drafts.get('habitForm');
  const archived = all.filter(h => M.habitState(D(), h.id, t).category === 'archived').length;
  const scopes = [['all', '전체'], ...DOMAINS.map(d => [d.id, d.name])];
  return `
    <header class="page-head row-between"><h1 class="t-large">습관</h1>
      <button type="button" class="icon-btn filled" data-act="newHabit" aria-label="새 습관 만들기">${icon('plus')}</button></header>
    ${draft ? `<div class="card notice-card"><p>작성 중이던 습관이 있어요${draft.values && draft.values.name ? ` · ‘${esc(draft.values.name)}’` : ''}</p>
      <div class="btn-pair"><button type="button" class="btn btn-secondary" data-act="draftDiscard">버리기</button><button type="button" class="btn btn-primary" data-act="draftResume">이어서 작성</button></div></div>` : ''}
    ${all.length ? `
      <div class="chip-row" role="group" aria-label="영역 필터">${scopes.map(([id, n]) => `<button type="button" class="chip${id !== 'all' ? ` dom-${id}` : ''}" data-act="scope" data-v="${id}" aria-pressed="${ui.habitsScope === id}">${ui.habitsScope === id ? icon('checkmark', false, 16) : ''}${n}</button>`).join('')}</div>
      <div class="search">${icon('search', false, 20)}<label class="sr-only" for="habit-search">습관 검색</label><input id="habit-search" type="search" placeholder="습관 검색" value="${esc(ui.habitsQuery)}" autocomplete="off" enterkeyhint="search"></div>
      <div id="habit-list">${renderHabitList()}</div>
      ${archived ? `<button type="button" class="link-row" data-act="openArchived"><span>보관함</span><span class="t-sub">${archived}개 ${icon('chevR', false, 16)}</span></button>` : ''}
    ` : `<div class="card empty">
        <h2 class="t-title">작게 시작해 볼까요</h2>
        <p class="t-sub">다섯 영역 중 하나에서 부담 없는 행동 하나를 골라 보세요.</p>
        <button type="button" class="btn btn-primary" data-act="newHabit">첫 습관 만들기</button>
        <p class="t-cap">템플릿으로 시작하기</p>${templateChips()}
      </div>`}`;
}

function renderArchived() {
  const t = today();
  const rows = D().habits.map(h => ({ h, st: M.habitState(D(), h.id, t) })).filter(r => r.st.category === 'archived');
  return `${backBar()}<header class="page-head"><h1 class="t-large">보관함</h1><p class="t-sub">보관한 습관은 홈 예정에서 빠지고 기록은 그대로 남아요.</p></header>
    ${rows.length ? `<div class="habit-list">${rows.map(r => habitListRow(r.h, r.st)).join('')}</div>` : '<div class="card empty"><p>보관한 습관이 없어요</p></div>'}`;
}

function openHabitMenu(id) {
  const h = M.habit(D(), id);
  if (!h) return;
  const cat = M.habitState(D(), id, today()).category;
  const items = [['editHabit', '편집']];
  if (cat === 'active') items.push(['pauseHabit', '일시중지'], ['archiveHabit', '보관']);
  if (cat === 'paused') items.push(['resumeHabit', '재개'], ['archiveHabit', '보관']);
  if (cat === 'archived') items.push(['restoreHabit', '복원']);
  items.push(['deleteHabit', '습관과 전체 기록 삭제', 'danger']);
  openSheet(`${sheetHead(h.name)}<div class="menu">${items.map(([a, l, dz]) => `<button type="button" class="menu-item${dz ? ` ${dz}` : ''}" data-act="${a}" data-id="${id}">${l}</button>`).join('')}</div>`, { label: `${h.name} 메뉴` });
}

function pauseOrArchive(id, status) {
  const h = M.habit(D(), id);
  if (!h) return;
  const word = status === 'paused' ? '일시중지' : '보관';
  dialog({
    title: `${josa(`‘${h.name}’`, '을', '를')} ${word}할까요?`,
    message: status === 'paused'
      ? '내일부터 예정에서 빠져요. 지금까지의 기록과 오늘 기록은 그대로 남아요.'
      : '내일부터 홈 예정에서 빠지고 보관함으로 옮겨져요. 기록은 그대로 남아요.',
    actions: [
      { label: word, style: 'btn-primary', run: () => {
        if (save(d => M.setStatus(d, id, addDays(today(), 1), status)).ok) { toast(`내일부터 ${word}돼요`); render(); }
      } },
      { label: '취소' },
    ],
  });
}

function openResumeSheet(id, kind) {
  const t = today();
  const word = kind === 'restore' ? '복원' : '재개';
  openSheet(`${sheetHead(`${word} 날짜`)}
    <p class="t-sub">고른 날짜부터 다시 예정에 들어가요.</p>
    <form id="resume-form" data-id="${id}" data-kind="${kind}" class="stack" novalidate>
      <div class="field"><label for="resume-date">시작 날짜</label><input type="date" id="resume-date" min="${t}" value="${t}"><p class="err" id="e-resume" hidden></p></div>
      <button class="btn btn-primary" type="submit">${word}하기</button>
    </form>`, { label: `${word} 날짜` });
}
function submitResume(form) {
  const t = today();
  const date = $('#resume-date').value;
  if (!date || date < t) {
    const e = $('#e-resume'); e.textContent = '시작 날짜를 확인해 주세요'; e.hidden = false; $('#resume-date').focus();
    return;
  }
  const id = form.dataset.id, word = form.dataset.kind === 'restore' ? '복원' : '재개';
  if (!save(d => M.setStatus(d, id, date, 'active')).ok) return;
  closeSheet(true);
  toast(date === t ? `오늘부터 ${word}했어요` : `${fmtShort(date)}부터 ${word}돼요`);
  render();
}

function deleteHabitFlow(id) {
  const h = M.habit(D(), id);
  if (!h) return;
  const n = Object.values(D().logs).filter(l => l.habitID === id && M.hasRecord(l)).length;
  dialog({
    title: '습관과 전체 기록 삭제',
    message: `${josa(`‘${h.name}’`, '과', '와')} 기록 ${n}개를 영구 삭제해요. 과거 통계도 함께 바뀌고 되돌릴 수 없어요.`,
    actions: [
      { label: `‘${h.name}’ 삭제`, style: 'btn-danger-solid', run: () => {
        if (!save(d => M.deleteHabit(d, id)).ok) return;
        for (const k in ui.stacks) ui.stacks[k] = ui.stacks[k].filter(v => v.id !== id);
        persistNav();
        toast('삭제했어요');
        render();
      } },
      { label: '취소' },
    ],
  });
}

// ---------- 습관 상세 ----------

function renderHabitDetail(id) {
  const h = M.habit(D(), id);
  if (!h) {
    return `${backBar()}<div class="card empty"><h1 class="t-title">찾을 수 없는 습관이에요</h1><p class="t-sub">삭제되었거나 복원 과정에서 바뀌었을 수 있어요.</p><button type="button" class="btn btn-primary" data-act="toHabitList">목록으로</button></div>`;
  }
  const t = today();
  const st = M.habitState(D(), id, t);
  const v = st.display;
  const pt = M.planFor(D(), id, t);
  const logT = M.getLog(D(), id, t);
  const doneT = M.isDone(pt, logT);
  const streak = S.streak(D(), id, t);

  let todayCard;
  if (pt && pt.scheduled) {
    const val = logT && typeof logT.manualValue === 'number' ? logT.manualValue : null;
    todayCard = `<div class="card">
      <p class="t-cap">오늘 기록</p>
      <p class="big-line">${doneT ? `${icon('check', true, 22)} 완료` : '미완료'}${pt.kind === 'numeric' ? ` · ${val == null ? '0' : fmtNum(val, pt.unit)} / ${amount(pt.target, pt.unit)}` : ''}</p>
      ${pt.kind === 'check'
        ? `<button type="button" class="btn ${doneT ? 'btn-secondary' : 'btn-primary'}" data-act="toggle" data-id="${id}" data-date="${t}">${doneT ? '미완료로 되돌리기' : '오늘 완료로 기록'}</button>`
        : `<button type="button" class="btn btn-primary" data-act="record" data-id="${id}" data-date="${t}">오늘 수치 기록</button>`}
    </div>`;
  } else if (st.notStarted) {
    todayCard = `<div class="card"><p>${fmtLong(v.effectiveDate)}에 시작해요.</p></div>`;
  } else if (st.cur.status === 'paused') {
    todayCard = `<div class="card"><p>일시중지 중이에요.</p><button type="button" class="btn btn-secondary" data-act="resumeHabit" data-id="${id}">재개</button></div>`;
  } else if (st.cur.status === 'archived') {
    todayCard = `<div class="card"><p>보관된 습관이에요. 기록은 그대로 남아 있어요.</p><button type="button" class="btn btn-secondary" data-act="restoreHabit" data-id="${id}">복원</button></div>`;
  } else {
    todayCard = '<div class="card"><p>오늘은 쉬는 날이에요.</p></div>';
  }

  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(t, -i);
    const p = M.planFor(D(), id, d);
    let state, label;
    if (!p || !p.scheduled) { state = 'off'; label = '예정 없음'; }
    else if (M.isDone(p, M.getLog(D(), id, d))) { state = 'done'; label = '완료'; }
    else if (d === t) { state = 'todo'; label = '아직 기록 전'; }
    else { state = 'miss'; label = '미완료'; }
    cells.push(`<button type="button" class="day-cell ${state}" data-act="record" data-id="${id}" data-date="${d}" aria-label="${fmtLong(d)}, ${label}" ${state === 'off' ? 'disabled' : ''}>
      <span class="dc-day">${DAY_NAMES[weekdayOf(d)]}</span>
      <span class="dc-mark">${state === 'done' ? icon('checkmark', false, 16) : state === 'off' ? '–' : ''}</span>
      <span class="dc-date">${Number(d.slice(8))}</span></button>`);
  }

  const pending = st.pending.map(pv => {
    const parts = [];
    if (pv.status !== 'active') parts.push(pv.status === 'paused' ? '일시중지' : '보관');
    else parts.push(`${targetText(pv)} · ${repeatText(pv.weekdays)} · ${domainName(pv.domain)}`);
    return `<li>${fmtShort(pv.effectiveDate)}부터: ${parts.join('')}</li>`;
  }).join('');

  return `${backBar()}
    <header class="page-head"><h1 class="t-large">${esc(h.name)}</h1>
      <p class="row-sub">${domainDot(v.domain)}${domainName(v.domain)} · ${repeatText(v.weekdays)} · ${targetText(v)} · ${v.kind === 'check' ? '체크' : '수치'} 기록</p></header>
    ${todayCard}
    <div class="card">
      <div class="row-between"><p class="t-cap">최근 7일</p><p class="t-cap">연속 달성 <strong>${streak}회</strong></p></div>
      <div class="week7">${cells.join('')}</div>
      <p class="hint">날짜를 누르면 그날의 기록을 고칠 수 있어요. 당시 목표로 판단해요.</p>
    </div>
    ${pending ? `<div class="card"><p class="t-cap">예약된 변경</p><ul class="plain">${pending}</ul></div>` : ''}
    ${h.note ? `<div class="card"><p class="t-cap">메모</p><p class="note-text">${esc(h.note)}</p></div>` : ''}
    <div class="btn-pair">
      <button type="button" class="btn btn-secondary" data-act="editHabit" data-id="${id}">편집</button>
      <button type="button" class="btn btn-secondary" data-act="habitMore" data-id="${id}" aria-label="${esc(h.name)} 더보기">더보기</button>
    </div>`;
}

// ---------- 습관 작성·편집 폼 ----------

let form = null;

function openHabitForm(opts) {
  const t = today();
  let values, original = null, mode = null;
  if (opts.mode === 'edit') {
    const h = M.habit(D(), opts.habitID);
    if (!h) { toast('찾을 수 없는 습관이에요'); return; }
    mode = M.editMode(D(), opts.habitID, t);
    const v = M.versionAt(D(), opts.habitID, mode.date) || M.versionsOf(D(), opts.habitID)[0];
    original = { name: h.name, domain: v.domain, kind: v.kind, target: String(v.target), unit: v.unit, weekdays: [...v.weekdays], startDate: v.effectiveDate, note: h.note || '' };
    values = { ...original, weekdays: [...original.weekdays] };
  } else {
    values = { name: '', domain: null, kind: 'check', target: '1', unit: '회', weekdays: [...ALL_DAYS], startDate: t, note: '' };
  }
  if (opts.preset) {
    const p = opts.preset;
    Object.assign(values, { ...p, target: p.target != null ? String(p.target) : values.target, weekdays: p.weekdays ? [...p.weekdays] : values.weekdays });
  }
  if (opts.values) values = opts.values;
  form = {
    mode: opts.mode, habitID: opts.habitID || null, proposalID: opts.proposalID || null,
    values, original, editMode: mode, errors: {}, saving: false,
    custom: values.weekdays.length !== 7,
    initial: JSON.stringify(values), fromDraft: !!opts.values,
  };
  const ok = openSheet(renderHabitForm(), {
    label: formTitle(),
    isDirty: () => form && (form.fromDraft || JSON.stringify(form.values) !== form.initial),
    onClose: () => { drafts.clear('habitForm'); form = null; },
    onOpen: () => (opts.mode === 'edit' ? $('#sheet-root h2') : $('#f-name')).focus(),
  });
  if (!ok) form = null;
}

function formTitle() {
  if (!form) return '';
  if (form.proposalID) return '제안 검토';
  return form.mode === 'edit' ? '습관 편집' : '새 습관';
}

function persistFormDraft() {
  if (!form) return;
  drafts.set('habitForm', { mode: form.mode, habitID: form.habitID, proposalID: form.proposalID, values: form.values, savedAt: nowISO() });
}

function readForm() {
  if (!form) return;
  const v = form.values;
  const g = id => document.getElementById(id);
  if (g('f-name')) v.name = g('f-name').value;
  if (g('f-target')) v.target = g('f-target').value;
  if (g('f-unit')) v.unit = g('f-unit').value;
  if (g('f-start')) v.startDate = g('f-start').value;
  if (g('f-note')) v.note = g('f-note').value;
}

const FIELD_LABELS = { name: '이름', domain: '영역', kind: '기록 방식', target: '목표', weekdays: '반복' };
function diffRows() {
  if (!form.original) return [];
  const o = form.original, v = form.values;
  const show = (k, x) => {
    if (k === 'domain') return domainName(x.domain);
    if (k === 'kind') return x.kind === 'check' ? '체크' : '수치';
    if (k === 'target') return x.kind === 'check' ? '하루 1회' : amount(parseNum(x.target), x.unit);
    if (k === 'weekdays') return repeatText(x.weekdays);
    return x[k];
  };
  return Object.keys(FIELD_LABELS).filter(k => show(k, o) !== show(k, v)).map(k => ({ label: FIELD_LABELS[k], from: show(k, o), to: show(k, v) }));
}

function renderHabitForm() {
  const v = form.values, e = form.errors;
  const t = today();
  const startEditable = form.mode === 'create' || (form.editMode && form.editMode.mode === 'inPlace');
  const err = k => (e[k] ? `<p class="err" id="e-${k}">${esc(e[k])}</p>` : '');
  const inv = k => (e[k] ? ' aria-invalid="true"' : '');
  const diffs = form.proposalID && form.mode === 'edit' ? diffRows() : [];
  return `<div class="sheet-head">
      <button type="button" class="btn-text" data-act="formCancel">취소</button>
      <h2 class="t-title" tabindex="-1">${formTitle()}</h2>
      <button type="button" class="btn-text strong" data-act="formSave" ${form.saving ? 'disabled' : ''}>저장</button></div>
    ${diffs.length ? `<div class="card soft"><p class="t-cap">제안된 변경 · 내일부터 적용</p><ul class="plain">${diffs.map(d => `<li>${d.label}: ${esc(d.from)} → <strong>${esc(d.to)}</strong></li>`).join('')}</ul></div>` : ''}
    <form id="habit-form" class="stack form" novalidate>
      <div class="field"><label for="f-name">이름</label>
        <input id="f-name" type="text" maxlength="40" autocomplete="off" value="${esc(v.name)}"${inv('name')} ${e.name ? 'aria-describedby="e-name"' : ''}>${err('name')}</div>
      <fieldset class="field"><legend class="label">영역</legend>
        <div class="chip-wrap">${DOMAINS.map(d => `<button type="button" class="chip dom-${d.id}" data-act="fDomain" data-v="${d.id}" aria-pressed="${v.domain === d.id}">${v.domain === d.id ? icon('checkmark', false, 16) : ''}${d.name}</button>`).join('')}</div>${err('domain')}</fieldset>
      <fieldset class="field"><legend class="label">기록 방식</legend>
        <div class="seg">
          <button type="button" data-act="fKind" data-v="check" aria-pressed="${v.kind === 'check'}">체크</button>
          <button type="button" data-act="fKind" data-v="numeric" aria-pressed="${v.kind === 'numeric'}">수치</button>
          <button type="button" disabled aria-disabled="true">Apple Health</button>
        </div>
        <p class="hint">Apple Health 연결은 웹 버전에서 지원하지 않아요. 걸음·수면은 수치로 직접 기록해 주세요.</p></fieldset>
      ${v.kind === 'numeric' ? `<div class="field"><label for="f-target">목표</label>
        <div class="row-2"><input id="f-target" type="text" inputmode="decimal" autocomplete="off" value="${esc(v.target)}"${inv('target')} ${e.target ? 'aria-describedby="e-target"' : ''}>
        <label class="sr-only" for="f-unit">단위</label><select id="f-unit">${UNITS.map(u => `<option ${u === v.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        ${err('target')}<p class="hint">목표 이상을 기록하면 완료예요.${v.unit === '시간' ? ' 시간은 0.25 단위로 입력해요.' : ''}</p></div>`
      : '<p class="hint">하루 1회 완료하면 달성이에요.</p>'}
      <fieldset class="field"><legend class="label">반복</legend>
        <div class="seg"><button type="button" data-act="fRepeat" data-v="daily" aria-pressed="${!form.custom}">매일</button><button type="button" data-act="fRepeat" data-v="custom" aria-pressed="${form.custom}">요일 선택</button></div>
        ${form.custom ? `<div class="days" role="group" aria-label="반복 요일">${ALL_DAYS.map(d => `<button type="button" class="day" data-act="fDay" data-v="${d}" aria-pressed="${v.weekdays.includes(d)}" aria-label="${DAY_NAMES[d]}요일">${DAY_NAMES[d]}</button>`).join('')}</div>` : ''}
        ${err('weekdays')}</fieldset>
      <div class="field"><label for="f-start">시작일</label>
        <input id="f-start" type="date" min="${t}" value="${esc(v.startDate)}" ${startEditable ? '' : 'disabled'}${inv('start')}>${err('start')}
        ${startEditable ? '' : '<p class="hint">이미 기록이 있는 습관은 시작일을 바꾸지 않아요.</p>'}</div>
      <div class="field"><label for="f-note">메모 <span class="t-cap">(선택)</span></label>
        <textarea id="f-note" rows="3" maxlength="500"${inv('note')}>${esc(v.note)}</textarea>
        <p class="hint"><span id="note-count">${v.note.length}</span>/500</p>${err('note')}</div>
      ${form.mode === 'edit' && form.editMode.mode === 'tomorrow' ? '<p class="notice">목표·요일·기록 방식·영역 변경은 내일부터 적용돼요. 이름·메모는 바로 바뀌어요.</p>' : ''}
      <button class="btn btn-primary" type="submit" ${form.saving ? 'disabled' : ''}>저장</button>
    </form>`;
}

function refreshForm(focusSel) {
  const sh = $('#sheet-root .sheet');
  if (!sh || !form) return;
  const top = sh.scrollTop;
  sh.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div>${renderHabitForm()}`;
  sh.scrollTop = top;
  if (focusSel) sh.querySelector(focusSel)?.focus();
}

function validateForm() {
  const v = form.values, e = {};
  const t = today();
  const name = v.name.trim();
  if (!name) e.name = '습관 이름을 입력해 주세요';
  else if (name.length > 40) e.name = '40자 이내로 입력해 주세요';
  if (!DOMAINS.some(d => d.id === v.domain)) e.domain = '영역을 선택해 주세요';
  if (v.kind === 'numeric') {
    const n = parseNum(v.target);
    if (!(n > 0) || n > 100000) e.target = '0보다 큰 목표를 입력해 주세요';
    else if (unitError(n, v.unit)) e.target = '선택 단위와 맞는 값을 입력해 주세요';
  }
  if (!v.weekdays.length) e.weekdays = '반복할 요일을 선택해 주세요';
  const startEditable = form.mode === 'create' || form.editMode.mode === 'inPlace';
  if (startEditable && (!v.startDate || v.startDate < t)) e.start = '시작 날짜를 확인해 주세요';
  if (v.note.length > 500) e.note = '500자 이내로 적어 주세요';
  return e;
}

function formSave() {
  if (!form || form.saving) return;
  readForm();
  form.errors = validateForm();
  const keys = Object.keys(form.errors);
  if (keys.length) {
    const first = { name: '#f-name', domain: '[data-act="fDomain"]', target: '#f-target', weekdays: '[data-act="fDay"]', start: '#f-start', note: '#f-note' }[keys[0]];
    refreshForm(first);
    return;
  }
  form.saving = true;
  refreshForm();
  const v = form.values;
  const clean = {
    name: v.name.trim(), domain: v.domain, kind: v.kind,
    target: v.kind === 'check' ? 1 : parseNum(v.target), unit: v.kind === 'check' ? '회' : v.unit,
    weekdays: ALL_DAYS.filter(d => v.weekdays.includes(d)), startDate: v.startDate, note: v.note.trim(),
    proposalID: form.mode === 'create' ? form.proposalID : null,
  };
  const { mode, habitID, proposalID, editMode } = form;
  let newID = habitID;
  const res = save(d => {
    if (mode === 'create') newID = M.createHabit(d, clean, nowISO());
    else M.updateHabit(d, habitID, clean, editMode);
    if (proposalID) M.markProposalApplied(d, proposalID, newID, nowISO());
  });
  if (!res.ok) {
    if (form) { form.saving = false; refreshForm(); }
    if (String(res.error && res.error.message).includes('already')) toast('이미 적용한 제안이에요');
    return;
  }
  closeSheet(true);
  if (mode === 'create') {
    toast('새 습관을 만들었어요');
    ui.tab = 'habits';
    ui.stacks.habits = [{ view: 'habit', id: newID }];
  } else {
    toast(editMode.mode === 'tomorrow' ? '저장했어요 · 변경은 내일부터 적용돼요' : '저장했어요');
  }
  persistNav();
  render();
  window.scrollTo(0, 0);
}

// ---------- 성장 ----------

function growthPeriod() {
  const t = today();
  const a = ui.growthAnchor && ui.growthAnchor <= t ? ui.growthAnchor : t;
  let start, end;
  if (ui.growthMode === 'week') { start = weekStartOf(a); end = addDays(start, 6); }
  else { start = monthStartOf(a); end = monthEndOf(a); }
  return { start, end, isCurrent: start <= t && t <= end, label: ui.growthMode === 'week' ? fmtRange(start, end) : fmtMonth(start) };
}

function chartHtml(ps) {
  const month = ui.growthMode === 'month';
  return `<div class="chart${month ? ' month' : ''}">${ps.days.map((d, i) => {
    const r = d.N ? d.C / d.N : null;
    const label = month ? ((i % 5 === 0 || i === ps.days.length - 1) ? String(Number(d.date.slice(8))) : '') : DAY_NAMES[weekdayOf(d.date)];
    const aria = d.future ? `${fmtLong(d.date)}, 아직 오지 않은 날` : d.N === 0 ? `${fmtLong(d.date)}, 예정 없음` : `${fmtLong(d.date)}, ${d.N}개 중 ${d.C}개 완료, ${S.rate(d.C, d.N)}%`;
    return `<button type="button" class="col${ui.growthSel === d.date ? ' sel' : ''}" data-act="gBar" data-date="${d.date}" aria-label="${aria}" ${d.future ? 'disabled' : ''}>
      <span class="val" aria-hidden="true">${!d.future && d.N === 0 ? '–' : ''}</span>
      <span class="track">${r != null ? `<span class="fill" style="height:${r > 0 ? Math.max(r * 100, 4) : 0}%"></span>` : ''}</span>
      <span class="lbl" aria-hidden="true">${label}</span></button>`;
  }).join('')}</div>`;
}

function tableHtml(ps) {
  return `<table class="tbl"><caption class="sr-only">날짜별 완료와 예정</caption>
    <thead><tr><th scope="col">날짜</th><th scope="col">완료/예정</th><th scope="col">달성률</th></tr></thead>
    <tbody>${ps.days.map(d => `<tr><th scope="row">${fmtShortDay(d.date)}</th><td>${d.future || !d.N ? '–' : `${d.C}/${d.N}`}</td><td>${d.future || !d.N ? '–' : `${S.rate(d.C, d.N)}%`}</td></tr>`).join('')}</tbody></table>`;
}

function renderGrowth() {
  const t = today();
  const per = growthPeriod();
  if (!D().habits.length) {
    return `<header class="page-head"><h1 class="t-large">성장</h1></header>
      <div class="card empty"><h2 class="t-title">기록이 쌓이면 흐름을 보여드릴게요</h2><button type="button" class="btn btn-primary" data-act="newHabit">습관 만들기</button></div>`;
  }
  const ps = S.periodStats(D(), per.start, per.end, t);
  const sel = ps.days.find(d => d.date === ui.growthSel);
  return `
    <header class="page-head"><h1 class="t-large">성장</h1></header>
    <div class="seg" role="group" aria-label="기간 단위">
      <button type="button" data-act="gMode" data-v="week" aria-pressed="${ui.growthMode === 'week'}">주</button>
      <button type="button" data-act="gMode" data-v="month" aria-pressed="${ui.growthMode === 'month'}">월</button></div>
    <div class="period-nav">
      <button type="button" class="icon-btn" data-act="gPrev" aria-label="이전 기간">${icon('chevL')}</button>
      <span class="t-title">${per.label}</span>
      <button type="button" class="icon-btn" data-act="gNext" aria-label="다음 기간" ${per.isCurrent ? 'disabled' : ''}>${icon('chevR')}</button></div>
    <div class="card summary">
      <span class="summary-line"><span class="summary-num">${ps.rate == null ? '–' : `${ps.rate}%`}</span><span class="t-sub">${ps.N ? `${ps.C} / ${ps.N}회` : '예정된 습관이 없어요'}</span></span>
      ${per.isCurrent ? '<p class="t-cap">오늘까지의 기록이에요. 예정이 없던 날은 계산에서 빠져요.</p>' : '<p class="t-cap">예정이 없던 날은 계산에서 빠져요.</p>'}
    </div>
    <div class="card">
      <div class="row-between"><h2 class="t-title">${ui.growthMode === 'week' ? '요일별 달성' : '날짜별 달성'}</h2>
        <button type="button" class="btn-text" data-act="gTable">${ui.growthTable ? '그래프로 보기' : '표로 보기'}</button></div>
      ${ui.growthTable ? tableHtml(ps) : chartHtml(ps)}
      ${!ui.growthTable ? (sel ? `<div class="sel-detail"><span>${fmtShortDay(sel.date)} · ${sel.N ? `${sel.C}/${sel.N} 완료 (${S.rate(sel.C, sel.N)}%)` : '예정 없음'}</span>${sel.N ? `<button type="button" class="btn-text" data-act="gDay" data-date="${sel.date}">날짜별 기록 ${icon('chevR', false, 16)}</button>` : ''}</div>` : '<p class="hint">막대를 누르면 그날의 완료/예정을 볼 수 있어요.</p>') : ''}
    </div>
    <div class="card">
      <h2 class="t-title">영역별</h2>
      <div class="dom-rows">${DOMAINS.map(d => {
        const x = ps.byDomain[d.id];
        const r = S.rate(x.C, x.N);
        return `<button type="button" class="dom-row" data-act="gDomain" data-v="${d.id}" aria-label="${d.name}, ${x.N ? `${x.N}개 중 ${x.C}개 완료, ${r}%` : '예정 없음'}">
          <span class="dom-name">${domainDot(d.id)}${d.name}</span><span class="bar"><i style="width:${r || 0}%"></i></span><span class="dom-val">${x.N ? `${x.C}/${x.N}` : '–'}</span></button>`;
      }).join('')}</div>
    </div>
    <div class="card">
      <h2 class="t-title">${ui.growthMode === 'week' ? '이 주' : '이 달'} 돌아보기</h2>
      <p class="t-sub">요약을 먼저 확인한 뒤 코치와 함께 돌아봐요.</p>
      <button type="button" class="btn btn-secondary" data-act="gReview">돌아보기 요약 보기</button>
    </div>`;
}

function renderDay(date) {
  const s = S.dayStats(D(), date);
  return `${backBar()}<header class="page-head"><h1 class="t-large">${fmtLong(date)}</h1>
      <p class="t-sub">${s.N ? `${s.C} / ${s.N} 완료` : '예정된 습관이 없었어요'}</p></header>
    ${s.N ? `<div class="habit-list">${s.items.map(it => habitRow(it, date)).join('')}</div>` : ''}`;
}

function renderDomain(view) {
  const t = today();
  const ps = S.periodStats(D(), view.start, view.end, t);
  const map = new Map();
  for (const d of ps.days) {
    for (const it of d.items) {
      if (it.plan.domain !== view.domain) continue;
      let r = map.get(it.habit.id);
      if (!r) map.set(it.habit.id, (r = { h: it.habit, N: 0, C: 0 }));
      r.N++; if (it.done) r.C++;
    }
  }
  const x = ps.byDomain[view.domain];
  const rows = [...map.values()];
  return `${backBar()}<header class="page-head"><p class="t-cap">${fmtRange(view.start, view.end < t ? view.end : t)}</p>
      <h1 class="t-large">${domainName(view.domain)} 영역</h1>
      <p class="t-sub">${x.N ? `${x.C} / ${x.N}회 · ${S.rate(x.C, x.N)}%` : '이 기간에 예정된 습관이 없어요'}</p></header>
    ${rows.length ? `<div class="habit-list">${rows.map(r => `<button type="button" class="hrow row-body pad-l" data-act="openHabit" data-id="${r.h.id}">
        <span class="row-title">${esc(r.h.name)}</span><span class="row-sub">${r.C} / ${r.N}회 완료</span></button>`).join('')}</div>` : ''}`;
}

function openReviewSheet() {
  const t = today();
  const per = growthPeriod();
  const end = per.end < t ? per.end : t;
  const ps = S.periodStats(D(), per.start, per.end, t);
  const rows = S.habitPeriodStats(D(), per.start, per.end, t);
  openSheet(`${sheetHead('돌아보기 요약')}
    <p class="t-sub">코치에게 가져갈 내용을 먼저 확인해요.</p>
    <dl class="kv"><div><dt>기간</dt><dd>${fmtRange(per.start, end)}</dd></div>
      <div><dt>전체</dt><dd>${ps.N ? `${ps.C} / ${ps.N}회 (${ps.rate}%)` : '예정 없음'}</dd></div></dl>
    <p class="t-cap">습관별 완료 / 예정</p>
    <ul class="plain">${rows.map(x => `<li>${esc(x.habit.name)} · ${x.C} / ${x.N}</li>`).join('') || '<li>기록 없음</li>'}</ul>
    <label class="check-row"><input type="checkbox" id="review-notes"> 습관 메모도 포함하기</label>
    <p class="hint">이 버전의 코치는 기기 안에서만 동작해서 이 요약을 외부로 보내지 않아요.</p>
    <button type="button" class="btn btn-primary" data-act="reviewSend" data-start="${per.start}" data-end="${end}">코치에게 가져가기</button>`, { label: '돌아보기 요약' });
}

// ---------- 코치 ----------

const currentConversation = () => D().conversations.find(c => c.id === D().profile.activeConversationID) || null;

function proposalCard(p) {
  const x = p.payload;
  const target = p.action === 'update' ? M.habit(D(), p.habitID) : null;
  if (p.action === 'update' && !target && !p.appliedHabitID) {
    return '<div class="proposal"><p class="t-sub">대상 습관을 찾을 수 없어 이 제안은 적용할 수 없어요.</p></div>';
  }
  const detail = `${domainName(x.domain)} · ${repeatText(x.weekdays)} · ${x.kind === 'check' ? '하루 1회' : amount(x.target, x.unit)}`;
  const applied = p.appliedHabitID && M.habit(D(), p.appliedHabitID);
  const button = p.appliedHabitID
    ? (applied ? `<button type="button" class="btn btn-secondary btn-sm" data-act="openHabit" data-id="${p.appliedHabitID}">${p.action === 'create' ? '추가됨' : '적용됨'} · 습관 보기</button>` : '<p class="t-cap">적용한 뒤 삭제된 습관이에요</p>')
    : `<button type="button" class="btn btn-primary btn-sm" data-act="reviewProposal" data-id="${p.id}">제안 검토</button>`;
  return `<div class="proposal dom-${x.domain}">
    <p class="t-cap">${p.action === 'create' ? '새 습관 제안' : '가볍게 바꾸기 제안'}</p>
    <p class="proposal-title">${esc(x.name)}</p>
    <p class="t-sub">${detail}</p>
    <p class="t-cap">${esc(p.rationale || '')}</p>
    ${button}</div>`;
}

function renderMsg(m) {
  if (m.role === 'user') return `<div class="bubble user"><span class="sr-only">나: </span>${esc(m.text)}</div>`;
  const props = D().proposals.filter(p => p.messageID === m.id);
  return `<div class="bubble coach"><span class="sr-only">코치: </span><div class="msg-text">${esc(m.text)}</div>${props.map(proposalCard).join('')}<div class="msg-meta">${fmtClock(m.createdAt, tz())} 생성</div></div>`;
}

function renderCoach() {
  const conv = currentConversation();
  const msgs = conv ? D().messages.filter(m => m.conversationID === conv.id) : [];
  const ctx = ui.coachContext;
  const draft = drafts.get('coach') || '';
  const ctxLabel = ctx && ctx.kind === 'review' ? `${fmtRange(ctx.start, ctx.end)} 요약 첨부됨` : '최근 7일 기록 요약 첨부됨';
  return `
    <header class="page-head row-between"><h1 class="t-large">AI 코치</h1>
      <button type="button" class="icon-btn" data-act="coachMenu" aria-label="대화 메뉴">${icon('more')}</button></header>
    <p class="pill">${icon('lock', false, 16)} 기기 내 코치 · 외부 전송 없음</p>
    <button type="button" class="chip ctx" data-act="coachContext">${icon('doc', false, 18)} ${ctxLabel}</button>
    <div class="msgs" id="msgs">${msgs.length ? msgs.map(renderMsg).join('') : '<div class="bubble coach"><div class="msg-text">안녕하세요. 지금 어떤 도움이 필요하세요? 기록을 함께 돌아보고, 다음에 해볼 작은 행동 하나를 골라 드릴게요.</div></div>'}</div>
    <div class="chip-row" role="group" aria-label="빠른 질문">${['오늘 돌아보기', '작게 시작하기', '이번 주 돌아보기'].map(p => `<button type="button" class="chip" data-act="coachPrompt" data-v="${p}">${p}</button>`).join('')}</div>
    <form id="composer-form" class="composer" novalidate>
      <label class="sr-only" for="composer">코치에게 보낼 메시지</label>
      <textarea id="composer" rows="2" maxlength="2000" placeholder="지금 어떤 도움이 필요하세요">${esc(draft)}</textarea>
      <div class="composer-foot"><span class="hint" id="composer-count">${draft.length}/2000</span>
        <button class="btn btn-primary btn-sm" type="submit" ${draft.trim() ? '' : 'disabled'}>보내기</button></div>
    </form>`;
}

let coachBusy = false;
function coachSend() {
  const ta = $('#composer');
  const text = (ta ? ta.value : '').trim();
  if (!text || text.length > 2000 || coachBusy) return;
  if (!D().consents.some(c => c.scope === 'localCoach' && !c.revokedAt)) {
    dialog({
      title: '코치 사용 전 안내',
      message: '이 버전은 AI 서버에 연결되어 있지 않아요. 코치 답변은 이 기기 안에서 기록을 바탕으로 만들어지고, 입력한 내용과 기록은 어디에도 전송되지 않아요. 대화는 이 기기에만 저장되고 설정에서 지울 수 있어요.',
      actions: [
        { label: '확인하고 보내기', style: 'btn-primary', run: () => {
          const r = save(d => d.consents.push({ scope: 'localCoach', policyVersion: 'local-1', providerID: 'on-device', allowedFields: ['habitSummary'], grantedAt: nowISO(), revokedAt: null }));
          if (r.ok) coachSend();
        } },
        { label: '지금은 사용 안 함' },
      ],
    });
    return;
  }
  coachBusy = true;
  const t = today();
  const at = nowISO();
  let reply;
  try { reply = coachReply(D(), text, t, ui.coachContext); } catch (e) {
    console.error(e); coachBusy = false; toast('답변을 만들지 못했어요. 다시 시도해 주세요'); return;
  }
  const res = save(d => {
    let conv = d.conversations.find(c => c.id === d.profile.activeConversationID);
    if (!conv) { conv = { id: uuid(), createdAt: at }; d.conversations.push(conv); d.profile.activeConversationID = conv.id; }
    const cm = { id: uuid(), conversationID: conv.id, role: 'coach', text: reply.text, state: 'completed', createdAt: at, safety: reply.safety, contextPeriod: reply.period };
    d.messages.push({ id: uuid(), conversationID: conv.id, role: 'user', text, state: 'completed', createdAt: at }, cm);
    for (const p of reply.proposals) {
      const prop = { id: uuid(), messageID: cm.id, ...p, appliedHabitID: null, appliedAt: null };
      if (validateProposal(d, prop)) d.proposals.push(prop); // 유효하지 않은 제안은 본문 텍스트로만 남긴다
    }
  });
  coachBusy = false;
  if (!res.ok) return; // 입력문 보존
  drafts.clear('coach');
  ui.coachContext = null;
  render();
  requestAnimationFrame(() => {
    const last = $('#msgs') && $('#msgs').lastElementChild;
    if (last) last.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}

function openContextSheet() {
  const t = today();
  const ctx = ui.coachContext;
  const start = ctx ? ctx.start : addDays(t, -6);
  const end = ctx ? ctx.end : t;
  const ps = S.periodStats(D(), start, end, t);
  const rows = S.habitPeriodStats(D(), start, end, t);
  openSheet(`${sheetHead('코치가 참고하는 내용')}
    <p class="t-sub">코치는 아래 요약만 보고 답해요. 이 버전에서는 기기 밖으로 나가지 않아요.</p>
    <dl class="kv"><div><dt>기간</dt><dd>${fmtRange(start, end)}</dd></div><div><dt>전체</dt><dd>${ps.N ? `${ps.C} / ${ps.N}회` : '예정 없음'}</dd></div></dl>
    <ul class="plain">${rows.map(x => `<li>${esc(x.habit.name)} · ${x.C} / ${x.N}</li>`).join('') || '<li>기록 없음</li>'}</ul>
    ${ctx && ctx.kind === 'review' ? '<button type="button" class="btn btn-secondary" data-act="ctxClear">기본(최근 7일)으로 되돌리기</button>' : ''}`, { label: '코치 참고 내용' });
}

function reviewProposal(pid) {
  const p = D().proposals.find(x => x.id === pid);
  if (!p) return;
  if (p.appliedHabitID) { toast('이미 적용한 제안이에요'); return; }
  const x = p.payload;
  const preset = { name: x.name, domain: x.domain, kind: x.kind, target: x.target, unit: x.unit, weekdays: x.weekdays };
  if (p.action === 'create') openHabitForm({ mode: 'create', preset, proposalID: p.id });
  else openHabitForm({ mode: 'edit', habitID: p.habitID, preset, proposalID: p.id });
}

// ---------- 설정 ----------

function renderSettings() {
  const p = D().profile;
  const devTz = deviceTimeZone();
  const consent = D().consents.find(c => c.scope === 'localCoach' && !c.revokedAt);
  const theme = [['system', '시스템'], ['light', '라이트'], ['dark', '다크']];
  return `
    <header class="page-head"><h1 class="t-large">설정</h1></header>
    <section class="group"><h2 class="group-title">나의 기본 설정</h2><div class="card list">
      <div class="field"><label for="nickname">호칭</label><input id="nickname" type="text" maxlength="20" placeholder="예: 민지" value="${esc(p.nickname)}" autocomplete="off"></div>
      <div class="kv-row"><span>기준 시간대</span><span>${esc(p.timezoneID)}</span></div>
      ${devTz !== p.timezoneID ? `<div class="notice">기기 시간대가 ${esc(devTz)}(으)로 바뀌었어요. <button type="button" class="btn-text" data-act="tzChange">기준 바꾸기</button></div>` : ''}
      <div class="kv-row"><span>주 시작</span><span>월요일</span></div></div></section>
    <section class="group"><h2 class="group-title">Apple Health</h2><div class="card">
      <div class="kv-row"><span>상태</span><span class="badge">지원 안 됨</span></div>
      <p class="hint">웹(PWA) 버전에서는 Apple Health 데이터를 읽을 수 없어요. 걸음·수면 습관은 수치로 직접 기록해 주세요.</p></div></section>
    <section class="group"><h2 class="group-title">AI와 개인정보</h2><div class="card list">
      <div class="kv-row"><span>AI 서버</span><span class="badge">연결 안 됨</span></div>
      <p class="hint">코치는 기기 안에서만 답해요. 습관·기록·대화는 어디에도 전송되지 않아요.</p>
      ${consent ? `<div class="kv-row"><span>코치 안내 확인</span><span>${fmtShort(keyOf(new Date(consent.grantedAt), tz()))}</span></div><button type="button" class="menu-item" data-act="revokeConsent">확인 철회</button>` : ''}</div></section>
    <section class="group"><h2 class="group-title">알림</h2><div class="card">
      <p class="hint">웹 버전에서는 습관 알림을 예약할 수 없어요. 매일 같은 시간에 앱을 여는 것부터 습관으로 만들어 보세요.</p></div></section>
    <section class="group"><h2 class="group-title">화면</h2>
      <div class="seg" role="group" aria-label="화면 모드">${theme.map(([v, l]) => `<button type="button" data-act="theme" data-v="${v}" aria-pressed="${p.theme === v}">${l}</button>`).join('')}</div></section>
    <section class="group"><h2 class="group-title">내 데이터</h2><div class="card list">
      <p class="hint">기록은 이 기기의 브라우저 저장소에만 있어요. 홈 화면 앱을 지우거나 Safari 방문 기록·웹사이트 데이터를 지우면 사라질 수 있으니 주기적으로 JSON으로 백업해 주세요.</p>
      <button type="button" class="menu-item" data-act="exportData">JSON 내보내기</button>
      <button type="button" class="menu-item" data-act="importData">JSON 복원</button>
      <input type="file" id="restore-file" accept="application/json,.json" hidden>
      <button type="button" class="menu-item" data-act="deleteConvos">대화 삭제</button>
      <button type="button" class="menu-item danger" data-act="resetAll">전체 초기화</button></div></section>
    <section class="group"><h2 class="group-title">앱 정보</h2><div class="card">
      <div class="kv-row"><span>버전</span><span>${APP_VERSION} (${BUILD})</span></div>
      <p class="hint">BETTER ME 웹(PWA) 버전 · 회원가입 없이 이 기기에만 저장돼요.</p></div></section>`;
}

function downloadOrShare(text, name) {
  const file = new File([text], name, { type: 'application/json' });
  const fallback = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'BETTER ME 백업' }).catch(e => { if (e.name !== 'AbortError') fallback(); });
  } else fallback();
}

function openExportSheet() {
  const d = D();
  const logs = Object.values(d.logs).filter(M.hasRecord).length;
  openSheet(`${sheetHead('JSON 내보내기')}
    <p class="t-sub">아래 항목이 파일에 들어가요.</p>
    <ul class="plain"><li>습관 ${d.habits.length}개와 변경 이력</li><li>직접 남긴 기록 ${logs}개</li><li>코치 대화 ${d.messages.length}개</li></ul>
    <p class="hint">파일을 공유하거나 저장하면, 그 뒤의 보호는 저장한 곳(파일 앱, 메일 등)의 보안에 따라 달라져요.</p>
    <button type="button" class="btn btn-primary" data-act="exportConfirm">내보내기</button>`, { label: 'JSON 내보내기' });
}
function doExport() {
  downloadOrShare(JSON.stringify(M.buildExport(D(), nowISO()), null, 2), `betterme-backup-${today()}.json`);
}

async function handleImport(input) {
  const f = input.files && input.files[0];
  input.value = '';
  if (!f) return;
  if (f.size > 20 * 1024 * 1024) { toast('20MB보다 큰 파일은 복원할 수 없어요'); return; }
  let obj;
  try { obj = JSON.parse(await f.text()); } catch { toast('JSON 파일을 읽지 못했어요. 기존 데이터는 그대로예요.'); return; }
  const r = M.validateImport(obj, D());
  if (!r.ok) { toast(`${r.error} 기존 데이터는 그대로예요.`); return; }
  dialog({
    title: '백업으로 바꿀까요?',
    message: `습관 ${r.counts.habits}개 · 기록 ${r.counts.logs}개 · 대화 ${r.counts.messages}개가 들어 있어요. 지금 이 기기의 데이터는 이 파일 내용으로 바뀌고 되돌릴 수 없어요. 동의 기록은 복원하지 않아요.`,
    actions: [
      { label: '바꾸기', style: 'btn-danger-solid', run: () => {
        try { store.replace(r.db); } catch { toast('복원하지 못했어요. 기존 데이터는 그대로예요.'); return; }
        ui.stacks = emptyStacks(); persistNav();
        toast('복원했어요');
        render();
      } },
      { label: '먼저 현재 데이터 내보내기', run: () => doExport() },
      { label: '취소' },
    ],
  });
}

// ---------- 액션 ----------

const A = {
  tab: el => { if (sheet) closeSheet(true); switchTab(el.dataset.tab); },
  back: () => pop(),
  toastAction: () => { const f = toastAction; $('#toast-root').innerHTML = ''; toastAction = null; if (f) f(); },
  closeSheet: () => closeSheet(),
  backdrop: () => closeSheet(),
  dlg: el => { const a = dialogActions && dialogActions[Number(el.dataset.i)]; closeDialog(); if (a && a.run) a.run(); },

  onbNext: () => { ui.onbStep++; render(); window.scrollTo(0, 0); },
  onbBack: () => { ui.onbStep = Math.max(0, ui.onbStep - 1); render(); },
  onbPick: el => { const k = el.dataset.key; if (ui.onbPicks.has(k)) ui.onbPicks.delete(k); else ui.onbPicks.add(k); render(); $(`[data-act="onbPick"][data-key="${k}"]`)?.focus(); },
  onbStart: () => onbStart(),
  loadErrExport: () => downloadOrShare(store.raw || '', `betterme-raw-${Date.now()}.json`),
  loadErrReset: () => dialog({ title: '초기화할까요?', message: '읽지 못한 원본 데이터가 지워져요. 먼저 원본을 파일로 저장해 두세요.', actions: [{ label: '초기화', style: 'btn-danger-solid', run: () => { store.reset(); render(); } }, { label: '취소' }] }),

  pickDate: () => openDatePicker(),
  dateToday: () => { ui.homeDate = today(); closeSheet(true); render(); },
  homeDomain: el => { ui.homeDomain = ui.homeDomain === el.dataset.v ? null : el.dataset.v; render(); },
  toggle: el => actToggle(el),
  record: el => openRecordSheet(el.dataset.id, el.dataset.date),
  recToggle: el => { closeSheet(true); actToggle(el); },
  recClear: el => {
    const { id, date } = el.dataset;
    const res = save(d => M.clearLog(d, id, date, nowISO()));
    if (!res.ok) return;
    closeSheet(true); render();
    toast('기록을 지웠어요', { action: '실행 취소', onAction: () => undoRecord(id, date, res.value) });
  },
  openHabit: el => { closeSheet(true); push({ view: 'habit', id: el.dataset.id }); },
  goHabits: () => switchTab('habits'),
  goCoach: () => switchTab('coach'),
  toHabitList: () => { ui.stacks[ui.tab] = []; if (ui.tab !== 'habits') switchTab('habits'); else { persistNav(); render(); } },

  newHabit: () => openHabitForm({ mode: 'create' }),
  template: el => { const tp = TEMPLATES.find(x => x.key === el.dataset.key); if (tp) openHabitForm({ mode: 'create', preset: { name: tp.name, domain: tp.domain, kind: tp.kind, target: tp.target, unit: tp.unit } }); },
  scope: el => { ui.habitsScope = el.dataset.v; persistNav(); render(); },
  clearFilters: () => { ui.habitsScope = 'all'; ui.habitsQuery = ''; persistNav(); render(); },
  openArchived: () => push({ view: 'archived' }),
  habitMore: el => openHabitMenu(el.dataset.id),
  editHabit: el => { closeSheet(true); openHabitForm({ mode: 'edit', habitID: el.dataset.id }); },
  pauseHabit: el => { closeSheet(true); pauseOrArchive(el.dataset.id, 'paused'); },
  archiveHabit: el => { closeSheet(true); pauseOrArchive(el.dataset.id, 'archived'); },
  resumeHabit: el => { closeSheet(true); openResumeSheet(el.dataset.id, 'resume'); },
  restoreHabit: el => { closeSheet(true); openResumeSheet(el.dataset.id, 'restore'); },
  deleteHabit: el => { closeSheet(true); deleteHabitFlow(el.dataset.id); },
  draftResume: () => {
    const dr = drafts.get('habitForm');
    if (!dr) return;
    if (dr.mode === 'edit' && !M.habit(D(), dr.habitID)) { drafts.clear('habitForm'); toast('찾을 수 없는 습관이라 초안을 지웠어요'); render(); return; }
    openHabitForm({ mode: dr.mode, habitID: dr.habitID, proposalID: dr.proposalID, values: dr.values });
  },
  draftDiscard: () => { drafts.clear('habitForm'); render(); },

  fDomain: el => { readForm(); form.values.domain = el.dataset.v; delete form.errors.domain; refreshForm(`[data-act="fDomain"][data-v="${el.dataset.v}"]`); persistFormDraft(); },
  fKind: el => {
    readForm();
    const k = el.dataset.v;
    if (form.values.kind !== k) {
      form.values.kind = k;
      if (k === 'check') { form.values.target = '1'; form.values.unit = '회'; } else { form.values.target = ''; form.values.unit = '분'; }
    }
    refreshForm(`[data-act="fKind"][data-v="${k}"]`); persistFormDraft();
  },
  fRepeat: el => {
    readForm();
    form.custom = el.dataset.v === 'custom';
    if (!form.custom) form.values.weekdays = [...ALL_DAYS];
    refreshForm(`[data-act="fRepeat"][data-v="${el.dataset.v}"]`); persistFormDraft();
  },
  fDay: el => {
    readForm();
    const d = Number(el.dataset.v);
    const w = form.values.weekdays;
    form.values.weekdays = w.includes(d) ? w.filter(x => x !== d) : [...w, d];
    refreshForm(`[data-act="fDay"][data-v="${d}"]`); persistFormDraft();
  },
  formCancel: () => closeSheet(),
  formSave: () => formSave(),

  gMode: el => { ui.growthMode = el.dataset.v; ui.growthSel = null; persistNav(); render(); },
  gPrev: () => { ui.growthAnchor = addDays(growthPeriod().start, -1); ui.growthSel = null; render(); },
  gNext: () => { const p = growthPeriod(); if (!p.isCurrent) { ui.growthAnchor = addDays(p.end, 1); ui.growthSel = null; render(); } },
  gTable: () => { ui.growthTable = !ui.growthTable; render(); },
  gBar: el => { ui.growthSel = ui.growthSel === el.dataset.date ? null : el.dataset.date; render(); $(`[data-act="gBar"][data-date="${el.dataset.date}"]`)?.focus(); },
  gDay: el => push({ view: 'day', date: el.dataset.date }),
  gDomain: el => { const p = growthPeriod(); push({ view: 'domain', domain: el.dataset.v, start: p.start, end: p.end }); },
  gReview: () => openReviewSheet(),
  reviewSend: el => {
    const { start, end } = el.dataset;
    ui.coachContext = { kind: 'review', start, end, includeNotes: !!($('#review-notes') && $('#review-notes').checked) };
    drafts.set('coach', `${fmtRange(start, end)}을 돌아보고 싶어요.`);
    closeSheet(true);
    switchTab('coach');
  },

  coachMenu: () => openSheet(`${sheetHead('대화')}<div class="menu">
      <button type="button" class="menu-item" data-act="coachNew">새 대화</button>
      <button type="button" class="menu-item danger" data-act="coachDelete">이 대화 삭제</button>
      <button type="button" class="menu-item" data-act="coachData">데이터 설정</button></div>`, { label: '대화 메뉴' }),
  coachNew: () => { closeSheet(true); if (save(d => { d.profile.activeConversationID = null; }).ok) render(); },
  coachDelete: () => {
    closeSheet(true);
    const conv = currentConversation();
    if (!conv) { toast('삭제할 대화가 없어요'); return; }
    dialog({ title: '이 대화를 삭제할까요?', message: '기기에 저장된 이 대화가 지워져요. 이미 만든 습관은 그대로예요.', actions: [
      { label: '삭제', style: 'btn-danger-solid', run: () => {
        const ok = save(d => {
          const ids = new Set(d.messages.filter(m => m.conversationID === conv.id).map(m => m.id));
          d.messages = d.messages.filter(m => !ids.has(m.id));
          d.proposals = d.proposals.filter(p => !ids.has(p.messageID));
          d.conversations = d.conversations.filter(c => c.id !== conv.id);
          d.profile.activeConversationID = null;
        }).ok;
        if (ok) { toast('대화를 삭제했어요'); render(); }
      } },
      { label: '취소' }] });
  },
  coachData: () => { closeSheet(true); switchTab('settings'); },
  coachPrompt: el => {
    const v = el.dataset.v;
    const text = v === '오늘 돌아보기' ? '오늘 하루를 돌아보고 싶어요.' : v === '작게 시작하기' ? '부담 없이 작게 시작할 수 있는 걸 알려 주세요.' : '이번 주를 돌아보고 싶어요.';
    if (v === '이번 주 돌아보기') { const t = today(); ui.coachContext = { kind: 'review', start: weekStartOf(t), end: t }; }
    drafts.set('coach', text);
    render();
    const ta = $('#composer');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  },
  coachContext: () => openContextSheet(),
  ctxClear: () => { ui.coachContext = null; closeSheet(true); render(); },
  reviewProposal: el => reviewProposal(el.dataset.id),

  theme: el => { if (save(d => { d.profile.theme = el.dataset.v; }).ok) render(); },
  tzChange: () => {
    const devTz = deviceTimeZone();
    dialog({ title: `기준 시간대를 ${devTz}(으)로 바꿀까요?`, message: '이미 남긴 기록의 날짜는 그대로 두고, 앞으로의 오늘 계산부터 새 시간대를 사용해요.', actions: [
      { label: '바꾸기', style: 'btn-primary', run: () => { if (save(d => { d.profile.timezoneID = devTz; }).ok) { ui.homeDate = null; render(); } } },
      { label: '그대로 두기' }] });
  },
  revokeConsent: () => dialog({ title: '코치 안내 확인을 철회할까요?', message: '다음에 코치에게 보낼 때 안내를 다시 보여드려요. 기존 대화는 그대로예요.', actions: [
    { label: '철회', style: 'btn-primary', run: () => { if (save(d => { for (const c of d.consents) if (c.scope === 'localCoach' && !c.revokedAt) c.revokedAt = nowISO(); }).ok) render(); } },
    { label: '취소' }] }),
  exportData: () => openExportSheet(),
  exportConfirm: () => { closeSheet(true); doExport(); },
  importData: () => $('#restore-file').click(),
  deleteConvos: () => dialog({ title: '대화를 모두 삭제할까요?', message: '기기에 저장된 코치 대화와 제안이 모두 지워져요. 이미 만든 습관은 그대로예요.', actions: [
    { label: '모두 삭제', style: 'btn-danger-solid', run: () => { if (save(d => { d.conversations = []; d.messages = []; d.proposals = []; d.profile.activeConversationID = null; }).ok) { drafts.clear('coach'); toast('대화를 삭제했어요'); render(); } } },
    { label: '취소' }] }),
  resetAll: () => dialog({ title: '전체 초기화', message: '이 기기에 저장된 습관·기록·대화·설정·초안이 모두 지워지고 처음 화면으로 돌아가요. 되돌릴 수 없어요.', actions: [
    { label: '모두 지우기', style: 'btn-danger-solid', run: () => {
      store.reset();
      Object.assign(ui, { tab: 'home', stacks: emptyStacks(), homeDate: null, homeDomain: null, habitsScope: 'all', habitsQuery: '', coachContext: null, onbStep: 0, onbPicks: null });
      render(); window.scrollTo(0, 0);
    } },
    { label: '취소' }] }),
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.dataset.act === 'backdrop' && e.target !== el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'numeric-form') submitNumeric(f);
  else if (f.id === 'date-form') {
    const t = today();
    let v = $('#date-input').value;
    if (!v || v > t) v = t;
    ui.homeDate = v;
    closeSheet(true);
    render();
  } else if (f.id === 'habit-form') formSave();
  else if (f.id === 'resume-form') submitResume(f);
  else if (f.id === 'composer-form') coachSend();
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'habit-search') {
    ui.habitsQuery = t.value;
    $('#habit-list').innerHTML = renderHabitList();
  } else if (t.id === 'composer') {
    drafts.set('coach', t.value);
    $('#composer-count').textContent = `${t.value.length}/2000`;
    $('#composer-form button[type="submit"]').disabled = !t.value.trim();
  } else if (form && t.closest('#habit-form')) {
    readForm();
    persistFormDraft();
    if (t.id === 'f-note') $('#note-count').textContent = t.value.length;
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'nickname') { if (save(d => { d.profile.nickname = t.value.trim().slice(0, 20); }).ok) toast('호칭을 저장했어요'); }
  else if (t.id === 'restore-file') handleImport(t);
  else if (form && t.closest('#habit-form')) {
    readForm(); persistFormDraft();
    if (t.id === 'f-unit') refreshForm('#f-unit');
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (dialogActions) { closeDialog(); return; }
  if (sheet) closeSheet();
});

// 자정·foreground 진입 시 오늘을 다시 계산
let lastToday = null;
function tick() {
  if (!store.db || store.loadError || !D().profile.onboardingCompleted) return;
  const t = today();
  if (lastToday && t !== lastToday) {
    if (ui.homeDate === lastToday) ui.homeDate = t;
    if (!form) render();
  }
  lastToday = t;
}

function start() {
  store.load();
  restoreNav();
  render();
  lastToday = store.loadError ? null : today();
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

start();
