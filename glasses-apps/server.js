// Glasses Apps server
// - Serves the web apps in ./public
// - Keeps small shared JSON documents (task list, people notes) in ./data/store
// - Calls Claude for the camera features (identify, translate, read, label scan)
//   and for building step-by-step guides
//
// Run:  ANTHROPIC_API_KEY=... npm start      (real AI)
//       DEMO=1 npm start                    (canned answers, no key needed)

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STORE_DIR = path.join(DATA_DIR, 'store');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '0.0.0.0';
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const DEMO = process.env.DEMO === '1';
const APP_TOKEN = process.env.APP_TOKEN || '';
const ACTION_WEBHOOK_URL = process.env.ACTION_WEBHOOK_URL || '';

const MAX_BODY = 6 * 1024 * 1024; // camera frames are ~100-300 KB
const MAX_STORE_DOC = 1024 * 1024;

let claude = null;
if (!DEMO) {
  try {
    claude = new Anthropic();
  } catch (err) {
    console.warn(`Claude client not available (${err.message}). AI features will return errors. Use DEMO=1 to try without a key.`);
  }
}

// ---------------------------------------------------------------- helpers

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit) {
  const raw = await readBody(req, limit);
  try {
    return JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Optional access token. If APP_TOKEN is set, open the app once with
 * ?token=YOUR_TOKEN; a cookie remembers it after that.
 */
function checkAuth(req, res, url) {
  if (!APP_TOKEN) return true;
  const cookie = /(?:^|;\s*)gt=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  if (cookie && safeEqual(decodeURIComponent(cookie), APP_TOKEN)) return true;
  const q = url.searchParams.get('token');
  if (q && safeEqual(q, APP_TOKEN)) {
    url.searchParams.delete('token');
    res.writeHead(302, {
      'set-cookie': `gt=${encodeURIComponent(APP_TOKEN)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
      location: url.pathname + url.search,
    });
    res.end();
    return false;
  }
  send(res, 401, 'Locked. Open this app with ?token=YOUR_TOKEN once.');
  return false;
}

// ---------------------------------------------------------------- static files

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    send(res, 404, 'Not found');
  }
}

// ---------------------------------------------------------------- shared store

const STORE_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const writeQueues = new Map();

async function handleStore(req, res, key) {
  if (!STORE_KEY.test(key)) return send(res, 400, { error: 'Bad key' });
  const file = path.join(STORE_DIR, `${key}.json`);
  if (req.method === 'GET') {
    try {
      const data = await fs.readFile(file, 'utf8');
      return send(res, 200, data, { 'content-type': 'application/json; charset=utf-8' });
    } catch {
      return send(res, 404, { error: 'Not found' });
    }
  }
  if (req.method === 'PUT') {
    const value = await readJson(req, MAX_STORE_DOC);
    // Writes to the same key run one at a time, in arrival order.
    const write = (writeQueues.get(key) || Promise.resolve()).then(async () => {
      await fs.mkdir(STORE_DIR, { recursive: true });
      const tmp = `${file}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value, null, 2));
      await fs.rename(tmp, file); // atomic replace
    });
    const settled = write.catch(() => {});
    writeQueues.set(key, settled);
    settled.then(() => { if (writeQueues.get(key) === settled) writeQueues.delete(key); });
    await write;
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: 'Method not allowed' });
}

// ---------------------------------------------------------------- assets (IT x-ray)

async function loadAssets() {
  const raw = await fs.readFile(path.join(DATA_DIR, 'assets.json'), 'utf8');
  return JSON.parse(raw);
}

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function handleAssetLookup(res, url) {
  const serial = norm(url.searchParams.get('serial'));
  const tag = norm(url.searchParams.get('tag'));
  const model = String(url.searchParams.get('model') || '').toLowerCase().trim();
  const assets = await loadAssets();

  const exact = assets.find((a) =>
    (serial && norm(a.serial) === serial) || (tag && norm(a.assetTag) === tag));
  if (exact) return send(res, 200, { match: 'exact', asset: exact });

  // OCR can drop or misread a character: accept a near match on serial.
  if (serial.length >= 6) {
    const near = assets.find((a) => {
      const s = norm(a.serial);
      return s.includes(serial) || serial.includes(s);
    });
    if (near) return send(res, 200, { match: 'partial', asset: near });
  }
  if (model) {
    const sameModel = assets.filter((a) => a.model.toLowerCase().includes(model));
    if (sameModel.length) return send(res, 200, { match: 'model', candidates: sameModel.slice(0, 5) });
  }
  send(res, 404, { error: 'No matching asset' });
}

