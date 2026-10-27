// BETTER ME — 로컬 저장소, 날짜 유틸, 고정 상수
export const SCHEMA_VERSION = 1;
export const APP_VERSION = '0.3.0';
export const BUILD = 'web-1';

const DB_KEY = 'betterme.db.v1';
const DRAFT_KEY = 'betterme.drafts.v1';
const NAV_KEY = 'betterme.nav.v1';

// 영역 이름과 순서는 MVP에서 고정
export const DOMAINS = [
  { id: 'body', name: '바디', purpose: '움직임과 휴식', example: '6,000걸음 · 수면 7시간' },
  { id: 'mind', name: '정신', purpose: '집중과 마음의 여유', example: '명상 5분' },
  { id: 'heart', name: '하트', purpose: '감정과 관계', example: '감사 한 줄' },
  { id: 'knowledge', name: '지식', purpose: '학습과 이해', example: '독서 10분' },
  { id: 'life', name: '생활', purpose: '환경과 일상 정리', example: '책상 정리 5분' },
];
export const DOMAIN_IDS = DOMAINS.map(d => d.id);
export function domainName(id) {
  const d = DOMAINS.find(x => x.id === id);
  return d ? d.name : '';
}

export const UNITS = ['회', '분', '쪽', '잔', '걸음', '시간'];
export const KINDS = ['check', 'numeric'];
export const STATUSES = ['active', 'paused', 'archived'];
// JS getUTCDay 기준(0=일). 화면 표시는 월요일부터
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export const TEMPLATES = [
  { key: 'walk', name: '걷기', domain: 'body', kind: 'numeric', target: 6000, unit: '걸음', preset: true },
  { key: 'meditate', name: '명상 5분', domain: 'mind', kind: 'check', target: 1, unit: '회', preset: true },
  { key: 'gratitude', name: '감사 한 줄', domain: 'heart', kind: 'check', target: 1, unit: '회', preset: true },
  { key: 'read', name: '독서', domain: 'knowledge', kind: 'numeric', target: 10, unit: '분', preset: true },
  { key: 'tidy', name: '책상 정리 5분', domain: 'life', kind: 'check', target: 1, unit: '회', preset: true },
  { key: 'sleep', name: '수면', domain: 'body', kind: 'numeric', target: 7, unit: '시간', preset: false },
];

export function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

// 조사 선택: 끝의 따옴표·괄호는 건너뛰고 마지막 글자의 받침을 본다
export function josa(word, withFinal, withoutFinal) {
  let i = word.length - 1;
  while (i > 0 && /[’'"”)\]\s]/.test(word[i])) i--;
  const c = word.charCodeAt(i);
  if (c >= 0xac00 && c <= 0xd7a3) return word + ((c - 0xac00) % 28 ? withFinal : withoutFinal);
  return `${word}${withFinal}(${withoutFinal})`;
}

// ---- 시계: 테스트에서 주입 가능 ----
let clock = () => new Date();
export function setClock(fn) { clock = fn || (() => new Date()); }
export function now() { return clock(); }
export function nowISO() { return clock().toISOString(); }

export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

// 날짜 키(YYYY-MM-DD)는 기준 시간대로 계산하고, 이후 산술은 UTC 자정 기준으로 해 DST 영향을 받지 않게 한다
export function keyOf(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const g = t => parts.find(p => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function todayKey(tz) { return keyOf(clock(), tz); }
export function addDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekdayOf(key) { return new Date(key + 'T00:00:00Z').getUTCDay(); }
export function weekStartOf(key) { return addDays(key, -((weekdayOf(key) + 6) % 7)); }
export function monthStartOf(key) { return key.slice(0, 8) + '01'; }
export function monthEndOf(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export function isDateKey(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

function md(key) { const [, m, d] = key.split('-').map(Number); return [m, d]; }
export function fmtLong(key) { const [m, d] = md(key); return `${m}월 ${d}일 ${DAY_NAMES[weekdayOf(key)]}요일`; }
export function fmtShort(key) { const [m, d] = md(key); return `${m}월 ${d}일`; }
export function fmtShortDay(key) { const [m, d] = md(key); return `${m}/${d} (${DAY_NAMES[weekdayOf(key)]})`; }
export function fmtRange(a, b) {
  const [m1, d1] = md(a), [m2, d2] = md(b);
  if (a === b) return `${m1}월 ${d1}일`;
  return m1 === m2 ? `${m1}월 ${d1}일 – ${d2}일` : `${m1}월 ${d1}일 – ${m2}월 ${d2}일`;
}
export function fmtMonth(key) { const [y, m] = key.split('-').map(Number); return `${y}년 ${m}월`; }
export function fmtClock(iso, tz) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function emptyDB(tz) {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: {
      id: uuid(), nickname: '', timezoneID: tz, theme: 'system',
      onboardingCompleted: false, activeConversationID: null, createdAt: nowISO(),
    },
    habits: [], versions: [], logs: {},
    conversations: [], messages: [], proposals: [], consents: [],
  };
}

function migrate(data) {
  if (!data || typeof data !== 'object' || !data.profile) throw new Error('invalid');
  if (data.schemaVersion === SCHEMA_VERSION) return data;
  throw new Error('unsupported schema');
}

const clone = x => (typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x)));

export const store = {
  db: null,
  loadError: null,
  raw: null,
  load() {
    this.loadError = null;
    let raw = null;
    try { raw = localStorage.getItem(DB_KEY); } catch { this.loadError = 'storage'; this.db = emptyDB(deviceTimeZone()); return; }
    if (!raw) { this.db = emptyDB(deviceTimeZone()); return; }
    try { this.db = migrate(JSON.parse(raw)); } catch {
      // 원본을 덮어쓰지 않고 복구 안내를 보여준다
      this.loadError = 'parse'; this.raw = raw; this.db = emptyDB(deviceTimeZone());
    }
  },
  // 한 번의 setItem이 하나의 트랜잭션: 실패하면 메모리 상태도 그대로 둔다
  commit(mutator) {
    if (this.loadError) throw new Error('store is read-only');
    const next = clone(this.db);
    const result = mutator(next);
    localStorage.setItem(DB_KEY, JSON.stringify(next));
    this.db = next;
    return result;
  },
  replace(nextDb) {
    localStorage.setItem(DB_KEY, JSON.stringify(nextDb));
    this.db = nextDb;
  },
  reset() {
    for (const k of [DB_KEY, DRAFT_KEY, NAV_KEY]) { try { localStorage.removeItem(k); } catch { /* 무시 */ } }
    this.loadError = null; this.raw = null;
    this.db = emptyDB(deviceTimeZone());
  },
};

function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 초안 저장 실패는 무시 */ } }

// 작성 중인 습관 폼과 보내지 않은 코치 입력문
export const drafts = {
  get(name) { const all = readJSON(DRAFT_KEY) || {}; return all[name] ?? null; },
  set(name, v) { const all = readJSON(DRAFT_KEY) || {}; all[name] = v; writeJSON(DRAFT_KEY, all); },
  clear(name) { const all = readJSON(DRAFT_KEY) || {}; delete all[name]; writeJSON(DRAFT_KEY, all); },
};

export const navStore = {
  get() { return readJSON(NAV_KEY); },
  set(v) { writeJSON(NAV_KEY, v); },
};
