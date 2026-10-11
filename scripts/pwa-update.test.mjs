import assert from 'node:assert/strict';
import test from 'node:test';
import { findAppUpdate } from '../app/pwa-update.ts';

class Worker extends EventTarget {
  state = 'installing';
  listeners = new Set();
  addEventListener(type, listener) { this.listeners.add(listener); super.addEventListener(type, listener); }
  removeEventListener(type, listener) { this.listeners.delete(listener); super.removeEventListener(type, listener); }
  change(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
const registration = () => ({
  waiting: null, installing: null, checks: 0,
  async update() { this.checks++; return this; },
});

test('a manual check with no new release reports no update', async () => {
  const value = registration();
  assert.equal(await findAppUpdate(value, () => assert.fail('No new version to prepare')), null);
  assert.equal(value.checks, 1);
});

test('a prepared update can be used immediately without another network check', async () => {
  const value = registration(), worker = new Worker();
  worker.state = 'installed';
  value.waiting = worker;
  assert.equal(await findAppUpdate(value, () => assert.fail('Already prepared')), worker);
  assert.equal(value.checks, 0);
});

test('checking waits for the new offline copy to finish, rather than just the update request', async () => {
  const value = registration(), worker = new Worker();
  value.update = async () => { value.checks++; value.installing = worker; return value; };
  let preparing = false, finished = false;
  const finding = findAppUpdate(value, () => { preparing = true; }).then((result) => { finished = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(preparing, true);
  assert.equal(finished, false);
  value.waiting = worker;
  value.installing = null;
  worker.change('installed');
  assert.equal(await finding, worker);
  assert.equal(worker.listeners.size, 0);
});

test('an update already downloading is awaited without starting a duplicate check', async () => {
  const value = registration(), worker = new Worker();
  value.installing = worker;
  const finding = findAppUpdate(value, () => {});
  value.waiting = worker;
  value.installing = null;
  worker.change('installed');
  assert.equal(await finding, worker);
  assert.equal(value.checks, 0);
});

test('a connection failure rejects the check without pretending the app is current', async () => {
  const value = registration();
  value.update = async () => { throw new TypeError('Offline'); };
  await assert.rejects(findAppUpdate(value, () => {}), /Offline/);
});

test('a failed installation rejects the check and removes its listener', async () => {
  const value = registration(), worker = new Worker();
  value.installing = worker;
  const finding = findAppUpdate(value, () => {});
  worker.change('redundant');
  await assert.rejects(finding, /could not be prepared/);
  assert.equal(worker.listeners.size, 0);
});
