// BETTER ME — 습관·버전·기록 도메인 규칙 (순수 함수, db를 직접 받는다)
import { addDays, weekdayOf, uuid, isDateKey, DOMAIN_IDS, KINDS, STATUSES, UNITS } from './store.js';

const byDate = (a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0);
const PLAN_FIELDS = ['domain', 'kind', 'target', 'unit', 'weekdays'];

export function habit(db, id) { return db.habits.find(h => h.id === id) || null; }
export function versionsOf(db, habitID) { return db.versions.filter(v => v.habitID === habitID).sort(byDate); }

export function buildIndex(db) {
  const m = new Map();
  for (const v of db.versions) {
    let l = m.get(v.habitID);
    if (!l) m.set(v.habitID, (l = []));
    l.push(v);
  }
  for (const l of m.values()) l.sort(byDate);
  return m;
}

// 해당 날짜에 유효한 HabitVersion (DayPlan 스냅샷의 원천)
export function versionAt(db, habitID, date, idx) {
  const list = idx ? idx.get(habitID) || [] : versionsOf(db, habitID);
  let r = null;
  for (const v of list) {
    if (v.effectiveDate <= date) r = v;
    else break;
  }
  return r;
}

export function planFor(db, habitID, date, idx) {
  const v = versionAt(db, habitID, date, idx);
  if (!v) return null;
  return {
    version: v, kind: v.kind, target: v.target, unit: v.unit, domain: v.domain, status: v.status,
    scheduled: v.status === 'active' && v.weekdays.includes(weekdayOf(date)),
  };
}

export const logKey = (habitID, date) => `${habitID}|${date}`;
export function getLog(db, habitID, date) { return db.logs[logKey(habitID, date)] || null; }

export function isDone(plan, log) {
  if (!plan || !log) return false;
  if (plan.kind === 'check') return log.checked === true;
  return typeof log.manualValue === 'number' && log.manualValue >= plan.target;
}

// 진행률은 0~1로 clamp. 원래 수치와 초과 달성은 화면에서 그대로 표시
export function progressOf(plan, log) {
  if (!plan) return 0;
  if (plan.kind === 'check') return isDone(plan, log) ? 1 : 0;
  const v = log && typeof log.manualValue === 'number' ? log.manualValue : 0;
  return Math.max(0, Math.min(1, v / plan.target));
}

export function hasRecord(log) { return !!log && (log.checked === true || typeof log.manualValue === 'number'); }

// ---------- 습관 ----------

export function createHabit(db, v, at) {
  if (v.proposalID && db.habits.some(h => h.proposalID === v.proposalID)) throw new Error('proposal already applied');
  const id = uuid();
  db.habits.push({ id, name: v.name, note: v.note || '', createdAt: at, proposalID: v.proposalID || null });
  db.versions.push({
    id: uuid(), habitID: id, effectiveDate: v.startDate, domain: v.domain, kind: v.kind,
    target: v.target, unit: v.unit, weekdays: [...v.weekdays], reminderTime: null, status: 'active',
  });
  return id;
}

// 아직 시작 전이고 기록이 없는 습관만 즉시 수정, 그 외 목표·요일·방식 변경은 다음 날부터
export function editMode(db, habitID, today) {
  const list = versionsOf(db, habitID);
  const logged = Object.values(db.logs).some(l => l.habitID === habitID);
  if (list.length === 1 && list[0].effectiveDate >= today && !logged) return { mode: 'inPlace', date: list[0].effectiveDate };
  return { mode: 'tomorrow', date: addDays(today, 1) };
}

export function planFieldsChanged(v, fields) {
  return PLAN_FIELDS.some(k => JSON.stringify(v[k]) !== JSON.stringify(fields[k]));
}

const clonePatch = p => ({ ...p, ...(p.weekdays ? { weekdays: [...p.weekdays] } : {}) });

// date부터 적용되는 새 버전을 만든다(같은 날짜 버전은 하나만). 과거 버전은 절대 수정하지 않는다
export function applyVersionChange(db, habitID, date, patch) {
  const list = versionsOf(db, habitID);
  if (!list.length) throw new Error('version missing');
  let base = null;
  for (const v of list) if (v.effectiveDate <= date) base = v;
  base = base || list[0];
  const statusChange = 'status' in patch;
  for (const v of list) {
    if (v.effectiveDate <= date) continue;
    // 상태 변경은 이후 예약을 대체하고, 내용 변경은 이후 예약에도 반영한다
    if (statusChange) db.versions.splice(db.versions.indexOf(v), 1);
    else Object.assign(v, clonePatch(patch));
  }
  const same = list.find(v => v.effectiveDate === date && db.versions.includes(v));
  if (same) Object.assign(same, clonePatch(patch));
  else db.versions.push({ ...base, weekdays: [...base.weekdays], ...clonePatch(patch), id: uuid(), effectiveDate: date });
}

export function updateHabit(db, habitID, v, mode) {
  const h = habit(db, habitID);
  if (!h) throw new Error('habit missing');
  h.name = v.name;
  h.note = v.note || '';
  const fields = { domain: v.domain, kind: v.kind, target: v.target, unit: v.unit, weekdays: [...v.weekdays] };
  if (mode.mode === 'inPlace') {
    const ver = db.versions.find(x => x.habitID === habitID);
    Object.assign(ver, fields, { effectiveDate: v.startDate });
    return;
  }
  const cur = versionAt(db, habitID, mode.date) || versionsOf(db, habitID)[0];
  if (planFieldsChanged(cur, fields)) applyVersionChange(db, habitID, mode.date, fields);
}

