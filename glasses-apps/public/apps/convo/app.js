// Convo Notes: live captions, plus a quiet reminder card when someone you
// have notes on is mentioned by name ("Hey Sam!").
// No face recognition: it only reacts to names spoken out loud.
//
//   select  pause / resume captions
//   up/down flip through your people
//   right   add a note to the person on the card (by voice)
//   left    hide the card
//   back    home

import { onGesture, setInputBlocked } from '/shared/input.js';
import { h, mount, hints, toast, goHome } from '/shared/ui.js';
import { loadShared, saveShared } from '/shared/store.js';
import { listenOnce, listenContinuous, canListen } from '/shared/speech.js';

export const KEY = 'convo.people';
const CARD_SECONDS = 25;
const REPEAT_COOLDOWN_MS = 2 * 60e3;
const MAX_LINES = 3;

const SAMPLE = [
  { name: 'Sam Rivera', aliases: ['Sam'], notes: ['Works in Finance', 'Dog Biscuit was sick last month: ask how he is', 'Prefers email over Teams'] },
  { name: 'Priya Shah', aliases: ['Priya'], notes: ['Joined Legal in October', 'Asked about Adobe Sign templates'] },
];

const root = document.getElementById('app');
let people = await loadShared(KEY, SAMPLE);
let lines = [];
let partial = '';
let card = null; // { person, until }
let browse = -1;
let paused = false;
let busy = false;
let mic = null;
let micError = canListen ? '' : 'Speech recognition is not available in this browser.';
const lastShown = new Map();

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function namesFor(p) {
  return [p.name, ...(p.aliases || [])].map((n) => n.trim()).filter((n) => n.length >= 2);
}

function findMentions(text) {
  return people.filter((p) => namesFor(p).some((n) => new RegExp(`\\b${escapeRe(n)}\\b`, 'i').test(text)));
}

function showCard(person, manual = false) {
  card = { person, until: Date.now() + CARD_SECONDS * 1000 };
  if (!manual) lastShown.set(person.name, Date.now());
  render();
}

function onFinal(text) {
  if (!text) return;
  lines = [...lines, text].slice(-MAX_LINES);
  partial = '';
  for (const p of findMentions(text)) {
    if (Date.now() - (lastShown.get(p.name) || 0) > REPEAT_COOLDOWN_MS) {
      showCard(p);
      break;
    }
  }
  render();
}

function startMic() {
  if (!canListen || mic) return;
  mic = listenContinuous({
    onFinal,
    onPartial: (t) => { partial = t; render(); },
    onError: (e) => {
      micError = e === 'unsupported' ? 'Speech recognition is not available.' : 'Microphone permission was denied.';
      mic = null;
      render();
    },
  });
}

function stopMic() {
  mic?.stop();
  mic = null;
  partial = '';
}

function render() {
  if (busy) return;
  if (card && Date.now() > card.until) card = null;

  const status = paused ? h('span', { class: 'warn' }, '⏸ Paused')
    : micError ? h('span', { class: 'bad' }, '● Mic off')
    : h('span', { class: 'accent' }, '● Listening');

  const cardEl = card && h('div', { class: 'card accent' },
    h('div', { class: 'mid accent' }, card.person.name),
    h('ul', { class: 'clean' }, (card.person.notes || []).slice(-3).map((n) => h('li', {}, n))),
    !(card.person.notes || []).length && h('div', { class: 'dim' }, 'No notes yet. → to add one.'));

  const capEl = h('div', { class: 'captions' },
    lines.map((l, i) => h('div', { class: i < lines.length - 1 ? 'old' : '' }, l)),
    partial && h('div', { class: 'partial' }, partial),
    !lines.length && !partial && h('div', { class: 'dim' }, paused ? 'Captions paused.' : 'Captions appear here…'));

  mount(root,
    h('div', { class: 'label' }, 'Convo Notes  ', status),
    micError && !card && h('div', { class: 'dim' }, micError, ' You can still browse people with ↑/↓.'),
    cardEl,
    capEl,
    hints(card
      ? { select: paused ? 'Resume' : 'Pause', right: 'Add note', left: 'Hide', up: 'People' }
      : { select: paused ? 'Resume' : 'Pause', up: 'People', back: 'Home' }));
}

async function addNote() {
  if (!card) return toast('Open a person first (↑/↓)');
  const person = card.person;
  busy = true;
  setInputBlocked(true);
  const wasListening = Boolean(mic);
  stopMic();
  mount(root, h('div', { class: 'center' },
    h('div', { class: 'big pulse' }, '🎙'),
    h('div', { class: 'mid' }, `Note about ${person.name}?`)));
  try {
    const text = await listenOnce({ question: `Note about ${person.name}?` });
    if (text) {
      const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      person.notes = [...(person.notes || []), `${text} (${date})`];
      await saveShared(KEY, people);
      toast('Note saved');
      card.until = Date.now() + CARD_SECONDS * 1000;
    }
  } finally {
    busy = false;
    setInputBlocked(false);
    if (wasListening && !paused) startMic();
    render();
  }
}

onGesture((g) => {
  if (busy) return;
  switch (g) {
    case 'select':
      paused = !paused;
      if (paused) stopMic(); else startMic();
      break;
    case 'up':
    case 'down':
      if (!people.length) return toast('No people yet: add them on your phone');
      browse = (browse + (g === 'down' ? 1 : -1) + people.length) % people.length;
      showCard(people[browse], true);
      return;
    case 'left':
      card = null;
      break;
    case 'right':
      addNote();
      return;
    case 'back':
      stopMic();
      return goHome();
    default:
      return;
  }
  render();
});

startMic();
setInterval(render, 1000);
render();
