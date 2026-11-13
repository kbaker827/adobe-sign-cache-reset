// Turns every kind of input into six simple gestures:
//   up, down, left, right, select, back
//
// Neural Band / glasses input: Meta's display web apps receive wrist
// gestures as navigation input. Right now we map the standard keys
// (arrows, Enter, Escape). If Meta's runtime sends something different,
// add it to KEYMAP below, or call window.glassesGesture('select') from
// whatever event it fires. That is the only place you need to change.

const KEYMAP = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'select',
  ' ': 'select',
  Escape: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
};

export const GESTURES = ['up', 'down', 'left', 'right', 'select', 'back'];

const listeners = new Set();
let blocked = false;

export function onGesture(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Stops gestures from firing (e.g. while listening to your voice). */
export function setInputBlocked(value) {
  blocked = value;
}

export function emit(gesture) {
  if (blocked || !GESTURES.includes(gesture)) return;
  for (const fn of [...listeners]) {
    try { fn(gesture); } catch (err) { console.error(err); }
  }
}

// Hook for platform bridges and tests.
window.glassesGesture = emit;

window.addEventListener('keydown', (e) => {
  if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
  const g = KEYMAP[e.key];
  if (!g) return;
  e.preventDefault();
  if (!e.repeat) emit(g);
});

// Swipes (phone testing, touch temples)
let start = null;
window.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  start = { x: t.clientX, y: t.clientY };
}, { passive: true });
window.addEventListener('touchend', (e) => {
  if (!start) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - start.x;
  const dy = t.clientY - start.y;
  start = null;
  if (Math.hypot(dx, dy) < 40) return;
  if (Math.abs(dx) > Math.abs(dy)) emit(dx > 0 ? 'right' : 'left');
  else emit(dy > 0 ? 'down' : 'up');
});

// On-screen gesture pad for testing in a normal browser: add ?dev to the URL.
function devMode() {
  let on = new URLSearchParams(location.search).has('dev');
  try {
    if (on) sessionStorage.setItem('glasses.dev', '1');
    else on = sessionStorage.getItem('glasses.dev') === '1';
  } catch { /* storage blocked */ }
  return on;
}

if (devMode()) {
  const pad = document.createElement('div');
  pad.id = 'devpad';
  const layout = [
    ['', ''], ['↑', 'up'], ['⟲', 'back'],
    ['←', 'left'], ['●', 'select'], ['→', 'right'],
    ['', ''], ['↓', 'down'], ['', ''],
  ];
  for (const [label, g] of layout) {
    const b = document.createElement('button');
    b.textContent = label;
    if (g) b.addEventListener('click', () => emit(g));
    else b.style.visibility = 'hidden';
    pad.append(b);
  }
  document.addEventListener('DOMContentLoaded', () => document.body.append(pad));
  if (document.readyState !== 'loading') document.body.append(pad);
}
