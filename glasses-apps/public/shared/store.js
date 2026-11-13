// Shared storage. Data lives on the server so the glasses and your phone
// see the same task list / notes. A local copy is kept as an offline cache.

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(`glasses.${key}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(`glasses.${key}`, JSON.stringify(value));
  } catch { /* storage blocked or full */ }
}

export async function loadShared(key, fallback) {
  try {
    const r = await fetch(`/api/store/${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (r.ok) {
      const value = await r.json();
      cacheSet(key, value);
      return value;
    }
  } catch { /* offline: fall through to cache */ }
  return cacheGet(key) ?? structuredClone(fallback);
}

export async function saveShared(key, value) {
  cacheSet(key, value);
  try {
    const r = await fetch(`/api/store/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Fetches the server copy only (no cache). Returns undefined if missing/offline. */
export async function peekShared(key) {
  try {
    const r = await fetch(`/api/store/${encodeURIComponent(key)}`, { cache: 'no-store' });
    return r.ok ? await r.json() : undefined;
  } catch {
    return undefined;
  }
}