async function handleAction(req, res) {
  const { assetId, actionId } = await readJson(req, 10_000);
  const assets = await loadAssets();
  const asset = assets.find((a) => a.id === assetId);
  const action = asset?.actions?.find((a) => a.id === actionId);
  if (!asset || !action) return send(res, 404, { error: 'Unknown asset or action' });

  const entry = { at: new Date().toISOString(), assetId, serial: asset.serial, actionId, label: action.label };
  await fs.appendFile(path.join(DATA_DIR, 'actions.log'), JSON.stringify(entry) + '\n');

  // Hand off to your real automation (Power Automate, n8n, a script runner...).
  if (ACTION_WEBHOOK_URL) {
    try {
      const r = await fetch(ACTION_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return send(res, 502, { error: `Automation returned ${r.status}` });
      return send(res, 200, { ok: true, message: `Sent: ${action.label}` });
    } catch (err) {
      return send(res, 502, { error: `Automation unreachable: ${err.message}` });
    }
  }
  send(res, 200, { ok: true, message: `Logged: ${action.label}` });
}

// ---------------------------------------------------------------- Claude

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Chinese', 'Korean', 'Arabic', 'Hindi', 'Vietnamese'];

const HUD = 'Your reply is shown on a tiny heads-up display in smart glasses and may be read aloud. '
  + 'The image is what the wearer is looking at right now. Plain text only: no markdown, no lists, no preamble.';

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    serial: { type: 'string', description: 'Serial number exactly as printed, or empty string if not clearly readable' },
    model: { type: 'string', description: 'Make and model, or empty string' },
    assetTag: { type: 'string', description: 'Company asset tag, or empty string' },
  },
  required: ['serial', 'model', 'assetTag'],
  additionalProperties: false,
};

const GUIDE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One short action, at most 18 words' },
          timerSeconds: { type: 'integer', description: 'Seconds to wait for this step, or 0 if none' },
        },
        required: ['text', 'timerSeconds'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'steps'],
  additionalProperties: false,
};

function visionTask(mode, body) {
  switch (mode) {
    case 'identify':
      return { system: `${HUD} Name the main thing the wearer is looking at, then give one genuinely useful fact about it. At most 25 words.` };
    case 'translate': {
      const lang = LANGUAGES.includes(body.lang) ? body.lang : 'English';
      return { system: `${HUD} Translate the main readable text in the image into ${lang}. At most 40 words. If there is no readable text, reply exactly: No text found.` };
    }
    case 'read':
      return { system: `${HUD} Transcribe the main readable text in the image as written. At most 60 words. If there is no readable text, reply exactly: No text found.` };
    case 'label':
      return {
        system: 'You read equipment labels for an IT technician. Extract only what is clearly printed on the label. Never guess or invent characters; use an empty string for anything unclear.',
        schema: LABEL_SCHEMA,
      };
    default:
      return null;
  }
}

const DEMO_ANSWERS = {
  identify: 'A ceramic coffee mug. Ceramic keeps coffee hot longer than glass. (demo answer)',
  translate: 'Emergency exit only. Alarm will sound. (demo answer)',
  read: 'MEETING ROOM 3B · Reserved 2:00-3:00 PM · IT Weekly Sync (demo answer)',
  label: { serial: '5CG1234XYZ', model: 'HP EliteBook 840 G8', assetTag: 'IT-00412' },
  guide: {
    title: 'Make a cup of tea (demo)',
    steps: [
      { text: 'Fill the kettle and switch it on.', timerSeconds: 0 },
      { text: 'Put a tea bag in your mug.', timerSeconds: 0 },
      { text: 'Pour the hot water over the tea bag.', timerSeconds: 0 },
      { text: 'Let it steep.', timerSeconds: 180 },
      { text: 'Remove the bag, add milk if you like. Enjoy.', timerSeconds: 0 },
    ],
  },
};

