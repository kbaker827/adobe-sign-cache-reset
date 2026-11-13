// Step by Step: one instruction at a time, pinch for the next one.
// Built-in guides live in guides.json; say "make a guide for…" to have
// Claude write a new one.
//
// List:  up/down choose · select start · back home
// Step:  select/right next · left previous · down start/stop timer
//        up read step aloud · back to list

import { onGesture, setInputBlocked } from '/shared/input.js';
import { h, mount, hints, toast, goHome, fmtTime } from '/shared/ui.js';
import { loadShared, saveShared } from '/shared/store.js';
import { listenOnce, speak } from '/shared/speech.js';
import { postJSON } from '/shared/api.js';

const CUSTOM_KEY = 'steps.custom';
const PROGRESS_KEY = 'steps.progress';
const NEW_ID = '__new__';

const root = document.getElementById('app');
const builtIn = await fetch('./guides.json').then((r) => r.json()).catch(() => []);
let custom = await loadShared(CUSTOM_KEY, []);
let progress = await loadShared(PROGRESS_KEY, {});

let screen = 'list';
let sel = 0;
let guide = null;
let step = 0;
let timer = null; // { endAt, total }
let busy = false;

const allGuides = () => [...builtIn, ...custom];
const listItems = () => [...allGuides(), { id: NEW_ID, title: '✨ New guide by voice', steps: [] }];

/** Timer for a step: explicit seconds, or "10 min" / "30 seconds" in the text. */
function stepSeconds(s) {
  if (s.timerSeconds > 0) return s.timerSeconds;
  const m = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i.exec(s.text);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  return Math.round(unit.startsWith('h') ? n * 3600 : unit.startsWith('m') ? n * 60 : n);
}

function saveProgress() {
  if (!guide) return;
  progress[guide.id] = step;
  saveShared(PROGRESS_KEY, progress);
}

function renderList() {
  const items = listItems();
  mount(root,
    h('div', { class: 'label' }, 'Step by Step'),
    h('div', { class: 'list' }, items.slice(Math.max(0, sel - 3), Math.max(0, sel - 3) + 5).map((g) => {
      const i = items.indexOf(g);
      const at = progress[g.id];
      return h('div', { class: `item${i === sel ? ' sel' : ''}` },
        h('div', {}, g.title),
        g.id !== NEW_ID && h('div', { class: 'sub' },
          at > 0 && at < g.steps.length ? `Resume at step ${at + 1} of ${g.steps.length}` : `${g.steps.length} steps`));
    })),
    hints({ down: 'Move', select: 'Start', back: 'Home' }));
}

function renderStep() {
  const s = guide.steps[step];
  const secs = stepSeconds(s);
  let timerEl = null;
  if (timer) {
    const left = timer.endAt - Date.now();
    timerEl = left > 0
      ? h('div', { class: 'timer warn' }, '⏲ ', fmtTime(left))
      : h('div', { class: 'timer accent pulse' }, '⏰ Time!');
  } else if (secs) {
    timerEl = h('div', { class: 'dim' }, `⏲ ${fmtTime(secs * 1000)} timer: ↓ to start`);
  }
  mount(root,
    h('div', { class: 'label' }, `${guide.title} · ${step + 1}/${guide.steps.length}`),
    h('div', { class: 'big' }, s.text),
    timerEl,
    hints({ select: step === guide.steps.length - 1 ? 'Finish' : 'Next', left: 'Back', down: secs ? 'Timer' : '', up: 'Read aloud' }));
}

function render() {
  if (busy) return;
  if (screen === 'step') renderStep(); else renderList();
}

function openGuide(g) {
  guide = g;
  const saved = progress[g.id] || 0;
  step = saved > 0 && saved < g.steps.length ? saved : 0;
  timer = null;
  screen = 'step';
  render();
}

function goStep(delta) {
  const next = step + delta;
  if (next < 0) return;
  if (next >= guide.steps.length) {
    progress[guide.id] = 0;
    saveShared(PROGRESS_KEY, progress);
    toast('🎉 All done!', 2500);
    speak('All done!');
    screen = 'list';
    guide = null;
    timer = null;
    return render();
  }
  step = next;
  timer = null;
  saveProgress();
  render();
}

async function makeGuide() {
  busy = true;
  setInputBlocked(true);
  mount(root, h('div', { class: 'center' },
    h('div', { class: 'big pulse' }, '🎙'),
    h('div', { class: 'mid' }, 'What do you want to do?'),
    h('div', { class: 'dim' }, 'e.g. "replace a bike tire"')));
  try {
    const request = await listenOnce({ question: 'What do you want to do?' });
    if (!request) return toast("Didn't catch that");
    mount(root, h('div', { class: 'center' },
      h('div', { class: 'big pulse' }, '✨'),
      h('div', { class: 'mid' }, 'Writing your guide…')));
    const { guide: g } = await postJSON('/api/guide', { request });
    if (!g?.steps?.length) throw new Error('Got an empty guide');
    const saved = { id: `c-${Date.now()}`, title: g.title || request, steps: g.steps };
    custom = [...custom, saved];
    await saveShared(CUSTOM_KEY, custom);
    busy = false;
    setInputBlocked(false);
    return openGuide(saved);
  } catch (err) {
    toast(`✗ ${err.message}`, 3500);
  } finally {
    busy = false;
    setInputBlocked(false);
    render();
  }
}

onGesture((g) => {
  if (busy) return;
  if (screen === 'list') {
    const items = listItems();
    if (g === 'up') sel = (sel + items.length - 1) % items.length;
    else if (g === 'down') sel = (sel + 1) % items.length;
    else if (g === 'select' || g === 'right') {
      const item = items[sel];
      return item.id === NEW_ID ? makeGuide() : openGuide(item);
    } else if (g === 'back') return goHome();
    return render();
  }
  // step screen
  if (g === 'select' || g === 'right') return goStep(1);
  if (g === 'left') return goStep(-1);
  if (g === 'up') return speak(guide.steps[step].text);
  if (g === 'down') {
    const secs = stepSeconds(guide.steps[step]);
    if (timer) timer = null;
    else if (secs) timer = { endAt: Date.now() + secs * 1000, total: secs, rang: false };
    return render();
  }
  if (g === 'back') {
    screen = 'list';
    guide = null;
    timer = null;
    return render();
  }
});

setInterval(() => {
  if (timer && !timer.rang && Date.now() >= timer.endAt) {
    timer.rang = true;
    speak("Time's up!");
    navigator.vibrate?.([200, 100, 200]);
  }
  if (timer && screen === 'step') render();
}, 500);

render();
