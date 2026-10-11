import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assetUrl} from '../app/asset-url.ts';
import {decodeModelResponse} from '../app/model-download.ts';

const atlases=await Promise.all(['atlas.json','atlas-female.json'].map(file=>readFile(new URL(`../public/models/${file}`,import.meta.url)).then(JSON.parse)));
const atlas=atlases[0];
for (const atlas of atlases) {
for(const base of ['/', '/ha/', '/renamed-fork/']) {
  const catalogue=new URL(assetUrl('/models/atlas.json',base),'https://example.github.io');
  assert.equal(catalogue.pathname,`${base}models/atlas.json`);
  for(const chunk of atlas.chunks) for(const path of [chunk.url,chunk.gzip]) {
    const url=new URL(assetUrl(path,base),catalogue);
    assert.equal(url.pathname,`${base}models/${path.split('/').pop()}`);
    assert.equal(assetUrl(path,base),assetUrl(path.slice(1),base));
  }
}
}

const chunk=atlas.chunks[0];
const raw=await readFile(new URL(`../public${chunk.url}`,import.meta.url));
const gzip=await readFile(new URL(`../public${chunk.gzip}`,import.meta.url));
for(const [payload,compressed] of [[gzip,true],[raw,true],[raw,false]]) {
  const decoded=await decodeModelResponse(new Response(payload),chunk.bytes,compressed);
  assert.deepEqual(new Uint8Array(decoded),new Uint8Array(raw));
}
await assert.rejects(decodeModelResponse(new Response(null,{status:404}),chunk.bytes,true),/could not be loaded/);
await assert.rejects(decodeModelResponse(new Response(raw.subarray(0,10)),chunk.bytes,false),/incomplete/);
console.log('Root and Pages subpath URLs, gzip files, decoded responses, and download errors passed.');
