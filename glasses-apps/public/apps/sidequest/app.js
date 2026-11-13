// Side Quest: shows ONE task. Pinch when done. That's it.
//
//   select  done          right  skip (moves to the end)
//   left    snooze 15 min up     add a task by voice
//   down    "doorway note": say why you walked into this room
//   back    home

import { onGesture, setInputBlocked } from '/shared/input.js';
import { h, mount, hints, toast, goHome, fmtTime, pick } from '/shared/ui.js';
import { loadShared, saveShared, peekShared } from '/shared/store.js';
import { listenOnce, speak } from '/shared/speech.js';

export const KEY = 'sidequest';
const NUDGE_MIN = 25;
const SNOOZE_MIN = 15;
const DOORWAY_MIN = 10;
const KEEP_DONE_HOURS = 24;

const SAMPLE = {
  updatedAt: 0,
  nextId: 4,
  currentId: null,
  startedAt: null,
  nudged: 0,
  doorway: null,
  tasks: [
    { id: 1, text: 'Drink a glass of water' },
    { id: 2, text: 'Reply to the email from IT' },
    { id: 3, text: '10 minute tidy: desk only' },
  ],
};

const CHEERS = ['✓ Done. Nice.', '✓ Boom. Next.', '✓ Look at you go.', '✓ One less thing.', '✓ Crushed it.'];

const root = document.getElementById('app');
let st = await loadShared(KEY, SAMPLE);
let busy = false;

// Drop tasks that were finished more than a day ago.
st.tasks = st.tasks.filter((t) => !t.done || Date.now() - (t.doneAt || 0) < KEEP_DONE_HOURS * 3600e3);

function persist() {
  st.updatedAt = Date.now();
  saveShared(KEY, st);
}

const openTasks = () => {
  const now = Date.now();
  return st.tasks.filter((t) => !t.done && !(t.snoozedUntil > now));
};
const snoozedCount = () => st.tasks.filter((t) => !t.done && t.snoozedUntil > Date.now()).length;

function current() {
  const list = openTasks();
  const c = list.find((t) => t.id === st.currentId) || list[0] || null;
  if ((c?.id ?? null) !== st.currentId) {
    st.currentId = c?.id ?? null;
    st.startedAt = c ? Date.now() : null;
    st.nudged = 0;
    persist();
  }
  return c;
}

function doorwayBanner() {
  const d = st.doorway;
  if (!d || Date.now() - d.at > DOORWAY_MIN * 60e3) return null;
  return h('div', { class: 'banner' }, '🚪 You came here for: ', h('b', {}, d.text));
}

function render() {
  if (busy) return;
  const c = current();
  if (!c) {
    const snoozed = snoozedCount();
    mount(root,
      doorwayBanner(),
      h('div', { class: 'label' }, 'Side Quest'),
      h('div', { class: 'center' },
        h('div', { class: 'big accent' }, 'All clear ✨'),
        h('div', { class: 'dim' }, snoozed ? `${snoozed} snoozed, back soon` : 'Nothing left. Go have fun.')),
      hints({ up: 'Add', down: 'Doorway', back: 'Home' }));
    return;
  }

  const elapsed = Date.now() - st.startedAt;
  const more = openTasks().length - 1;
  const over = elapsed >= NUDGE_MIN * 60e3;
  mount(root,
    doorwayBanner(),
    h('div', { class: 'label' }, 'Now'),
    h('div', { class: 'big', id: 'task' }, c.text),
    h('div', { class: `timer${over ? ' warn' : ''}` }, fmtTime(elapsed)),
    h('div', { class: 'dim' }, more > 0 ? `${more} more after this` : 'Last one!'),
    hints({ select: 'Done', right: 'Skip', left: 'Snooze', up: 'Add', down: 'Doorway' }));

  // Gentle time-blindness nudge every 25 minutes on the same task.
  const k = Math.floor(elapsed / (NUDGE_MIN * 60e3));
  if (k > (st.nudged || 0)) {
    st.nudged = k;
    persist();
    toast(`⏱ ${k * NUDGE_MIN} min on this. Still the right thing?`, 6000);
    speak(`You've been on this for ${k * NUDGE_MIN} minutes.`);
  }
}

async function ask(question, onAnswer) {
  busy = true;
  setInputBlocked(true);
  mount(root,
    h('div', { class: 'label' }, 'Listening'),
    h('div', { class: 'center' },
      h('div', { class: 'big pulse' }, '🎙'),
      h('div', { class: 'mid' }, question)));
  try {
    const text = await listenOnce({ question });
    if (text) onAnswer(text.charAt(0).toUpperCase() + text.slice(1));
    else toast("Didn't catch that");
  } finally {
    busy = false;
    setInputBlocked(false);
    render();
  }
}

onGesture(async (g) => {
  if (busy) return;
  const c = current();
  switch (g) {
    case 'select':
      if (!c) return;
      c.done = true;
      c.doneAt = Date.now();
      persist();
      toast(pick(CHEERS));
      break;
    case 'right':
      if (!c || openTasks().length < 2) return toast('Nothing to skip to');
      st.tasks = st.tasks.filter((t) => t !== c).concat(c);
      st.currentId = null;
      persist();
      toast('Skipped → later');
      break;
    case 'left':
      if (!c) return;
      c.snoozedUntil = Date.now() + SNOOZE_MIN * 60e3;
      persist();
      toast(`💤 Snoozed ${SNOOZE_MIN} min`);
      break;
    case 'up':
      return ask('New task?', (text) => {
        st.tasks.push({ id: st.nextId++, text });
        persist();
        toast('Added to the end');
      });
    case 'down':
      return ask('What did you come here for?', (text) => {
        st.doorway = { text, at: Date.now() };
        persist();
      });
    case 'back':
      return goHome();
    default:
      return;
  }
  render();
});

// Pick up edits made on the phone.
setInterval(async () => {
  if (busy) return;
  const remote = await peekShared(KEY);
  if (remote && remote.updatedAt > st.updatedAt) {
    st = remote;
    render();
  }
}, 15000);

setInterval(render, 1000);
render();
