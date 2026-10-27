// BETTER ME — 계산·저장 규칙 테스트 (명세 AC 고정 예시). tests.html에서 실행
import { addDays, weekStartOf, monthEndOf, keyOf, josa, ALL_DAYS } from './store.js';
import * as M from './model.js';
import * as S from './stats.js';
import { coachReply, validateProposal } from './coach.js';

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, msg: e.message }); }
}
function eq(actual, expected, label = '') {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label} expected ${b}, got ${a}`);
}
const AT = '2026-10-27T03:00:00.000Z';
function db0() {
  return { schemaVersion: 1, profile: { timezoneID: 'Asia/Seoul', nickname: '', theme: 'system', onboardingCompleted: true }, habits: [], versions: [], logs: {}, conversations: [], messages: [], proposals: [], consents: [] };
}
const mk = (db, name, extra = {}) => M.createHabit(db, { name, domain: 'mind', kind: 'check', target: 1, unit: '회', weekdays: [...ALL_DAYS], startDate: '2026-10-01', note: '', ...extra }, AT);

// 날짜
test('주 시작은 월요일, 2026-10-27은 화요일', () => {
  eq(weekStartOf('2026-10-27'), '2026-10-26');
  eq(weekStartOf('2026-10-26'), '2026-10-26');
  eq(weekStartOf('2026-11-01'), '2026-10-26');
});
test('날짜 산술은 DST와 무관 (미국 DST 전환일)', () => {
  eq(addDays('2026-03-07', 1), '2026-03-08');
  eq(addDays('2026-03-08', 1), '2026-03-09');
  eq(addDays('2026-11-01', 1), '2026-11-02');
  eq(monthEndOf('2028-02-10'), '2028-02-29');
});
test('기준 시간대로 날짜 키 계산', () => {
  const d = new Date('2026-10-27T16:30:00Z');
  eq(keyOf(d, 'Asia/Seoul'), '2026-10-28');
  eq(keyOf(d, 'America/New_York'), '2026-10-27');
});

// AC04
test('AC04 월 2/2, 화 4/8, 수 예정 없음 → 60%, 수요일 대시', () => {
  const db = db0();
  for (let i = 0; i < 2; i++) mk(db, `월${i}`, { weekdays: [1] });
  for (let i = 0; i < 8; i++) mk(db, `화${i}`, { weekdays: [2] });
  const mon = db.habits.filter(h => h.name.startsWith('월'));
  const tue = db.habits.filter(h => h.name.startsWith('화'));
  for (const h of mon) M.setLog(db, h.id, '2026-10-19', { checked: true }, AT);
  for (const h of tue.slice(0, 4)) M.setLog(db, h.id, '2026-10-20', { checked: true }, AT);
  const ps = S.periodStats(db, '2026-10-19', '2026-10-21', '2026-10-21');
  eq([ps.C, ps.N, ps.rate], [6, 10, 60]);
  eq(S.rate(ps.days[2].C, ps.days[2].N), null, '수요일');
  if (ps.rate === 75) throw new Error('일별 평균 사용');
});

test('현재 주는 오늘까지만 분모에 포함', () => {
  const db = db0();
  mk(db, '명상');
  const ps = S.periodStats(db, '2026-10-26', '2026-11-01', '2026-10-27');
  eq(ps.N, 2);
  eq(ps.days.filter(d => d.future).length, 5);
});

// AC03
test('AC03 목표 10분에 8분 기록 → 내일부터 5분: 과거 미완료 유지', () => {
  const db = db0();
  const id = mk(db, '독서', { kind: 'numeric', target: 10, unit: '분', domain: 'knowledge' });
  M.setLog(db, id, '2026-10-26', { manualValue: 8 }, AT);
  const mode = M.editMode(db, id, '2026-10-27');
  eq(mode, { mode: 'tomorrow', date: '2026-10-28' });
  M.updateHabit(db, id, { name: '독서', note: '', domain: 'knowledge', kind: 'numeric', target: 5, unit: '분', weekdays: [...ALL_DAYS] }, mode);
  eq(M.isDone(M.planFor(db, id, '2026-10-26'), M.getLog(db, id, '2026-10-26')), false, '어제');
  eq(M.planFor(db, id, '2026-10-27').target, 10, '오늘');
  eq(M.planFor(db, id, '2026-10-28').target, 5, '내일');
});

test('기록 없는 미래 시작 습관은 즉시 수정', () => {
  const db = db0();
  const id = mk(db, '명상', { startDate: '2026-10-30' });
  eq(M.editMode(db, id, '2026-10-27').mode, 'inPlace');
});

test('수치 목표 이상이면 완료, 0은 유효한 기록, 진행률은 0~1', () => {
  const db = db0();
  const id = mk(db, '걷기', { kind: 'numeric', target: 6000, unit: '걸음', domain: 'body' });
  const p = M.planFor(db, id, '2026-10-27');
  M.setLog(db, id, '2026-10-27', { manualValue: 0 }, AT);
  eq(M.hasRecord(M.getLog(db, id, '2026-10-27')), true);
  eq(M.isDone(p, M.getLog(db, id, '2026-10-27')), false);
  M.setLog(db, id, '2026-10-27', { manualValue: 8000 }, AT);
  eq(M.isDone(p, M.getLog(db, id, '2026-10-27')), true);
  eq(M.progressOf(p, M.getLog(db, id, '2026-10-27')), 1);
});

// 연속 달성
test('주 3회 월·수·금 습관은 화요일 미기록으로 끊기지 않음', () => {
  const db = db0();
  const id = mk(db, '운동', { weekdays: [1, 3, 5], startDate: '2026-10-19' });
  for (const d of ['2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26']) M.setLog(db, id, d, { checked: true }, AT);
  eq(S.streak(db, id, '2026-10-27'), 4);
});
test('오늘 미완료는 연속 달성을 끊지 않음', () => {
  const db = db0();
  const id = mk(db, '명상', { startDate: '2026-10-25' });
  M.setLog(db, id, '2026-10-25', { checked: true }, AT);
  M.setLog(db, id, '2026-10-26', { checked: true }, AT);
  eq(S.streak(db, id, '2026-10-27'), 2);
});

// AC02
test('AC02 실행 취소는 직전 revision일 때만, 새 수정은 덮어쓰지 않음', () => {
  const db = db0();
  const id = mk(db, '명상');
  const r1 = M.setLog(db, id, '2026-10-27', { checked: true }, AT);
  eq(Object.keys(db.logs).length, 1);
  const r2 = M.setLog(db, id, '2026-10-27', { checked: false }, AT);
  eq(M.undoLog(db, id, '2026-10-27', r1.prev, r1.revision, AT), false, '오래된 실행 취소');
  eq(M.getLog(db, id, '2026-10-27').checked, false);
  eq(M.undoLog(db, id, '2026-10-27', r2.prev, r2.revision, AT), true);
  eq(M.getLog(db, id, '2026-10-27').checked, true);
  eq(Object.keys(db.logs).length, 1, '날짜별 기록 1개');
});

// 일시중지·보관
test('오늘 완료한 뒤 보관해도 오늘 분모는 유지, 내일부터 제외', () => {
  const db = db0();
  const id = mk(db, '정리', { domain: 'life' });
  M.setLog(db, id, '2026-10-27', { checked: true }, AT);
  M.setStatus(db, id, '2026-10-28', 'archived');
  eq([S.dayStats(db, '2026-10-27').N, S.dayStats(db, '2026-10-27').C], [1, 1]);
  eq(S.dayStats(db, '2026-10-28').N, 0);
  eq(M.habitState(db, id, '2026-10-27').category, 'archived');
});
test('내일 일시중지 예약 후 오늘 재개하면 예약이 사라짐', () => {
  const db = db0();
  const id = mk(db, '명상');
  M.setStatus(db, id, '2026-10-28', 'paused');
  M.setStatus(db, id, '2026-10-27', 'active');
  eq(M.planFor(db, id, '2026-10-29').scheduled, true);
  eq(M.versionsOf(db, id).filter(v => v.effectiveDate > '2026-10-27').length, 0);
});
test('같은 날짜 버전은 하나만', () => {
  const db = db0();
  const id = mk(db, '독서', { kind: 'numeric', target: 10, unit: '분' });
  M.setLog(db, id, '2026-10-26', { manualValue: 3 }, AT);
  const mode = M.editMode(db, id, '2026-10-27');
  const base = { name: '독서', note: '', domain: 'mind', kind: 'numeric', unit: '분', weekdays: [...ALL_DAYS] };
  M.updateHabit(db, id, { ...base, target: 5 }, mode);
  M.updateHabit(db, id, { ...base, target: 7 }, mode);
  const dates = M.versionsOf(db, id).map(v => v.effectiveDate);
  eq(new Set(dates).size, dates.length);
  eq(M.planFor(db, id, '2026-10-28').target, 7);
});
test('영구 삭제는 버전·기록을 함께 제거', () => {
  const db = db0();
  const id = mk(db, '명상');
  M.setLog(db, id, '2026-10-27', { checked: true }, AT);
  M.deleteHabit(db, id);
  eq([db.habits.length, db.versions.length, Object.keys(db.logs).length], [0, 0, 0]);
});

// 제안
test('AC10 같은 제안 두 번 적용 차단', () => {
  const db = db0();
  db.proposals.push({ id: 'p1', messageID: 'm1', action: 'create', payload: {}, appliedHabitID: null });
  const id = M.createHabit(db, { name: '독서', domain: 'knowledge', kind: 'numeric', target: 5, unit: '분', weekdays: [...ALL_DAYS], startDate: '2026-10-27', proposalID: 'p1' }, AT);
  M.markProposalApplied(db, 'p1', id, AT);
  let threw = 0;
  try { M.markProposalApplied(db, 'p1', id, AT); } catch { threw++; }
  try { M.createHabit(db, { name: '독서', domain: 'knowledge', kind: 'numeric', target: 5, unit: '분', weekdays: [...ALL_DAYS], startDate: '2026-10-27', proposalID: 'p1' }, AT); } catch { threw++; }
  eq(threw, 2);
  eq(db.habits.length, 1, '습관 1개');
});

// 코치
test('위험 신호에는 습관 독려 대신 도움 안내, 제안 없음', () => {
  const r = coachReply(db0(), '요즘 죽고 싶어요', '2026-10-27', null);
  eq([r.safety, r.proposals.length], [true, 0]);
  if (/\d{3}/.test(r.text)) throw new Error('번호를 생성함');
});
test('버거운 수치 습관에는 목표 절반 변경 제안 (유효성 통과)', () => {
  const db = db0();
  const id = mk(db, '독서', { kind: 'numeric', target: 10, unit: '분', domain: 'knowledge', startDate: '2026-10-20' });
  M.setLog(db, id, '2026-10-21', { manualValue: 10 }, AT);
  const r = coachReply(db, '작게 시작하고 싶어요', '2026-10-27', null);
  eq(r.proposals.length, 1);
  const p = r.proposals[0];
  eq([p.action, p.habitID, p.payload.target], ['update', id, 5]);
  eq(validateProposal(db, p), true);
  const n = r.text.split(/(?<=[.?!])\s/).length;
  if (n < 3 || n > 6) throw new Error(`문장 수 ${n}`);
});
test('잘못된 제안은 검증 실패', () => {
  const db = db0();
  eq(validateProposal(db, { action: 'create', payload: { name: 'x', domain: 'nope', kind: 'check', target: 1, unit: '회', weekdays: [1] } }), false);
  eq(validateProposal(db, { action: 'update', habitID: 'missing', payload: { name: 'x', domain: 'mind', kind: 'check', target: 1, unit: '회', weekdays: [1] } }), false);
  eq(validateProposal(db, { action: 'create', payload: { name: 'x', domain: 'mind', kind: 'check', target: 0, unit: '회', weekdays: [1] } }), false);
});

// 내보내기·복원
test('AC12 JSON 왕복과 잘못된 파일 거부', () => {
  const db = db0();
  const id = mk(db, '명상');
  M.setLog(db, id, '2026-10-27', { checked: true }, AT);
  const exp = JSON.parse(JSON.stringify(M.buildExport(db, AT)));
  const r = M.validateImport(exp, db0());
  eq([r.ok, r.counts.habits, r.counts.logs], [true, 1, 1]);
  eq(r.db.consents, [], '동의는 복원하지 않음');
  eq(M.validateImport({ schemaVersion: 2 }, db0()).ok, false);
  eq(M.validateImport({ ...exp, habitVersions: [{ ...exp.habitVersions[0], domain: 'x' }] }, db0()).ok, false);
  eq(M.validateImport({ ...exp, habitLogs: [{ habitID: 'ghost', localDate: '2026-10-27' }] }, db0()).ok, false);
});

test('조사 선택은 따옴표를 건너뜀', () => {
  eq(josa('‘독서’', '을', '를'), '‘독서’를');
  eq(josa('‘명상’', '을', '를'), '‘명상’을');
});

export function run() { return results; }