export function setStatus(db, habitID, date, status) { applyVersionChange(db, habitID, date, { status }); }

// 영구 삭제: 버전·기록을 함께 제거한다
export function deleteHabit(db, habitID) {
  db.habits = db.habits.filter(h => h.id !== habitID);
  db.versions = db.versions.filter(v => v.habitID !== habitID);
  for (const k of Object.keys(db.logs)) if (db.logs[k].habitID === habitID) delete db.logs[k];
}

export function habitState(db, habitID, today) {
  const list = versionsOf(db, habitID);
  const latest = list[list.length - 1];
  const cur = versionAt(db, habitID, today);
  return {
    cur, latest, display: cur || list[0],
    category: latest ? latest.status : 'active',
    pending: list.filter(v => v.effectiveDate > today),
    notStarted: !cur,
  };
}

// ---------- 기록 ----------

export function setLog(db, habitID, date, fields, at) {
  const k = logKey(habitID, date);
  const prev = db.logs[k] || null;
  const revision = (prev ? prev.revision : 0) + 1;
  db.logs[k] = {
    habitID, localDate: date, checked: null, manualValue: null, manualOverride: false,
    ...(prev || {}), ...fields, revision, updatedAt: at,
  };
  return { prev: prev ? { ...prev } : null, revision };
}

export function clearLog(db, habitID, date, at) {
  return setLog(db, habitID, date, { checked: null, manualValue: null }, at);
}

// 실행 취소는 직전 revision이 그대로일 때만 적용. 새 수정이 있으면 덮어쓰지 않는다
export function undoLog(db, habitID, date, prev, revision, at) {
  const k = logKey(habitID, date);
  const cur = db.logs[k];
  if (!cur || cur.revision !== revision) return false;
  db.logs[k] = prev
    ? { ...prev, revision: revision + 1, updatedAt: at }
    : { ...cur, checked: null, manualValue: null, revision: revision + 1, updatedAt: at };
  return true;
}

// ---------- 제안 ----------

export function markProposalApplied(db, proposalID, habitID, at) {
  const p = db.proposals.find(x => x.id === proposalID);
  if (!p) throw new Error('proposal missing');
  if (p.appliedHabitID) throw new Error('proposal already applied');
  p.appliedHabitID = habitID;
  p.appliedAt = at;
}

// ---------- 내보내기 / 복원 (JSON v1) ----------

export function buildExport(db, at) {
  return {
    schemaVersion: 1,
    exportedAt: at,
    timezoneID: db.profile.timezoneID,
    app: 'BETTER ME',
    profile: { nickname: db.profile.nickname, timezoneID: db.profile.timezoneID, theme: db.profile.theme },
    habits: db.habits,
    habitVersions: db.versions,
    habitLogs: Object.values(db.logs),
    conversations: db.conversations,
    messages: db.messages,
    proposals: db.proposals,
  };
}

export function validateImport(obj, current) {
  const fail = error => ({ ok: false, error });
  if (!obj || typeof obj !== 'object') return fail('JSON 형식이 아니에요.');
  if (obj.schemaVersion !== 1) return fail('지원하지 않는 백업 버전이에요.');
  const arr = k => (Array.isArray(obj[k]) ? obj[k] : null);
  const habits = arr('habits'), versions = arr('habitVersions'), logs = arr('habitLogs');
  if (!habits || !versions || !logs) return fail('필수 항목이 빠져 있어요.');
  const ids = new Set();
  for (const h of habits) {
    if (!h || typeof h.id !== 'string' || typeof h.name !== 'string' || !h.name.trim()) return fail('습관 항목이 올바르지 않아요.');
    ids.add(h.id);
  }
  for (const v of versions) {
    const ok = v && ids.has(v.habitID) && isDateKey(v.effectiveDate) && DOMAIN_IDS.includes(v.domain)
      && KINDS.includes(v.kind) && UNITS.includes(v.unit) && typeof v.target === 'number' && v.target > 0
      && Array.isArray(v.weekdays) && v.weekdays.length > 0 && v.weekdays.every(d => Number.isInteger(d) && d >= 0 && d <= 6)
      && STATUSES.includes(v.status);
    if (!ok) return fail('습관 변경 이력이 올바르지 않아요.');
  }
  for (const h of habits) if (!versions.some(v => v.habitID === h.id)) return fail('변경 이력이 없는 습관이 있어요.');
  const logMap = {};
  for (const l of logs) {
    if (!l || !ids.has(l.habitID) || !isDateKey(l.localDate)) return fail('기록 항목이 올바르지 않아요.');
    logMap[logKey(l.habitID, l.localDate)] = { ...l, revision: Number(l.revision) || 1 };
  }
  const conversations = arr('conversations') || [];
  const messages = arr('messages') || [];
  const proposals = arr('proposals') || [];
  const nickname = obj.profile && typeof obj.profile.nickname === 'string' ? obj.profile.nickname : current.profile.nickname;
  const db = {
    schemaVersion: 1,
    profile: { ...current.profile, nickname, onboardingCompleted: true, activeConversationID: null },
    habits, versions, logs: logMap, conversations, messages, proposals,
    consents: [], // 동의는 복원하지 않는다
  };
  return { ok: true, db, counts: { habits: habits.length, logs: logs.filter(hasRecord).length, messages: messages.length } };
}
