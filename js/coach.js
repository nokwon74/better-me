// BETTER ME — 기기 내 코치. AI 서버가 없는 빌드에서 규칙 기반으로 답하고, 외부로 아무것도 보내지 않는다
import { addDays, DOMAINS, DOMAIN_IDS, KINDS, UNITS, ALL_DAYS, fmtRange, josa } from './store.js';
import * as M from './model.js';
import * as S from './stats.js';

const RISK = /(죽고\s*싶|자살|자해|사라지고\s*싶|살기\s*싫|극단적\s*선택|목숨을|해치고\s*싶)/;
const MEDICAL = /(약을|약 |처방|진단|치료|단식|굶)/;

const SMALL = {
  body: { name: '스트레칭 3분', kind: 'check', target: 1, unit: '회' },
  mind: { name: '심호흡 1분', kind: 'check', target: 1, unit: '회' },
  heart: { name: '감사 한 줄', kind: 'check', target: 1, unit: '회' },
  knowledge: { name: '독서', kind: 'numeric', target: 5, unit: '분' },
  life: { name: '물건 하나 제자리', kind: 'check', target: 1, unit: '회' },
};

const SAFETY_TEXT = '지금 많이 힘드신 것 같아요. 이야기해 주셔서 고마워요. 지금은 습관보다 당신의 안전이 먼저예요. '
  + '가까운 사람에게 지금 마음을 알려 주시고, 위급하다고 느껴지면 지역의 긴급 지원 서비스나 가까운 의료기관에 바로 도움을 요청해 주세요. '
  + '혼자 견디지 않아도 돼요.';

const fmtAmount = (n, unit) => `${n.toLocaleString('ko-KR')}${unit}`;

function shrinkTarget(target, unit) {
  let n;
  if (unit === '시간') n = Math.floor((target / 2) * 4) / 4;
  else if (unit === '걸음') n = Math.round(target / 2 / 100) * 100;
  else n = Math.floor(target / 2);
  return n > 0 && n < target ? n : null;
}

function shrinkProposal(db, weak, today) {
  const v = M.versionAt(db, weak.habit.id, today);
  if (!v || v.status !== 'active') return null;
  let target = v.target, weekdays = [...v.weekdays], rationale = null;
  if (v.kind === 'numeric') {
    const n = shrinkTarget(v.target, v.unit);
    if (n) { target = n; rationale = `목표를 ${fmtAmount(n, v.unit)}(으)로 줄이면 다시 시작하기 쉬워요. 내일부터 적용돼요.`; }
  }
  if (!rationale) {
    if (weekdays.length <= 3) return null;
    weekdays = [1, 3, 5];
    rationale = '매일 대신 월·수·금으로 줄이면 부담이 덜해요. 내일부터 적용돼요.';
  }
  return {
    action: 'update', habitID: weak.habit.id,
    payload: { name: weak.habit.name, domain: v.domain, kind: v.kind, target, unit: v.unit, weekdays },
    rationale,
  };
}

function createProposal(domain) {
  return {
    action: 'create', habitID: null,
    payload: { ...SMALL[domain], domain, weekdays: [...ALL_DAYS] },
    rationale: '아주 작게 시작해야 오래 가요. 하루에 한 번이면 충분해요.',
  };
}

function detectIntent(text, ctx) {
  if (ctx && ctx.kind === 'review') return 'review';
  if (/오늘/.test(text) && /돌아보|어땠|정리/.test(text)) return 'today';
  if (/돌아보|회고|어땠|정리해/.test(text)) return 'review';
  return 'small';
}

