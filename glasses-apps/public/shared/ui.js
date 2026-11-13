// Tiny DOM helpers. Text is always added as text (never as HTML),
// so notes, captions and AI answers can't inject markup.

export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

export function mount(root, ...kids) {
  root.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

const ICON = { select: '●', up: '↑', down: '↓', left: '←', right: '→', back: '⟲' };

/** Row of gesture hints, e.g. hints({ select: 'Done', back: 'Home' }) */
export function hints(map) {
  return h('div', { class: 'hint' },
    Object.entries(map).map(([g, label]) => h('span', {}, h('b', {}, ICON[g] || g), ' ', label)));
}

let toastTimer;
export function toast(msg, ms = 1800) {
  let el = $('#toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function goHome() {
  location.href = '/';
}

export function fmtTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h_ = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h_ ? `${h_}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
