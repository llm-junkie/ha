import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const read = (path) => readFile(new URL(path, dist));
const manifest = JSON.parse(await read('manifest.webmanifest'));
const source = (await read('sw.js')).toString();
const config = JSON.parse(source.split('\n')[0].slice('const CONFIG = '.length, -1));
const base = config.base;
assert.match(base, /^\/(?:[^/]+\/)*$/);
for (const key of ['id', 'start_url', 'scope']) assert.equal(manifest[key], base);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.name, 'Human Atlas');
const html = (await read('index.html')).toString();
assert.ok(html.includes(`href="${base}manifest.webmanifest"`));
assert.ok(html.includes(`href="${base}icons/apple-touch-icon.png"`));
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const png = await read(`icons/${name}`);
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}
assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'));
const catalogue = JSON.parse(await read('models/atlas.json'));
assert.equal(config.chunks.length, catalogue.chunks.length);
assert.equal(config.catalogue.url, `${base}models/atlas.json`);
for (const entry of [config.catalogue, ...config.shell, ...config.chunks.flatMap(({ raw, gzip }) => gzip ? [raw, gzip] : [raw])]) {
  assert.ok(entry.url.startsWith(base));
  const body = await read(entry.url.slice(base.length));
  const hash = createHash('sha256').update(body).digest('hex');
  assert.ok(entry.hashes.includes(hash), `Cached content hash matches ${entry.url}`);
}
for (let i = 0; i < catalogue.chunks.length; i++) {
  assert.equal(config.chunks[i].raw.url, base + catalogue.chunks[i].url.slice(1));
  assert.equal(config.chunks[i].gzip.url, base + catalogue.chunks[i].gzip.slice(1));
  assert.ok(config.chunks[i].gzip.hashes.includes(config.chunks[i].raw.hashes[0]));
}
assert.ok(config.shell.some(({ url }) => url === `${base}index.html`));
assert.ok(config.shell.some(({ url }) => url.endsWith('ATTRIBUTION.md')));
assert.ok(config.shell.some(({ url }) => url.endsWith('.js')));
assert.ok(config.shell.some(({ url }) => url.endsWith('.css')));
assert.ok(config.shell.every(({ url }) => !url.includes('/models/')));
console.log(`PWA build validated: ${base} scope, icons, app files and ${config.chunks.length} versioned model chunks.`);
