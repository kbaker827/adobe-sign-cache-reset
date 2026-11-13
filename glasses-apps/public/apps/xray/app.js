// IT X-Ray: look at a device's label, pinch, and see who owns it,
// warranty, recent tickets, and quick fixes you can trigger.
//
//   select   scan label  (on the Actions page: run the highlighted action)
//   left/right switch page: Summary · Tickets · Actions
//   up/down  move in the Actions list
//   back     new scan / home

import { onGesture } from '/shared/input.js';
import { h, mount, hints, toast, goHome } from '/shared/ui.js';
import { captureJpeg } from '/shared/camera.js';
import { vision, getJSON, postJSON } from '/shared/api.js';

const PAGES = ['Summary', 'Tickets', 'Actions'];
const root = document.getElementById('app');

let state = 'idle'; // idle | scanning | result | missing | error
let asset = null;
let label = null;
let matchType = '';
let error = '';
let page = 0;
let actionSel = 0;
let running = false;

function warrantyInfo(dateStr) {
  if (!dateStr) return { text: 'Warranty unknown', cls: 'dim' };
  const end = new Date(`${dateStr}T23:59:59`);
  const days = Math.round((end - Date.now()) / 86400e3);
  if (days < 0) return { text: `Warranty EXPIRED ${dateStr}`, cls: 'bad' };
  if (days <= 60) return { text: `Warranty ends in ${days} days`, cls: 'warn' };
  return { text: `Warranty OK until ${dateStr}`, cls: 'accent' };
}

function renderResult() {
  const w = warrantyInfo(asset.warrantyEnd);
  const tabs = h('div', { class: 'dim' }, PAGES.map((p, i) =>
    h('span', { class: i === page ? 'accent' : '' }, `${i ? '  ·  ' : ''}${p}`)));
  const head = [
    h('div', { class: 'label' }, `${asset.assetTag} · ${asset.serial}${matchType === 'partial' ? ' (close match)' : ''}`),
    h('div', { class: 'mid' }, asset.model),
    tabs,
  ];

  let body;
  if (page === 0) {
    body = h('div', { class: 'card' },
      h('div', {}, '👤 ', asset.owner || 'Unassigned'),
      h('div', { class: w.cls }, '🛡 ', w.text),
      asset.location && h('div', { class: 'dim' }, '📍 ', asset.location),
      asset.os && h('div', { class: 'dim' }, '💻 ', asset.os),
      (asset.notes || []).map((n) => h('div', { class: 'warn' }, '⚠ ', n)));
  } else if (page === 1) {
    const t = asset.tickets || [];
    body = t.length
      ? h('div', { class: 'list' }, t.slice(0, 3).map((x) =>
        h('div', { class: 'item' }, h('div', {}, x.summary), h('div', { class: 'sub' }, `${x.id} · ${x.date}`))))
      : h('div', { class: 'dim' }, 'No tickets. Lucky device.');
  } else {
    const a = asset.actions || [];
    body = a.length
      ? h('div', { class: 'list' }, a.map((x, i) =>
        h('div', { class: `item${i === actionSel ? ' sel' : ''}` }, x.label)))
      : h('div', { class: 'dim' }, 'No actions set up for this device.');
  }

  mount(root, head, body,
    hints(page === 2
      ? { select: running ? 'Running…' : 'Run', down: 'Move', left: 'Pages', back: 'New scan' }
      : { left: '', right: 'Pages', select: 'Rescan', back: 'New scan' }));
}

function render() {
  if (state === 'result') return renderResult();
  if (state === 'scanning') {
    mount(root, h('div', { class: 'label' }, 'IT X-Ray'),
      h('div', { class: 'center' }, h('div', { class: 'big pulse' }, '🔍'), h('div', { class: 'mid' }, 'Reading label…')));
    return;
  }
  if (state === 'missing') {
    mount(root, h('div', { class: 'label' }, 'IT X-Ray'),
      h('div', { class: 'mid warn' }, 'Not in the asset list'),
      h('div', { class: 'card' },
        h('div', {}, 'Serial: ', label?.serial || '—'),
        h('div', {}, 'Model: ', label?.model || '—'),
        h('div', {}, 'Tag: ', label?.assetTag || '—')),
      h('div', { class: 'dim' }, 'Check the label is in focus, or add it to assets.json.'),
      hints({ select: 'Scan again', back: 'Home' }));
    return;
  }
  mount(root,
    h('div', { class: 'label' }, 'IT X-Ray'),
    h('div', { class: 'center' },
      h('div', { class: 'big' }, '🔧'),
      h('div', { class: 'mid' }, 'Look at the device label'),
      h('div', { class: 'dim' }, 'Serial number or asset tag sticker')),
    state === 'error' && h('div', { class: 'bad' }, error),
    hints({ select: 'Scan', back: 'Home' }));
}

async function scan() {
  state = 'scanning';
  render();
  try {
    const image = await captureJpeg(1280); // labels need detail
    const { data } = await vision('label', image);
    label = data;
    if (!data.serial && !data.assetTag) {
      state = 'error';
      error = "Couldn't read a serial or tag. Move closer?";
      return render();
    }
    const q = new URLSearchParams({ serial: data.serial || '', tag: data.assetTag || '', model: data.model || '' });
    try {
      const found = await getJSON(`/api/assets?${q}`);
      if (found.asset) {
        asset = found.asset;
        matchType = found.match;
        page = 0;
        actionSel = 0;
        state = 'result';
      } else {
        state = 'missing';
      }
    } catch {
      state = 'missing';
    }
  } catch (err) {
    state = 'error';
    error = err.message;
  }
  render();
}

async function runAction() {
  const action = asset.actions?.[actionSel];
  if (!action || running) return;
  running = true;
  render();
  try {
    const r = await postJSON('/api/action', { assetId: asset.id, actionId: action.id });
    toast(`✓ ${r.message}`, 2500);
  } catch (err) {
    toast(`✗ ${err.message}`, 3500);
  } finally {
    running = false;
    render();
  }
}

onGesture((g) => {
  if (state === 'scanning') return;
  if (state === 'result') {
    if (g === 'left') page = (page + PAGES.length - 1) % PAGES.length;
    else if (g === 'right') page = (page + 1) % PAGES.length;
    else if (page === 2 && (g === 'up' || g === 'down')) {
      const n = asset.actions?.length || 1;
      actionSel = (actionSel + (g === 'down' ? 1 : n - 1)) % n;
    } else if (g === 'select') return page === 2 ? runAction() : scan();
    else if (g === 'back') { state = 'idle'; asset = null; }
    return render();
  }
  if (g === 'select') return scan();
  if (g === 'back') return goHome();
});

render();
