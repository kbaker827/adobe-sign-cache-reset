# Glasses Apps

Five heads-up web apps for **Meta Ray-Ban Display** glasses, plus a small Node server.

| App | What it does | Controls |
|---|---|---|
| 🧠 **Side Quest** | Shows **one** task. Pinch when done. Nudges you after 25 min on the same thing. "Doorway note" reminds you why you walked into a room. | ● done · → skip · ← snooze 15m · ↑ add by voice · ↓ doorway note |
| 🗣️ **Convo Notes** | Live captions. When someone's name is said out loud, it shows your notes about them. No face recognition. | ● pause · ↑/↓ browse people · → add note by voice · ← hide |
| 🔧 **IT X-Ray** | Look at a device label and pinch. Claude reads the serial and tag, then shows owner, warranty, tickets and quick actions. | ● scan · ←/→ Summary/Tickets/Actions · ● run action |
| 🍳 **Step by Step** | Guides one step at a time with built-in timers. Remembers where you stopped. Say "make a guide for…" and Claude writes one. | ● next · ← back · ↓ timer · ↑ read aloud |
| 🎯 **What Is That?** | Look and pinch: **Identify**, **Translate** (12 languages) or **Read** text. Answers are short and spoken. | ● ask · ←/→ mode · ↓ language · ↑ sound |

⟲ (back) always returns to the launcher.

## Run it

```bash
cd glasses-apps
npm install

npm run demo                              # canned AI answers, no key needed
ANTHROPIC_API_KEY=sk-ant-... npm start    # real AI
```

Open http://localhost:8787. Add `?dev` to the URL for an on-screen gesture pad, or use the arrow keys, Enter and Esc.

### Phone pages (edit while you're not wearing the glasses)

- `/apps/sidequest/edit.html`: your task list, one per line
- `/apps/convo/people.html`: people you want reminders about

The glasses and phone share data through the server (`data/store/`).

## Putting it on the glasses

Meta opened the display to developers in **developer preview** (May 2026). You can ship it two ways: a **web app** (this project) or the native **Wearables Device Access Toolkit** for iOS/Android. Web apps are shared through password-protected URLs.

1. Host the server somewhere the glasses can reach **over HTTPS**. The camera and mic only work on HTTPS (or localhost). A tunnel such as Cloudflare Tunnel works for testing.
2. Set `APP_TOKEN=some-long-secret` so strangers can't use your Claude key. Open the app once with `?token=some-long-secret`; a cookie remembers it.
3. Register the URL as a web app in Meta's developer portal.

### Things to verify on real hardware

I couldn't reach Meta's docs from the build environment, so these are assumptions:

| Assumption | Where to change it |
|---|---|
| Neural Band gestures arrive as arrow keys / Enter / Escape | `KEYMAP` in `public/shared/input.js`, or call `window.glassesGesture('select')` from Meta's event |
| Screen is about 600×600 | `.screen` in `public/shared/glass.css` |
| `getUserMedia` reaches the glasses camera | `public/shared/camera.js` |
| Web Speech API works for voice input | `public/shared/speech.js` (falls back to a typed prompt) |

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | | Claude API key (server only, never sent to the glasses) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for vision and guides. Runs at low effort for fast replies. |
| `DEMO` | | `1` = canned answers, no API calls |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Where the server listens |
| `APP_TOKEN` | | Locks the app behind a token |
| `ACTION_WEBHOOK_URL` | | IT X-Ray actions are POSTed here (Power Automate, n8n, a script runner…). Without it, actions are only logged to `data/actions.log`. |

Refusal fallbacks are turned on (`fallbacks: "default"`): if the model declines a request, the API retries it on a fallback model automatically.

## IT asset data

`data/assets.json` holds sample devices. Replace it with an export from your asset system: same fields, one object per device. Lookups match serial or asset tag, and tolerate one OCR slip on the serial.

## Test

```bash
npm test
```

This starts the server in demo mode and drives every app in a headless 600×600 browser with gestures. It saves screenshots to `tests/screens/` and puts your real `data/store` back afterwards.

## Layout

```
server.js              static files + /api/store, /api/vision, /api/guide, /api/assets, /api/action
public/index.html      launcher
public/shared/         gestures, UI helpers, storage, speech, camera, API client, styles
public/apps/<app>/     one folder per app
data/assets.json       IT X-Ray device list
tests/smoke.mjs        end-to-end test
```
