// Voice in (speech recognition) and voice out (text to speech).
// Uses the browser's built-in Web Speech API. If the glasses runtime
// doesn't offer speech recognition, listenOnce() falls back to a text prompt
// so everything still works when testing in a desktop browser.

const SR = window.__NO_SR ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
export const canListen = Boolean(SR);

let muted = false;
try { muted = localStorage.getItem('glasses.muted') === '1'; } catch { /* ignore */ }

export function isMuted() { return muted; }
export function setMuted(value) {
  muted = value;
  try { localStorage.setItem('glasses.muted', value ? '1' : '0'); } catch { /* ignore */ }
  if (value && 'speechSynthesis' in window) speechSynthesis.cancel();
}

export function speak(text) {
  if (muted || !text || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch { /* no voice available */ }
}

function promptFallback(question) {
  const answer = window.prompt(question || 'Say something');
  return (answer || '').trim();
}

/** Listens for one phrase. Resolves to the text ('' if nothing heard). */
export function listenOnce({ question = '', lang = 'en-US', timeoutMs = 10000 } = {}) {
  if (!SR) return Promise.resolve(promptFallback(question));
  return new Promise((resolve) => {
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let done = false;
    const finish = (text) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { rec.abort(); } catch { /* already stopped */ }
      resolve((text || '').trim());
    };
    const timer = setTimeout(() => finish(''), timeoutMs);
    rec.onresult = (e) => finish(e.results[0]?.[0]?.transcript);
    rec.onerror = (e) => {
      // Recognition not usable here (no mic permission, no network): ask by typing.
      if (['not-allowed', 'service-not-allowed', 'network', 'audio-capture'].includes(e.error)) {
        done = true;
        clearTimeout(timer);
        resolve(promptFallback(question));
      } else {
        finish('');
      }
    };
    rec.onend = () => finish('');
    try { rec.start(); } catch { finish(''); }
  });
}

/**
 * Keeps listening until stop() is called. Restarts itself when the browser
 * ends a session (they time out after a while).
 */
export function listenContinuous({ onPartial, onFinal, onError, lang = 'en-US' } = {}) {
  if (!SR) {
    onError?.('unsupported');
    return { stop() {}, running: false };
  }
  let active = true;
  let rec;
  const startRec = () => {
    rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let partial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinal?.(r[0].transcript.trim());
        else partial += r[0].transcript;
      }
      onPartial?.(partial.trim());
    };
    rec.onerror = (e) => {
      if (['not-allowed', 'service-not-allowed'].includes(e.error)) {
        active = false;
        onError?.(e.error);
      }
    };
    rec.onend = () => {
      if (active) setTimeout(() => active && startRec(), 300);
    };
    try { rec.start(); } catch { /* already running */ }
  };
  startRec();
  return {
    running: true,
    stop() {
      active = false;
      try { rec?.abort(); } catch { /* ignore */ }
    },
  };
}
