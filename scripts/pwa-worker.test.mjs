import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import test from 'node:test';

const source = await readFile(new URL('../app/service-worker.js', import.meta.url), 'utf8');
const origin = 'https://example.github.io';
const hash = (body) => createHash('sha256').update(body).digest('hex');
const address = (value) => typeof value === 'string' ? value : value.url;

function fixtures(base = '/ha/') {
  const files = new Map();
  const entry = (name, body, extra = []) => {
    files.set(origin + base + name, Buffer.from(body));
    return { url: base + name, hashes: [hash(body), ...extra] };
  };
  const chunks = [0, 1, 2].map((n) => {
    const bytes = Buffer.from(`model ${n}: triangles and normals`);
    const raw = entry(`models/body-${n}.bin`, bytes);
    return { raw, gzip: entry(`models/body-${n}.bin.gz`, gzipSync(bytes), raw.hashes) };
  });
  return { files, config: {
    base, appVersion: 'app-1', modelVersion: 'models-1', chunks,
    shell: [entry('index.html', '<html>atlas</html>'), entry('assets/app-hash.js', 'atlas app')],
    catalogue: entry('models/atlas.json', JSON.stringify({ chunks })),
  } };
}

function storage() {
  const maps = new Map();
  return {
    failPut: false,
    failOpen: false,
    async open(name) {
      if (this.failOpen) throw new Error('Storage blocked');
      if (!maps.has(name)) maps.set(name, new Map());
      const map = maps.get(name), owner = this;
      return {
        async match(key) { return map.get(address(key))?.clone(); },
        async put(key, response) {
          if (owner.failPut) throw new Error('Quota exceeded');
          map.set(address(key), response.clone());
        },
      };
    },
    async keys() { return [...maps.keys()]; },
    async delete(key) { return maps.delete(key); },
  };
}

function worker(fixture = fixtures(), caches = storage(), compressed = true, updating = false) {
  const handlers = new Map(), messages = [], requests = [];
  const environment = {
    online: true, skip: 0, claims: 0, beforeFetch: undefined,
    clients: [origin + fixture.config.base, origin + '/other-project/'],
  };
  const self = {
    location: { origin },
    registration: { active: updating ? {} : null },
    addEventListener(type, handler) { handlers.set(type, handler); },
    async skipWaiting() { environment.skip++; },
    clients: {
      async claim() { environment.claims++; },
      async matchAll() {
        return environment.clients.map((url) => ({ url, postMessage(value) { messages.push({ url, value: structuredClone(value) }); } }));
      },
    },
  };
  const fetch = async (request, options) => {
    const url = address(request);
    requests.push(url);
    if (environment.beforeFetch) {
      const override = await environment.beforeFetch(url, options);
      if (override instanceof Response) return override;
    }
    if (!environment.online) throw new TypeError('Offline');
    const body = fixture.files.get(url);
    return new Response(body, { status: body ? 200 : 404, headers: { 'Content-Type': url.endsWith('.gz') ? 'application/gzip' : 'application/octet-stream' } });
  };
  vm.runInNewContext(source, {
    CONFIG: fixture.config, self, caches, fetch, crypto: webcrypto, URL, Uint8Array,
    DecompressionStream: compressed ? DecompressionStream : undefined,
  });
  async function event(type, values = {}) {
    const waits = [];
    let response;
    handlers.get(type)({ ...values, waitUntil(value) { waits.push(value); }, respondWith(value) { response = value; } });
    // Await both lifetimes without swallowing install/fetch failures.
    const result = response && await response;
    await Promise.all(waits);
    return result;
  }
  return {
    ...fixture, caches, environment, requests, messages, event,
    get: (path, mode = 'cors', method = 'GET') => event('fetch', { request: { url: new URL(path, origin).href, mode, method } }),
    send: (type) => event('message', { data: { type: `human-atlas:${type}` } }),
    async status() { await this.send('status'); return messages.at(-1).value; },
  };
}

