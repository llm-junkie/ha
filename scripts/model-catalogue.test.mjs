import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isModelAtlas } from '../app/model-catalogue.ts';

const male = JSON.parse(await readFile(new URL('../public/models/atlas.json', import.meta.url)));
const female = JSON.parse(await readFile(new URL('../public/models/atlas-female.json', import.meta.url)));

test('both shipped catalogues pass runtime validation', () => {
  assert(isModelAtlas(male, 'male'));
  assert(isModelAtlas(female, 'female'));
});

test('malformed catalogues are rejected before reaching React and WebGL', () => {
  const cases = [
    (a) => { a.parts[0] = null; },
    (a) => { delete a.parts[0].name; },
    (a) => { a.parts[0].system = 'unknown'; },
    (a) => { a.parts[0].chunk = a.chunks.length; },
    (a) => { a.parts[0].positions = 1; },
    (a) => { a.parts[0].normals = -2; },
    (a) => { a.parts[0].indices = a.chunks[0].bytes; },
    (a) => { a.parts[0].vertexCount = Number.MAX_SAFE_INTEGER; },
    (a) => { a.parts[0].indexCount = 4; },
    (a) => { a.parts[0].bounds[0][0] = NaN; },
    (a) => { a.parts[0].bounds = [[1, 1, 1], [0, 0, 0]]; },
    (a) => { a.parts[1].id = a.parts[0].id; },
    (a) => { a.concepts[0].elements = ['missing-part']; },
    (a) => { a.concepts[0].elements = null; },
    (a) => { a.concepts[1].id = a.concepts[0].id; },
    (a) => { a.chunks[0].url = 'https://example.com/model.bin'; },
    (a) => { a.chunks[0].gzip = '/models/../other.bin.gz'; },
    (a) => { a.chunks[0].bytes = 0; },
    (a) => { a.triangles++; },
  ];
  for (const damage of cases) {
    const atlas = structuredClone(male);
    damage(atlas);
    assert.equal(isModelAtlas(atlas, 'male'), false, damage.toString());
  }
});