export function coachReply(db, text, today, ctx) {
  if (RISK.test(text)) return { safety: true, text: SAFETY_TEXT, proposals: [], period: null };

  const start = ctx && ctx.kind === 'review' ? ctx.start : addDays(today, -6);
  const end = ctx && ctx.kind === 'review' ? ctx.end : today;
  const shownEnd = end < today ? end : today;
  const ps = S.periodStats(db, start, end, today);
  const per = S.habitPeriodStats(db, start, end, today);
  const intent = detectIntent(text, ctx);
  const out = [];
  let proposal = null;

  const active = db.habits.filter(h => {
    const v = M.versionAt(db, h.id, today);
    return v && v.status === 'active';
  });

  if (!active.length) {
    out.push('지금 진행 중인 습관이 없네요.');
    out.push('부담 없이 끝낼 수 있는 행동 하나로 다시 시작해 볼까요?');
    out.push('하루 5분 독서라면 오늘 바로 해볼 수 있어요.');
    proposal = createProposal('knowledge');
  } else {
    if (intent === 'today') {
      const ds = S.dayStats(db, today);
      if (ds.N === 0) out.push('오늘은 예정된 습관이 없어요. 쉬어 가는 날도 흐름의 일부예요.');
      else if (ds.C === ds.N) out.push(`오늘 예정된 ${ds.N}개를 모두 마쳤어요. 스스로와 한 약속을 지킨 하루예요.`);
      else {
        const done = ds.items.filter(i => i.done).map(i => `‘${i.habit.name}’`);
        out.push(done.length ? `오늘 ${done.slice(0, 2).join(', ')}을(를) 해냈어요.` : '오늘은 아직 시작 전이에요.');
        out.push(`남은 ${ds.N - ds.C}개 중 가장 가벼운 것 하나만 골라도 충분해요.`);
      }
    } else if (ps.N > 0) {
      out.push(`${fmtRange(start, shownEnd)} 동안 예정된 ${ps.N}번 중 ${ps.C}번을 해냈어요(${ps.rate}%).`);
    } else {
      out.push('이 기간에는 예정된 습관이 없었어요.');
    }
    // 데이터가 부족하면 추세를 단정하지 않는다
    if (ps.N < 5) out.push('아직 기록이 많지 않아서 흐름을 단정하기는 일러요.');

    const scored = per.filter(x => x.N > 0);
    const best = [...scored].sort((a, b) => b.C / b.N - a.C / a.N)[0];
    if (best && best.C > 0 && intent !== 'today') out.push(`특히 ${josa(`‘${best.habit.name}’`, '을', '를')} 꾸준히 이어 갔어요.`);

    // ‘작게 시작하기’ 요청이면 하루치 기록으로도 줄일 후보를 찾는다
    const minN = intent === 'small' ? 1 : 2;
    const weakList = scored.filter(x => x.N >= minN && x.C / x.N < 0.6).sort((a, b) => a.C / a.N - b.C / b.N);
    for (const weak of weakList) {
      proposal = shrinkProposal(db, weak, today);
      if (proposal) {
        out.push(`${josa(`‘${weak.habit.name}’`, '은', '는')} 조금 버거웠을 수 있어요. 놓친 날이 있어도 오늘 작게 다시 시작하면 돼요.`);
        break;
      }
    }
    if (!proposal) {
      const covered = new Set(active.map(h => M.versionAt(db, h.id, today).domain));
      const missing = DOMAINS.find(d => !covered.has(d.id));
      if (missing) {
        out.push(`${missing.name} 영역에 아주 작은 습관 하나를 더해 보면 어떨까요?`);
        proposal = createProposal(missing.id);
      } else if (ps.rate != null && ps.rate >= 60) {
        out.push('지금 리듬이 좋아요. 새로운 걸 더하기보다 지금 습관을 이어 가 볼까요?');
      } else {
        out.push('오늘 남은 습관 중 가장 가벼운 것 하나만 골라 시작해 보세요.');
      }
    }
  }

  if (MEDICAL.test(text)) out.push('진단이나 약, 치료에 관한 결정은 꼭 의료 전문가와 상의해 주세요.');
  const fillers = ['오늘은 한 가지만 해도 충분해요.', '작은 행동이 쌓이면 흐름이 돼요.'];
  while (out.length < 3 && fillers.length) out.push(fillers.shift());

  return { safety: false, text: out.slice(0, 6).join(' '), proposals: proposal ? [proposal] : [], period: { start, end: shownEnd } };
}

// 모델(여기서는 규칙)이 만든 제안도 클라이언트가 스키마·범위·대상 ID를 검증한다
export function validateProposal(db, p) {
  if (!p || !['create', 'update'].includes(p.action)) return false;
  const x = p.payload;
  if (!x || typeof x.name !== 'string' || !x.name.trim() || x.name.trim().length > 40) return false;
  if (!DOMAIN_IDS.includes(x.domain) || !KINDS.includes(x.kind) || !UNITS.includes(x.unit)) return false;
  if (typeof x.target !== 'number' || !(x.target > 0) || x.target > 100000) return false;
  if (!Array.isArray(x.weekdays) || !x.weekdays.length || !x.weekdays.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) return false;
  if (p.action === 'update' && !M.habit(db, p.habitID)) return false;
  return true;
}
