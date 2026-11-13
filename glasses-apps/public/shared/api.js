// Calls to our own server. The server holds the Claude API key;
// the glasses never see it.

async function request(url, options = {}) {
  const r = await fetch(url, options);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Server error ${r.status}`);
  return body;
}

export const getJSON = (url) => request(url, { cache: 'no-store' });

export const postJSON = (url, data) => request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});

/** mode: 'identify' | 'translate' | 'read' | 'label' */
export const vision = (mode, image, extra = {}) => postJSON('/api/vision', { mode, image, ...extra });
