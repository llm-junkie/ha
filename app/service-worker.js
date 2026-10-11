/* CONFIG is injected by the production build. Model caches survive UI-only updates. */
const PREFIX = `human-atlas:${CONFIG.base}:`;
const APP_CACHE = `${PREFIX}app:${CONFIG.appVersion}`;
const DATA_CACHE = `${PREFIX}data:${CONFIG.modelVersion}`;
const absolute = (path) => new URL(path, self.location.origin).href;
const shell = new Map(CONFIG.shell.map((entry) => [absolute(entry.url), entry]));
const data = new Map([CONFIG.catalogue, ...CONFIG.chunks.flatMap((chunk) =>
  chunk.gzip ? [chunk.raw, chunk.gzip] : [chunk.raw],
)].map((entry) => [absolute(entry.url), entry]));
const preferred = CONFIG.chunks.map((chunk) =>
  typeof DecompressionStream === 'function' && chunk.gzip ? chunk.gzip : chunk.raw,
);
const pending = new Map();
let warming;
let storageError = false;

async function verified(response, entry) {
  if (!response.ok || response.status !== 200) throw new Error('An atlas file is unavailable.');
  const hash = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  const hex = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!entry.hashes.includes(hex)) throw new Error('The atlas file belongs to another release.');
  return response;
}

async function status() {
  const app = await caches.open(APP_CACHE), models = await caches.open(DATA_CACHE);
  const saved = (await Promise.all(preferred.map((entry) => models.match(absolute(entry.url)))))
    .filter(Boolean).length;
  const completeShell = (await Promise.all(CONFIG.shell.map((entry) => app.match(absolute(entry.url)))))
    .every(Boolean);
  return {
    type: 'human-atlas:status', saved, total: preferred.length,
    ready: saved === preferred.length && completeShell && !!(await models.match(absolute(CONFIG.catalogue.url))),
    error: storageError,
  };
}

async function report() {
  let value;
  try { value = await status(); }
  catch {
    value = { type: 'human-atlas:status', saved: 0, total: preferred.length, ready: false, error: true };
  }
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients)
    if (new URL(client.url).pathname.startsWith(CONFIG.base)) client.postMessage(value);
}

async function cachedFile(entry, cacheName) {
  const url = absolute(entry.url);
  let cache;
  try { cache = await caches.open(cacheName); }
  catch { storageError = true; }
  const cached = await cache?.match(url).catch(() => { storageError = true; });
  if (cached) return cached;
  // Deduplicate viewer requests and offline preparation without sharing consumed response bodies.
  if (!pending.has(url)) pending.set(url, (async () => {
    const initial = await fetch(url);
    let response;
    try { response = await verified(initial, entry); }
    catch (error) {
      if (!initial.ok || initial.status !== 200) throw error;
      // A deployment can replace a stable model URL before its HTTP cache expires.
      response = await verified(await fetch(url, { cache: 'reload' }), entry);
    }
    try { if (cache) await cache.put(url, response.clone()); }
    catch { storageError = true; } // A full disk must not prevent online exploration.
    await report().catch(() => {});
    return response;
  })().finally(() => pending.delete(url)));
  return (await pending.get(url)).clone();
}

async function prepareAtlas() {
  if (warming) return warming;
  warming = (async () => {
    storageError = false;
    let next = 0;
    const queue = [
      ...CONFIG.shell.map((entry) => ({ entry, cacheName: APP_CACHE })),
      ...[CONFIG.catalogue, ...preferred].map((entry) => ({ entry, cacheName: DATA_CACHE })),
    ];
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < queue.length) {
        const { entry, cacheName } = queue[next++];
        try { await cachedFile(entry, cacheName); }
        catch { storageError = true; }
      }
    }));
    await report();
  })().finally(() => { warming = undefined; });
  return warming;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const app = await caches.open(APP_CACHE);
      const results = await Promise.allSettled(CONFIG.shell.map(async (entry) => {
        const response = await verified(await fetch(absolute(entry.url), { cache: 'reload' }), entry);
        await app.put(absolute(entry.url), response);
      }));
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      const models = await caches.open(DATA_CACHE);
      const url = absolute(CONFIG.catalogue.url);
      if (!(await models.match(url)))
        await models.put(url, await verified(await fetch(url, { cache: 'reload' }), CONFIG.catalogue));
      // An update may activate after every old window closes, even without a connection.
      // Prepare its entire anatomy before allowing it to replace the working offline app.
      if (self.registration.active) {
        await prepareAtlas();
        if (!(await status()).ready) throw new Error('The updated atlas could not be saved offline.');
      }
    } catch (error) {
      await caches.delete(APP_CACHE);
      throw error;
    }
    // New releases wait until the user chooses Update or all old windows have closed.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter((key) =>
      key.startsWith(PREFIX) && key !== APP_CACHE && key !== DATA_CACHE,
    ).map((key) => caches.delete(key)));
    await self.clients.claim();
    await report().catch(() => {});
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = absolute(url.pathname);
  if (request.mode === 'navigate' &&
      (url.pathname === CONFIG.base || url.pathname === `${CONFIG.base}index.html`)) {
    event.respondWith((async () => {
      try {
        const cache = await caches.open(APP_CACHE);
        const page = await cache.match(absolute(`${CONFIG.base}index.html`));
        if (page) return page;
      } catch { /* Online navigation still works when site storage is blocked. */ }
      return fetch(request);
    })());
  } else if (data.has(key)) {
    event.respondWith(cachedFile(data.get(key), DATA_CACHE));
  } else if (shell.has(key)) {
    event.respondWith(cachedFile(shell.get(key), APP_CACHE));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'human-atlas:prepare') event.waitUntil(prepareAtlas());
  if (event.data?.type === 'human-atlas:status') event.waitUntil(report().catch(() => {}));
  if (event.data?.type === 'human-atlas:update') event.waitUntil(self.skipWaiting());
});
