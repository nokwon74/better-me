// BETTER ME — 집계 서비스. 홈·성장·코치가 같은 계산을 공유한다
import { addDays, DOMAINS } from './store.js';
import { buildIndex, planFor, getLog, isDone } from './model.js';

// 분모 0이면 null(화면에서는 대시)
export const rate = (C, N) => (N > 0 ? Math.round((100 * C) / N) : null);

const emptyDomains = () => Object.fromEntries(DOMAINS.map(d => [d.id, { N: 0, C: 0 }]));

export function dayStats(db, date, idx = buildIndex(db)) {
  const items = [];
  const byDomain = emptyDomains();
  let N = 0, C = 0;
  for (const h of db.habits) {
    const plan = planFor(db, h.id, date, idx);
    if (!plan || !plan.scheduled) continue;
    const log = getLog(db, h.id, date);
    const done = isDone(plan, log);
    items.push({ habit: h, plan, log, done });
    N++; byDomain[plan.domain].N++;
    if (done) { C++; byDomain[plan.domain].C++; }
  }
  return { date, N, C, items, byDomain };
}

// 기간 달성률 = 100 × ΣC / ΣN (일별 백분율의 단순 평균 금지). 오늘 이후는 분모에서 제외
export function periodStats(db, start, end, today) {
  const idx = buildIndex(db);
  const days = [];
  const byDomain = emptyDomains();
  let N = 0, C = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (d > today) { days.push({ date: d, future: true, N: 0, C: 0, items: [] }); continue; }
    const s = dayStats(db, d, idx);
    days.push({ date: d, future: false, N: s.N, C: s.C, items: s.items });
    N += s.N; C += s.C;
    for (const k in byDomain) { byDomain[k].N += s.byDomain[k].N; byDomain[k].C += s.byDomain[k].C; }
  }
  return { start, end, days, N, C, rate: rate(C, N), byDomain };
}

export function habitPeriodStats(db, start, end, today) {
  const idx = buildIndex(db);
  const map = new Map();
  for (let d = start; d <= end && d <= today; d = addDays(d, 1)) {
    for (const h of db.habits) {
      const p = planFor(db, h.id, d, idx);
      if (!p || !p.scheduled) continue;
      let r = map.get(h.id);
      if (!r) map.set(h.id, (r = { habit: h, N: 0, C: 0 }));
      r.N++;
      if (isDone(p, getLog(db, h.id, d))) r.C++;
    }
  }
  return [...map.values()];
}

// 예정 회차의 연속 완료 수. 쉬는 요일·일시중지는 끊지 않고, 오늘 미완료는 아직 기회로 본다
export function streak(db, habitID, today) {
  const idx = buildIndex(db);
  const list = idx.get(habitID);
  if (!list || !list.length) return 0;
  const first = list[0].effectiveDate;
  let d = today;
  const p0 = planFor(db, habitID, today, idx);
  if (p0 && p0.scheduled && !isDone(p0, getLog(db, habitID, today))) d = addDays(today, -1);
  let count = 0, guard = 0;
  while (d >= first && guard++ < 3700) {
    const p = planFor(db, habitID, d, idx);
    if (p && p.scheduled) {
      if (isDone(p, getLog(db, habitID, d))) count++;
      else break;
    }
    d = addDays(d, -1);
  }
  return count;
}
