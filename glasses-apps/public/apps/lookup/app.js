// What Is That?: look at something and pinch.
// Three modes: Identify (what is it + one fact), Translate (signs, menus),
// Read (transcribe text).
//
//   select     snap + ask
//   left/right switch mode
//   up         sound on/off
//   down       change translate language
//   back       home

import { onGesture } from '/shared/input.js';
import { h, mount, hints, goHome } from '/shared/ui.js';
import { captureJpeg } from '/shared/camera.js';
import { vision } from '/shared/api.js';
import { speak, isMuted, setMuted } from '/shared/speech.js';

const MODES = [
  { id: 'identify', icon: '🎯', name: 'Identify' },
  { id: 'translate', icon: '🌐', name: 'Translate' },
  { id: 'read', icon: '📖', name: 'Read' },
];
const LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Chinese', 'Korean', 'Arabic', 'Hindi', 'Vietnamese'];

const root = document.getElementById('app');
let mode = 0;
let lang = 0;
let loading = false;
let answer = '';
let error = '';

try {
  mode = Math.max(0, Math.min(MODES.length - 1, Number(localStorage.getItem('glasses.lookup.mode')) || 0));
  lang = Math.max(0, LANGS.indexOf(localStorage.getItem('glasses.lookup.lang') || 'English'));
} catch { /* storage blocked */ }

function remember() {
  try {
    localStorage.setItem('glasses.lookup.mode', String(mode));
    localStorage.setItem('glasses.lookup.lang', LANGS[lang]);
  } catch { /* ignore */ }
}

function render() {
  const m = MODES[mode];
  const modeBar = h('div', { class: 'dim' }, MODES.map((x, i) =>
    h('span', { class: i === mode ? 'accent' : '' }, `${i ? '  ·  ' : ''}${x.icon} ${x.name}`)));

  let body;
  if (loading) {
    body = h('div', { class: 'center' }, h('div', { class: 'big pulse' }, m.icon), h('div', { class: 'mid' }, 'Looking…'));
  } else if (error) {
    body = h('div', { class: 'mid bad' }, error);
  } else if (answer) {
    body = h('div', { class: 'mid', id: 'answer' }, answer);
  } else {
    body = h('div', { class: 'center' },
      h('div', { class: 'big' }, m.icon),
      h('div', { class: 'mid' }, m.id === 'translate' ? `Look at text → ${LANGS[lang]}` : m.id === 'read' ? 'Look at some text' : 'Look at something'),
      h('div', { class: 'dim' }, 'then pinch'));
  }

  mount(root,
    h('div', { class: 'label' }, 'What is that?', '  ', h('span', { class: isMuted() ? 'dim' : 'accent' }, isMuted() ? '🔇' : '🔊'),
      m.id === 'translate' ? `  → ${LANGS[lang]}` : ''),
    modeBar,
    body,
    hints({ select: 'Ask', right: 'Mode', up: 'Sound', ...(m.id === 'translate' ? { down: 'Language' } : {}), back: 'Home' }));
}

async function ask() {
  loading = true;
  answer = '';
  error = '';
  render();
  try {
    const image = await captureJpeg(1024);
    const { text } = await vision(MODES[mode].id, image, { lang: LANGS[lang] });
    answer = text;
    speak(text);
  } catch (err) {
    error = err.message;
  } finally {
    loading = false;
    render();
  }
}

onGesture((g) => {
  if (loading) return;
  switch (g) {
    case 'select': return ask();
    case 'left': mode = (mode + MODES.length - 1) % MODES.length; answer = ''; error = ''; break;
    case 'right': mode = (mode + 1) % MODES.length; answer = ''; error = ''; break;
    case 'up': setMuted(!isMuted()); break;
    case 'down': if (MODES[mode].id === 'translate') lang = (lang + 1) % LANGS.length; break;
    case 'back': return goHome();
    default: return;
  }
  remember();
  render();
});

render();
