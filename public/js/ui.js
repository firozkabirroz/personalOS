// ============ DOM helpers ============
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ Icons (inline SVG, stroke style) ============
const I = (paths, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const icons = {
  dashboard: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  tasks: I('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),
  running: I('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  upcoming: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  plan: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>'),
  idea: I('<path d="M9 18h6M10 22h4M12 2a7 7 0 014 12.7c-.6.5-1 1.2-1 2V17H9v-.3c0-.8-.4-1.5-1-2A7 7 0 0112 2z"/>'),
  folder: I('<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>'),
  calendar: I('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  expense: I('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),
  habit: I('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
  health: I('<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>'),
  travel: I('<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
  ai: I('<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>'),
  settings: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/>'),
  plus: I('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  check: I('<polyline points="20 6 9 17 4 12"/>'),
  trash: I('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>'),
  edit: I('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  x: I('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  search: I('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  download: I('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  upload: I('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  sync: I('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>'),
  send: I('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>'),
  logout: I('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  chevL: I('<polyline points="15 18 9 12 15 6"/>'),
  chevR: I('<polyline points="9 18 15 12 9 6"/>'),
  link: I('<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>'),
  pin: I('<path d="M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16h14v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1z"/>'),
  file: I('<path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>'),
  key: I('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
  finance: I('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/><path d="M2 20h20"/>'),
  debt: I('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
  invest: I('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'),
  shield: I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  card: I('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
  ticket: I('<path d="M3 9a2 2 0 002-2h14a2 2 0 002 2v6a2 2 0 00-2 2H5a2 2 0 00-2-2z"/><path d="M13 5v14" stroke-dasharray="2 2"/>'),
  team: I('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
  zap: I('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  paperclip: I('<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>'),
  sparkles: I('<path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  bell: I('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>'),
  google: I('<circle cx="12" cy="12" r="10"/><path d="M12 8v4h4"/>'),
  book: I('<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>'),
};

export function icon(name) {
  const span = el('span', { style: { display: 'inline-flex' } });
  span.innerHTML = icons[name] || '';
  return span.firstChild;
}

// ============ Markdown (safe, minimal — for AI chat replies) ============
export function renderMarkdown(src) {
  const codeBlocks = [];
  let s = String(src ?? '');

  // pull out fenced code blocks first so nothing inside gets transformed
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    codeBlocks.push(`<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  s = esc(s);

  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/^#{1,3} (.*)$/gm, '<h3>$1</h3>');
  s = s.replace(/^#{4,6} (.*)$/gm, '<h4>$1</h4>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<i>$2</i>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');

  // group consecutive list lines
  s = s.replace(/((?:^[-*] .*(?:\n|$))+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
    return `<ul>${items}</ul>\n`;
  });
  s = s.replace(/((?:^\d+[.)] .*(?:\n|$))+)/gm, (block) => {
    const items = block.trim().split('\n').map(l => `<li>${l.replace(/^\d+[.)] /, '')}</li>`).join('');
    return `<ol>${items}</ol>\n`;
  });

  // paragraphs: blank line = new <p>, single newline = <br> (block tags excluded)
  const BLOCK = /^<(h3|h4|ul|ol|pre|blockquote)/;
  s = s.split(/\n{2,}/).map(chunk => {
    const t = chunk.trim();
    if (!t) return '';
    if (BLOCK.test(t) || t.startsWith('\u0000CODE')) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  s = s.replace(/\u0000CODE(\d+)\u0000/g, (m, i) => codeBlocks[Number(i)]);

  const div = el('div', { class: 'bubble md' });
  div.innerHTML = s;
  return div;
}

// ============ Count-up number animation ============
export function countUp(node, target, { duration = 650, prefix = '', suffix = '', decimals = 0 } = {}) {
  const val = Number(target) || 0;
  const start = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const cur = val * eased;
    node.textContent = prefix + cur.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return node;
}

// ============ Skeleton loaders ============
export function skeleton(w = '100%', h = '16px', style = {}) {
  return el('div', { class: 'sk', style: { width: w, height: h, ...style } });
}

export function skeletonPage() {
  return el('div', { class: 'sk-page' },
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      skeleton('220px', '24px'), skeleton('320px', '13px')),
    el('div', { class: 'sk-row' },
      skeleton('100%', '96px', { borderRadius: '14px' }),
      skeleton('100%', '96px', { borderRadius: '14px' }),
      skeleton('100%', '96px', { borderRadius: '14px' }),
      skeleton('100%', '96px', { borderRadius: '14px' })),
    el('div', { class: 'sk-row', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' } },
      skeleton('100%', '220px', { borderRadius: '14px' }),
      skeleton('100%', '220px', { borderRadius: '14px' })));
}

// ============ Empty state ============
export function emptyState({ icon: ic = 'sparkles', title, sub, action }) {
  const iconWrap = el('div', { class: 'empty-ic' });
  iconWrap.innerHTML = icons[ic] || icons.sparkles;
  return el('div', { class: 'empty' },
    iconWrap,
    title ? el('h4', {}, title) : null,
    sub ? el('p', {}, sub) : null,
    action || null);
}

// ============ Toast ============
export function toast(message, type = 'ok') {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: `toast ${type}` }, message);
  root.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 350); }, 3200);
}

// ============ Modal ============
export function modal({ title, body, footer, wide = false }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const close = () => { root.innerHTML = ''; };
  const closeBtn = el('button', { class: 'icon-btn', onclick: close });
  closeBtn.innerHTML = icons.x;
  const box = el('div', { class: `modal${wide ? ' wide' : ''}` },
    el('div', { class: 'modal-head' }, el('h3', {}, title), closeBtn),
    el('div', { class: 'modal-body' }, body),
    footer ? el('div', { class: 'modal-foot' }, footer) : null,
  );
  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, box);
  root.append(backdrop);
  return close;
}

export function confirmModal(message, onYes) {
  const close = modal({
    title: 'Are you sure?',
    body: el('p', { style: { color: 'var(--text-dim)' } }, message),
    footer: [
      el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
      el('button', { class: 'btn danger', onclick: () => { close(); onYes(); } }, 'Delete'),
    ],
  });
}

// Build a form modal from field definitions; returns values via onSubmit
export function formModal({ title, fields, values = {}, submitLabel = 'Save', wide = false, onSubmit }) {
  const inputs = {};
  const body = [];
  let row = null;
  for (const f of fields) {
    let input;
    const val = values[f.key] ?? f.default ?? '';
    if (f.type === 'select') {
      input = el('select', {}, f.options.map(o =>
        el('option', { value: o.value ?? o, selected: String(val) === String(o.value ?? o) }, o.label ?? o)));
    } else if (f.type === 'textarea') {
      input = el('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' });
      input.value = val;
    } else {
      input = el('input', { type: f.type || 'text', placeholder: f.placeholder || '', step: f.step, min: f.min, max: f.max });
      input.value = val;
    }
    inputs[f.key] = input;
    const fieldEl = el('div', { class: 'field' }, el('label', {}, f.label), input);
    if (f.half) {
      if (row) { row.append(fieldEl); body.push(row); row = null; }
      else row = el('div', { class: 'field-row' }, fieldEl);
    } else {
      if (row) { body.push(row); row = null; }
      body.push(fieldEl);
    }
  }
  if (row) body.push(row);

  const submit = async () => {
    const out = {};
    for (const [k, input] of Object.entries(inputs)) out[k] = input.value;
    try {
      await onSubmit(out);
      close();
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  const close = modal({
    title, wide,
    body,
    footer: [
      el('button', { class: 'btn ghost', onclick: () => close() }, 'Cancel'),
      el('button', { class: 'btn', onclick: submit }, submitLabel),
    ],
  });
  const first = Object.values(inputs)[0];
  if (first) setTimeout(() => first.focus(), 50);
}

// ============ Tiny SVG charts ============
export function barChart(items, { height = 140, color = 'var(--accent)', money = false } = {}) {
  // items: [{label, value}]
  if (!items.length) return el('div', { class: 'muted' }, 'No data yet');
  const max = Math.max(...items.map(i => i.value), 1);
  const w = 100 / items.length;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 100 ${height / 3}`);
  svg.classList.add('chart-svg');
  items.forEach((it, idx) => {
    const h = (it.value / max) * (height / 3 - 14);
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', idx * w + w * 0.18);
    r.setAttribute('y', height / 3 - 10 - h);
    r.setAttribute('width', w * 0.64);
    r.setAttribute('height', Math.max(h, 0.5));
    r.setAttribute('rx', 1.2);
    r.setAttribute('fill', it.color || color);
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = `${it.label}: ${money ? Number(it.value).toFixed(2) : it.value}`;
    r.append(t);
    svg.append(r);
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', idx * w + w / 2);
    lbl.setAttribute('y', height / 3 - 2);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', '3.2');
    lbl.setAttribute('fill', 'var(--text-faint)');
    lbl.textContent = it.label.length > 7 ? it.label.slice(0, 6) + '…' : it.label;
    svg.append(lbl);
  });
  return svg;
}

export function lineChart(points, { color = 'var(--accent)', height = 36 } = {}) {
  // points: [{label, value}] — nulls skipped
  const valid = points.filter(p => p.value !== null && p.value !== undefined);
  if (valid.length < 2) return el('div', { class: 'muted' }, 'Need at least 2 entries');
  const vals = valid.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 100 ${height}`);
  svg.classList.add('chart-svg');
  const step = 100 / (points.length - 1 || 1);
  let d = '', started = false;
  points.forEach((p, i) => {
    if (p.value === null || p.value === undefined) return;
    const x = i * step;
    const y = height - 4 - ((p.value - min) / range) * (height - 10);
    d += started ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    started = true;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 1.1); c.setAttribute('fill', color);
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = `${p.label}: ${p.value}`;
    c.append(t);
    svg.append(c);
  });
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '0.9');
  svg.prepend(path);
  return svg;
}

export function donut(items, { size = 120 } = {}) {
  // items: [{label, value, color}]
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return el('div', { class: 'muted' }, 'No data yet');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 42 42');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  let offset = 25;
  for (const it of items) {
    const pct = (it.value / total) * 100;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', 21); c.setAttribute('cy', 21); c.setAttribute('r', 15.915);
    c.setAttribute('fill', 'transparent');
    c.setAttribute('stroke', it.color);
    c.setAttribute('stroke-width', '5.5');
    c.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
    c.setAttribute('stroke-dashoffset', offset);
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = `${it.label}: ${it.value.toFixed ? it.value.toFixed(2) : it.value}`;
    c.append(t);
    svg.append(c);
    offset -= pct;
  }
  return svg;
}

// ============ Date helpers ============
// Always use LOCAL date parts — toISOString() is UTC and shifts the date
// for timezones ahead of UTC during the first hours of the day
export function dstr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayStr = () => dstr(new Date());
export function monthKeyOf(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}
export function daysUntil(s) {
  if (!s) return null;
  return Math.round((new Date(s + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400e3);
}
export function fmtMoney(n, cur = '') {
  return (cur ? cur + ' ' : '') + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtBytes(b) {
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b > 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}
