import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SCENE_PIXELS, scenePixelRatio } from '../app/render-budget.ts';

test('scene resolution bounds GPU allocation on large and high-density screens', () => {
  for (const [width, height, deviceRatio] of [[390, 844, 3], [844, 390, 3], [1280, 900, 2], [3840, 2160, 2], [5120, 2880, 2]]) {
    const ratio = scenePixelRatio(width, height, deviceRatio);
    assert(ratio > 0 && ratio <= deviceRatio);
    assert(Math.floor(width * ratio) * Math.floor(height * ratio) <= MAX_SCENE_PIXELS);
  }
  assert.equal(scenePixelRatio(390, 844, 3), 1.5);
  assert.equal(scenePixelRatio(1280, 900, 1), 1);
});

test('hidden or invalid viewport sizes cannot produce an invalid pixel ratio', () => {
  for (const [width, height, ratio] of [[0, 900, 2], [900, 0, 2], [NaN, 900, 2], [900, Infinity, 2], [900, 900, NaN], [900, 900, 0]]) {
    assert.equal(scenePixelRatio(width, height, ratio), 1);
  }
});
