import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModelChunks } from '../app/model-download.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('model loading limits concurrent chunks and processes each chunk once', async () => {
  let active = 0, peak = 0;
  const loaded = [];
  await loadModelChunks(10, async (index) => {
    peak = Math.max(peak, ++active);
    await tick();
    loaded.push(index);
    active--;
  }, new AbortController().signal);
  assert.equal(peak, 3);
  assert.deepEqual(loaded.sort((a, b) => a - b), Array.from({ length: 10 }, (_, i) => i));
});

test('one failed chunk cancels in-flight siblings and stops the remaining queue', async () => {
  const started = [], cancelled = [];
  const failure = new Error('Incomplete model');
  await assert.rejects(loadModelChunks(20, async (index, signal) => {
    started.push(index);
    if (index === 0) { await tick(); throw failure; }
    await new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      cancelled.push(index);
      reject(signal.reason);
    }, { once: true }));
  }, new AbortController().signal), (error) => error === failure);
  assert.deepEqual(started, [0, 1, 2]);
  assert.deepEqual(cancelled, [1, 2]);
});

test('switching models aborts active requests and cannot complete the old model', async () => {
  const parent = new AbortController();
  const started = [];
  const loading = loadModelChunks(20, async (index, signal) => {
    started.push(index);
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
  }, parent.signal);
  parent.abort();
  await assert.rejects(loading, { name: 'AbortError' });
  assert.deepEqual(started, [0, 1, 2]);
  await assert.rejects(loadModelChunks(20, async () => assert.fail('Started after abort'), parent.signal), { name: 'AbortError' });
});