test('the first install caches the app and catalogue, then warms the entire atlas for offline use', async () => {
  const w = worker();
  await w.event('install');
  await w.event('activate');
  assert.equal(w.environment.skip, 0);
  assert.equal(w.environment.claims, 1);
  assert.equal(w.requests.filter((url) => url.endsWith('.bin.gz')).length, 0);
  assert.equal((await w.status()).ready, false);
  await w.send('prepare');
  assert.deepEqual(await w.status(), { type: 'human-atlas:status', saved: 3, total: 3, ready: true, error: false });
  const downloaded = w.requests.length;
  w.environment.online = false;
  assert.equal(await (await w.get('/ha/?study=heart', 'navigate')).text(), '<html>atlas</html>');
  assert.equal(await (await w.get('/ha/index.html', 'navigate')).text(), '<html>atlas</html>');
  assert.equal(await (await w.get('/ha/assets/app-hash.js')).text(), 'atlas app');
  for (const chunk of w.config.chunks) {
    const response = await w.get(chunk.gzip.url);
    assert.equal(response.headers.get('Content-Type'), 'application/gzip');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), w.files.get(origin + chunk.gzip.url));
  }
  assert.ok(await w.get(w.config.catalogue.url));
  assert.equal(w.requests.length, downloaded, 'offline reopening makes no network requests for cached files');
  assert.ok(w.messages.every(({ url }) => url === origin + '/ha/'));
});

test('only GET requests for this app and its known files are intercepted', async () => {
  const w = worker();
  await w.event('install');
  for (const url of ['/ha/unknown', '/ha/models/unknown.bin', '/other-project/', '/ha-extra/', 'https://external.test/ha/'])
    assert.equal(await w.get(url, 'navigate'), undefined);
  assert.equal(await w.get('/ha/models/atlas.json', 'cors', 'POST'), undefined);
});

test('viewer downloads and offline preparation share in-flight downloads', async () => {
  const w = worker();
  await w.event('install');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const url = w.config.chunks[0].gzip.url;
  w.environment.beforeFetch = (request) => request === origin + url ? gate : undefined;
  const first = w.get(url), second = w.get(url), prepare = w.send('prepare');
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [a, b] = await Promise.all([first, second, prepare]);
  assert.deepEqual(await a.arrayBuffer(), await b.arrayBuffer());
  assert.equal(w.requests.filter((request) => request === origin + url).length, 1);
  assert.equal((await w.status()).ready, true);
});

test('corrupt files and unsuccessful responses are never cached; a retry can finish saving', async () => {
  const w = worker();
  await w.event('install');
  const url = origin + w.config.chunks[0].gzip.url, original = w.files.get(url);
  w.files.set(url, Buffer.from('wrong release'));
  await assert.rejects(w.get(url), /another release/);
  w.files.delete(url);
  await assert.rejects(w.get(url), /unavailable/);
  await w.send('prepare');
  assert.equal((await w.status()).saved, 2);
  assert.equal((await w.status()).error, true);
  w.files.set(url, original);
  await w.send('prepare');
  assert.equal((await w.status()).ready, true);
  assert.equal((await w.status()).error, false);
});

test('decoded gzip responses are validated and stored without altering their body', async () => {
  const w = worker();
  await w.event('install');
  for (const chunk of w.config.chunks)
    w.files.set(origin + chunk.gzip.url, w.files.get(origin + chunk.raw.url));
  await w.send('prepare');
  w.environment.online = false;
  const chunk = w.config.chunks[0];
  assert.deepEqual(Buffer.from(await (await w.get(chunk.gzip.url)).arrayBuffer()), w.files.get(origin + chunk.raw.url));
  assert.equal((await w.status()).ready, true);
});

test('a stale HTTP-cached model is retried from the server before it is saved', async () => {
  const w = worker();
  await w.event('install');
  const path = w.config.chunks[0].gzip.url;
  let reloads = 0;
  w.environment.beforeFetch = (url, options) => {
    if (url !== origin + path) return;
    if (options?.cache === 'reload') { reloads++; return; }
    return new Response('previous release');
  };
  const response = await w.get(path);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), w.files.get(origin + path));
  assert.equal(reloads, 1);
});

test('browsers without gzip decompression save and reopen the raw model files', async () => {
  const w = worker(fixtures('/renamed-fork/'), storage(), false);
  await w.event('install');
  await w.send('prepare');
  w.environment.online = false;
  for (const chunk of w.config.chunks) assert.ok(await w.get(chunk.raw.url));
  assert.ok(w.requests.every((url) => !url.endsWith('.gz')));
  assert.equal((await w.status()).ready, true);
});

