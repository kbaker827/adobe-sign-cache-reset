// End-to-end smoke test: starts the server in DEMO mode, drives every app
// with gestures in a 600x600 headless browser, and saves screenshots.
//
//   npm test                     (screenshots go to ./tests/screens)
//   SCREENS_DIR=/some/dir npm test

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const SCREENS = process.env.SCREENS_DIR || path.join(ROOT, 'tests', 'screens');

// Fresh data folder per run so tests never touch your real task list.
const storeBackup = path.join(os.tmpdir(), `glasses-store-${Date.now()}`);
const storeDir = path.join(ROOT, 'data', 'store');
await fs.rename(storeDir, storeBackup).catch(() => {});
const actionsLog = path.join(ROOT, 'data', 'actions.log');
const hadActionsLog = await fs.access(actionsLog).then(() => true, () => false);

const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, DEMO: '1', PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes('running') && resolve());
  server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
});

await fs.mkdir(SCREENS, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const context = await browser.newContext({ viewport: { width: 600, height: 600 }, permissions: ['camera', 'microphone'] });
await context.addInitScript(() => { window.__NO_SR = true; }); // use prompt() instead of the mic
const page = await context.newPage();

let answers = [];
page.on('dialog', (d) => d.accept(answers.shift() ?? ''));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failures = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n    ${err.message.split('\n')[0]}`);
  }
}
const text = () => page.locator('#app').innerText();
async function expectText(needle, timeout = 4000) {
  await page.locator('#app', { hasText: needle }).waitFor({ timeout });
}
const press = (key) => page.keyboard.press(key);
const shot = (name) => page.screenshot({ path: path.join(SCREENS, `${name}.png`) });

console.log('Launcher');
await page.goto(BASE);
await check('lists five apps', async () => {
  await expectText('Side Quest');
  const t = await text();
  for (const n of ['Convo Notes', 'IT X-Ray', 'Step by Step', 'What Is That?']) if (!t.includes(n)) throw new Error(`missing ${n}`);
});
await shot('0-launcher');
await check('select opens Side Quest', async () => {
  await press('Enter');
  await page.waitForURL('**/apps/sidequest/');
});

console.log('Side Quest');
await check('shows the first task', () => expectText('Drink a glass of water'));
await shot('1-sidequest');
await check('skip moves to next task', async () => { await press('ArrowRight'); await expectText('Reply to the email from IT'); });
await check('done advances', async () => { await press('Enter'); await expectText('10 minute tidy'); });
await check('add task by voice', async () => {
  answers.push('buy cat food');
  await press('ArrowUp');
  await page.waitForTimeout(300);
  await page.evaluate(() => fetch('/api/store/sidequest').then((r) => r.json())).then((s) => {
    if (!s.tasks.some((t) => t.text === 'Buy cat food')) throw new Error('task not saved on server');
  });
});
await check('doorway note shows banner', async () => {
  answers.push('the stapler');
  await press('ArrowDown');
  await expectText('You came here for: the stapler');
});
await shot('1-sidequest-doorway');
await check('phone editor sees the list', async () => {
  await page.goto(`${BASE}/apps/sidequest/edit.html`);
  const v = await page.locator('#list').inputValue();
  if (!v.includes('Buy cat food')) throw new Error(v);
});

console.log('Convo Notes');
await page.goto(`${BASE}/apps/convo/`);
await check('shows status (no speech in headless)', () => expectText('Convo Notes'));
await check('browse people opens a card', async () => { await press('ArrowDown'); await expectText('Sam Rivera'); });
await check('add a note by voice', async () => {
  answers.push('back from vacation');
  await press('ArrowRight');
  await expectText('back from vacation');
});
await shot('2-convo');
await check('people editor round-trip', async () => {
  await page.goto(`${BASE}/apps/convo/people.html`);
  const v = await page.locator('#list').inputValue();
  if (!v.includes('Sam Rivera | Sam |')) throw new Error(v);
});

console.log('IT X-Ray');
await page.goto(`${BASE}/apps/xray/`);
await check('scan finds the demo laptop', async () => { await press('Enter'); await expectText('HP EliteBook 840 G8', 8000); });
await check('summary shows owner + warranty', async () => {
  const t = await text();
  if (!t.includes('Sam Rivera') || !t.includes('Warranty')) throw new Error(t);
});
await shot('3-xray');
await check('actions page runs an action', async () => {
  await press('ArrowRight'); await press('ArrowRight');
  await expectText('Run Adobe Sign cache reset');
  await press('Enter');
  await page.locator('#toast', { hasText: 'Logged' }).waitFor({ timeout: 4000 });
});
await shot('3-xray-actions');

console.log('Step by Step');
await page.goto(`${BASE}/apps/steps/`);
await check('lists guides', () => expectText('Fluffy pancakes'));
await check('open guide and step forward', async () => {
  await press('Enter');
  await expectText('1/8');
  await press('Enter'); await press('Enter'); await press('Enter');
  await expectText('Let the batter rest');
});
await check('timer starts', async () => { await press('ArrowDown'); await expectText('4:5'); });
await shot('4-steps');
await check('progress resumes', async () => {
  await press('Escape');
  await expectText('Resume at step 4');
});
await check('voice guide gets created', async () => {
  answers.push('make tea');
  await press('ArrowUp'); // wraps to "New guide by voice"
  await press('Enter');
  await expectText('Make a cup of tea', 6000);
});

console.log('What Is That?');
await page.goto(`${BASE}/apps/lookup/`);
await check('identify answers', async () => { await press('Enter'); await expectText('coffee mug', 8000); });
await shot('5-lookup');
await check('translate mode + language', async () => {
  await press('ArrowRight');
  await press('ArrowDown');
  await expectText('Spanish');
  await press('Enter');
  await expectText('Emergency exit', 8000);
});
await check('back goes home', async () => { await press('Escape'); await page.waitForURL(`${BASE}/`); });

console.log('Server');
await check('rejects path traversal', async () => {
  const r = await fetch(`${BASE}/..%2f..%2fpackage.json`);
  if (r.status === 200) throw new Error('served file outside public/');
});
await check('rejects bad store keys', async () => {
  const r = await fetch(`${BASE}/api/store/..%2fx`, { method: 'PUT', body: '{}' });
  if (r.status !== 400) throw new Error(`status ${r.status}`);
});

await check('no page errors', async () => {
  const real = errors.filter((e) => !/favicon|404/.test(e));
  if (real.length) throw new Error(real.join(' | '));
});

await browser.close();
server.kill();
await fs.rm(storeDir, { recursive: true, force: true });
await fs.rename(storeBackup, storeDir).catch(() => {});
if (!hadActionsLog) await fs.rm(actionsLog, { force: true });

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