async function askClaude({ system, content, schema, maxTokens = 4000 }) {
  if (!claude) {
    throw Object.assign(new Error('AI is offline: set ANTHROPIC_API_KEY on the server (or run with DEMO=1).'), { status: 503 });
  }
  const outputConfig = { effort: 'low' }; // short answers, fast replies
  if (schema) outputConfig.format = { type: 'json_schema', schema };

  let response;
  try {
    response = await claude.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: outputConfig,
      system,
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('Claude API key was rejected.'), { status: 502 });
    if (err instanceof Anthropic.RateLimitError) throw Object.assign(new Error('Too many requests. Try again in a moment.'), { status: 429 });
    if (err instanceof Anthropic.APIConnectionError) throw Object.assign(new Error('Could not reach Claude. Check the network.'), { status: 502 });
    if (err instanceof Anthropic.APIError) throw Object.assign(new Error(`Claude error: ${err.message}`), { status: 502 });
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error("Claude couldn't help with that one."), { status: 422 });
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!schema) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('AI reply was not valid JSON.'), { status: 502 });
  }
}

async function handleVision(req, res) {
  const body = await readJson(req);
  const task = visionTask(body.mode, body);
  if (!task) return send(res, 400, { error: 'Unknown mode' });
  if (typeof body.image !== 'string' || body.image.length < 100 || !/^[A-Za-z0-9+/=]+$/.test(body.image)) {
    return send(res, 400, { error: 'Missing or invalid image' });
  }
  if (DEMO) {
    const a = DEMO_ANSWERS[body.mode];
    return send(res, 200, typeof a === 'string' ? { text: a } : { data: a });
  }
  const content = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } },
    { type: 'text', text: task.schema ? 'Read the label.' : 'What am I looking at?' },
  ];
  const result = await askClaude({ system: task.system, content, schema: task.schema });
  send(res, 200, task.schema ? { data: result } : { text: result });
}

async function handleGuide(req, res) {
  const { request } = await readJson(req, 10_000);
  const ask = String(request || '').trim().slice(0, 200);
  if (!ask) return send(res, 400, { error: 'Say what you want to do' });
  if (DEMO) return send(res, 200, { guide: DEMO_ANSWERS.guide });
  const guide = await askClaude({
    system: 'You write hands-free step-by-step guides shown one step at a time on smart glasses. '
      + 'Use 4 to 14 steps. Each step is one short, concrete action. '
      + 'Put waiting time (baking, drying, steeping) in timerSeconds instead of the text. '
      + 'If the task is dangerous, include the key safety step.',
    content: [{ type: 'text', text: `Make a guide for: ${ask}` }],
    schema: GUIDE_SCHEMA,
  });
  guide.steps = (guide.steps || []).slice(0, 30).map((s) => ({
    text: String(s.text || '').slice(0, 300),
    timerSeconds: Math.max(0, Math.min(24 * 3600, Math.round(Number(s.timerSeconds) || 0))),
  }));
  send(res, 200, { guide });
}

// ---------------------------------------------------------------- router

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (!checkAuth(req, res, url)) return;
    const p = url.pathname;

    if (p === '/api/health') return send(res, 200, { ok: true, demo: DEMO, ai: DEMO || Boolean(claude), model: DEMO ? 'demo' : MODEL });
    if (p.startsWith('/api/store/')) return await handleStore(req, res, p.slice('/api/store/'.length));
    if (p === '/api/assets' && req.method === 'GET') return await handleAssetLookup(res, url);
    if (p === '/api/action' && req.method === 'POST') return await handleAction(req, res);
    if (p === '/api/vision' && req.method === 'POST') return await handleVision(req, res);
    if (p === '/api/guide' && req.method === 'POST') return await handleGuide(req, res);
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(res, p);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: status >= 500 && !err.status ? 'Server error' : err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Glasses apps running on http://localhost:${PORT}  (${DEMO ? 'DEMO mode' : `model ${MODEL}`})`);
  if (APP_TOKEN) console.log('Locked with APP_TOKEN: open once with ?token=...');
});