test('full or blocked cache storage does not stop verified online model downloads', async () => {
  const w = worker();
  await w.event('install');
  w.caches.failPut = true;
  const path = w.config.chunks[0].gzip.url;
  assert.ok(await w.get(path));
  await w.send('prepare');
  assert.equal((await w.status()).ready, false);
  assert.equal((await w.status()).error, true);
  w.caches.failOpen = true;
  assert.ok(await w.get(path));
  assert.equal(await (await w.get('/ha/index.html', 'navigate')).text(), '<html>atlas</html>');
});

test('updates wait for user activation and reuse geometry caches across UI releases', async () => {
  const old = worker();
  await old.event('install');
  await old.send('prepare');
  const fixture = fixtures();
  fixture.config.appVersion = 'app-2';
  const next = worker(fixture, old.caches, true, true);
  await next.event('install');
  assert.equal(next.environment.skip, 0);
  assert.equal((await next.status()).ready, true);
  await next.send('update');
  assert.equal(next.environment.skip, 1);
  await next.event('activate');
  assert.deepEqual(await next.caches.keys(), ['human-atlas:/ha/:data:models-1', 'human-atlas:/ha/:app:app-2']);
  assert.equal(next.requests.filter((url) => url.endsWith('.bin.gz')).length, 0);
});

test('an anatomy release prepares a fresh complete cache before activation; other projects are preserved', async () => {
  const old = worker();
  await old.event('install');
  await old.send('prepare');
  await old.caches.open('human-atlas:/:app:other');
  await old.caches.open('human-atlas:/ha-extra/:data:other');
  const fixture = fixtures();
  fixture.config.appVersion = 'app-2';
  fixture.config.modelVersion = 'models-2';
  const next = worker(fixture, old.caches, true, true);
  await next.event('install');
  assert.equal((await next.status()).ready, true);
  assert.equal(next.requests.filter((url) => url.endsWith('.bin.gz')).length, 3);
  await next.event('activate');
  assert.deepEqual(new Set(await next.caches.keys()), new Set([
    'human-atlas:/ha/:app:app-2', 'human-atlas:/ha/:data:models-2',
    'human-atlas:/:app:other', 'human-atlas:/ha-extra/:data:other',
  ]));
});

test('a failed update discards its partial shell and preserves the working app', async () => {
  const old = worker();
  await old.event('install');
  const fixture = fixtures();
  fixture.config.appVersion = 'app-2';
  fixture.files.set(origin + '/ha/index.html', Buffer.from('another deployment'));
  const next = worker(fixture, old.caches, true, true);
  await assert.rejects(next.event('install'), /another release/);
  assert.ok(!(await next.caches.keys()).includes('human-atlas:/ha/:app:app-2'));
  old.environment.online = false;
  assert.equal(await (await old.get('/ha/', 'navigate')).text(), '<html>atlas</html>');
});

test('an update with incomplete new anatomy cannot replace a usable offline release', async () => {
  const old = worker();
  await old.event('install');
  await old.send('prepare');
  const fixture = fixtures();
  fixture.config.appVersion = 'app-2';
  fixture.config.modelVersion = 'models-2';
  const next = worker(fixture, old.caches, true, true);
  next.environment.beforeFetch = (url) => url.endsWith('.gz') ? new Response(null, { status: 503 }) : undefined;
  await assert.rejects(next.event('install'), /could not be saved offline/);
  assert.equal(next.environment.skip, 0);
  assert.ok(!(await next.caches.keys()).includes('human-atlas:/ha/:app:app-2'));
  old.environment.online = false;
  for (const chunk of old.config.chunks) assert.ok(await old.get(chunk.gzip.url));
  assert.equal((await old.status()).ready, true);
});

test('preparing again repairs missing cached app files', async () => {
  const w = worker();
  await w.event('install');
  await w.send('prepare');
  await w.caches.delete('human-atlas:/ha/:app:app-1');
  assert.equal((await w.status()).ready, false);
  await w.send('prepare');
  assert.equal((await w.status()).ready, true);
});
