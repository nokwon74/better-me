// SF Symbols에 대응하는 단순 SVG 아이콘 (선택 시 채움)
const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const fillOr = f => (f ? 'fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"' : S);

const P = {
  house: f => (f
    ? '<path d="M12 3.2 2.6 11.1h2.9v9.2h5.1v-5.8h2.8v5.8h5.1v-9.2h2.9z" fill="currentColor"/>'
    : `<path d="M3.5 10.8 12 3.6l8.5 7.2M5.8 9.2v10.9h4.6v-5.7h3.2v5.7h4.6V9.2" ${S}/>`),
  check: f => (f
    ? '<circle cx="12" cy="12" r="9.6" fill="currentColor"/><path d="m7.6 12.3 3 3 5.9-6.3" fill="none" stroke="var(--surface)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
    : `<circle cx="12" cy="12" r="9" ${S}/><path d="m7.6 12.3 3 3 5.9-6.3" ${S}/>`),
  chart: f => `<rect x="3.6" y="12.5" width="4" height="7.6" rx="1.2" ${fillOr(f)}/><rect x="10" y="7.5" width="4" height="12.6" rx="1.2" ${fillOr(f)}/><rect x="16.4" y="3.6" width="4" height="16.5" rx="1.2" ${fillOr(f)}/>`,
  bubble: f => `<path d="M3 5.6A2.6 2.6 0 0 1 5.6 3h7.8A2.6 2.6 0 0 1 16 5.6v4.8A2.6 2.6 0 0 1 13.4 13H8.2l-3.6 3v-3.2A2.6 2.6 0 0 1 3 10.4z" ${fillOr(f)}/><path d="M18.4 8.2A2.6 2.6 0 0 1 21 10.8v4.6a2.6 2.6 0 0 1-1.6 2.4V21l-3.4-2.8h-5.2a2.6 2.6 0 0 1-2.3-1.4" ${S}/>`,
  gear: f => `<circle cx="12" cy="12" r="7.3" fill="none" stroke="currentColor" stroke-width="3.2" stroke-dasharray="2.9 2.83"/><circle cx="12" cy="12" r="5.7" ${fillOr(f)}/><circle cx="12" cy="12" r="2.1" ${f ? 'fill="var(--surface)"' : S}/>`,
  checkmark: () => '<path d="m6.5 12.5 3.6 3.6 7.4-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: () => `<path d="M12 5v14M5 12h14" ${S} stroke-width="2.2"/>`,
  chevL: () => `<path d="M15 5l-7 7 7 7" ${S} stroke-width="2.2"/>`,
  chevR: () => `<path d="m9 5 7 7-7 7" ${S} stroke-width="2"/>`,
  more: () => '<circle cx="5.5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18.5" cy="12" r="1.8" fill="currentColor"/>',
  search: () => `<circle cx="10.5" cy="10.5" r="6.2" ${S}/><path d="m15.2 15.2 4.8 4.8" ${S}/>`,
  lock: () => `<rect x="5" y="10.5" width="14" height="10" rx="2.5" ${S}/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" ${S}/>`,
  doc: () => `<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" ${S}/><path d="M9 12h6M9 15.5h6" ${S}/>`,
  pencil: () => `<path d="M4 20h4L19 9l-4-4L4 16z" ${S}/>`,
};

export function icon(name, filled = false, size = 24) {
  const body = P[name] ? P[name](filled) : '';
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}
