import { test, expect } from '@playwright/test';
import { preview } from 'vite';

async function ready(page) {
  // Loading and the first software-rendered frame can exceed an ordinary UI wait.
  // Surface an actual viewer error immediately instead of timing out on Share.
  const outcome = await page.waitForFunction(() => {
    const error = document.querySelector('.loading[role="alert"]');
    if (error) return error.textContent;
    const share = document.querySelector('button[aria-label="Share current view"]');
    return share && !share.disabled && !document.querySelector('.loading') ? 'ready' : null;
  }, null, { timeout: process.env.CI ? 120_000 : 30_000 });
  try {
    expect(await outcome.jsonValue(), 'The viewer should finish loading without an error').toBe('ready');
  } finally {
    await outcome.dispose();
  }
  await expect(page.getByRole('button', { name: 'Share current view', exact: true })).toBeEnabled();
  await expect(page.locator('.loading')).toHaveCount(0);
}

// Instrument without retaining canvases, contexts, GPU objects or scene closures.
function trackRendering() {
  const audit = window.__renderAudit = { frames: 0, draws: 0, contexts: [] };
  const request = window.requestAnimationFrame;
  window.requestAnimationFrame = callback => request.call(window, time => { audit.frames++; callback(time); });
  const getContext = HTMLCanvasElement.prototype.getContext;
  const seen = new WeakSet();
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = getContext.apply(this, args);
    if (!gl || args[0] !== 'webgl2' || seen.has(gl)) return gl;
    seen.add(gl);
    const record = { lost: false, buffers: 0 };
    audit.contexts.push(record);
    this.addEventListener('webglcontextlost', () => { record.lost = true; });
    const live = new WeakSet(), create = gl.createBuffer, remove = gl.deleteBuffer;
    gl.createBuffer = function () {
      const buffer = create.call(this);
      if (buffer) { live.add(buffer); record.buffers++; }
      return buffer;
    };
    gl.deleteBuffer = function (buffer) {
      if (buffer && live.has(buffer)) { live.delete(buffer); record.buffers--; }
      return remove.call(this, buffer);
    };
    for (const method of ['drawArrays', 'drawElements']) {
      const draw = gl[method];
      gl[method] = function (...values) { audit.draws++; return draw.apply(this, values); };
    }
    return gl;
  };
}

async function assertIdle(page) {
  // Allow camera damping and UI transitions to finish, then require a quiet window.
  // Software rendering can delay the last queued callback beyond a fixed sleep.
  await page.waitForTimeout(1800);
  await expect(async () => {
    const before = await page.evaluate(() => ({ frames: window.__renderAudit.frames, draws: window.__renderAudit.draws }));
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => ({ frames: window.__renderAudit.frames, draws: window.__renderAudit.draws }))).toEqual(before);
  }).toPass({ timeout: 30_000, intervals: [500] });
}

test('model switching releases old geometry and document listeners', async ({ page, context, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Heap and document-listener checks require Chromium CDP.');
  await page.addInitScript(trackRendering);
  await page.goto('./');
  await ready(page);
  const cdp = await context.newCDPSession(page);
  const samples = [];
  const sample = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const heap = await cdp.send('Runtime.getHeapUsage');
    const listeners = await cdp.send('Runtime.evaluate', { expression: '(getEventListeners(document).keydown || []).length', includeCommandLineAPI: true, returnByValue: true });
    return { ...heap, keydownListeners: listeners.result.value };
  };
  samples.push(await sample());
  for (let index = 0; index < 6; index++) {
    const model = index % 2 ? 'Male' : 'Female';
    await page.locator(`.model-option[title^="${model} model"]`).click();
    await ready(page);
    samples.push(await sample());
    expect(await page.locator('canvas').count()).toBe(1);
    expect(await page.evaluate(() => window.__renderAudit.contexts.filter(c => !c.lost).length)).toBe(1);
  }
  const first = samples[0], last = samples.at(-1);
  // A lost scene retained ~174 MB per switch. Allow normal browser/UI warm-up,
  // but never another complete model in backing storage or the JavaScript heap.
  expect(last.backingStorageSize).toBeLessThan(first.backingStorageSize + 24_000_000);
  expect(last.usedSize).toBeLessThan(first.usedSize + 10_000_000);
  for (const entry of samples) expect(entry.keydownListeners).toBe(first.keydownListeners);
  await testInfo.attach('memory-samples', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
  await assertIdle(page);
});

test('idle, hidden and empty scenes stop drawing and wake on interaction', async ({ page }) => {
  await page.addInitScript(trackRendering);
  await page.goto('./');
  await ready(page);
  await assertIdle(page);
  await page.getByRole('button', { name: 'Rotate body', exact: true }).click();
  const rotating = await page.evaluate(() => window.__renderAudit.draws);
  await expect.poll(() => page.evaluate(() => window.__renderAudit.draws)).toBeGreaterThan(rotating);
  // Deterministic visibility event; headless engines do not hide background tabs.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await assertIdle(page);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  const resumed = await page.evaluate(() => window.__renderAudit.draws);
  await expect.poll(() => page.evaluate(() => window.__renderAudit.draws)).toBeGreaterThan(resumed);
  await page.getByRole('button', { name: 'Hide all', exact: true }).click();
  await assertIdle(page);
});

test('a failed chunk frees the partial scene and another model remains usable', async ({ page }) => {
  await page.addInitScript(trackRendering);
  await page.route('**/models/body-4.bin.gz', async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({ status: 503, body: 'Unavailable for this regression test' });
  });
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('could not be loaded');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__renderAudit.contexts.every(c => c.lost))).toBe(true);
  await page.locator('.model-option[title^="Female model"]').click();
  await ready(page);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('a lost WebGL context releases the scene and reload recovers', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.evaluate(() => document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(page.getByRole('alert')).toContainText('paused by your device');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reload viewer', exact: true }).click();
  await ready(page);
});

test('Locate releases individual GPU buffers when the selection closes', async ({ page }) => {
  await page.addInitScript(trackRendering);
  await page.goto('./');
  await ready(page);
  const buffers = () => page.evaluate(() => window.__renderAudit.contexts.at(-1).buffers);
  const baseline = await buffers();
  for (const name of ['heart', 'brain', 'liver']) {
    await page.getByRole('button', { name: 'Search anatomy', exact: true }).click();
    await page.getByRole('combobox').fill(name);
    await page.getByRole('option', { name: new RegExp(`^${name} \\d+ pieces?$`, 'i') }).click();
    await page.getByRole('button', { name: 'Locate structure', exact: true }).click();
    await expect.poll(buffers).toBeGreaterThan(baseline);
    await page.locator('.detail-sheet').getByRole('button', { name: 'Close', exact: true }).click();
    await expect.poll(buffers).toBe(baseline);
  }
});

test('phone and desktop search, inspection, layers and pixel budget remain usable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await ready(page);
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900], [3840, 2160]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Search anatomy', exact: true }).click();
    await page.getByRole('combobox').fill('heart');
    await page.getByRole('option', { name: /^heart \d+ pieces?$/i }).click();
    await page.getByRole('button', { name: 'Locate structure', exact: true }).click();
    await page.getByRole('button', { name: 'Isolate structure', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show surrounding anatomy', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Show surrounding anatomy', exact: true }).click();
    await page.locator('.detail-sheet').getByRole('button', { name: 'Close', exact: true }).click();
    const browse = page.getByRole('button', { name: 'Browse body surface structures', exact: true });
    if (!await browse.isVisible()) await page.getByRole('button', { name: /Open system layers|Pin systems panel/ }).click();
    if (await browse.getAttribute('aria-expanded') !== 'true') await browse.click();
    const opacity = page.getByRole('slider', { name: 'Body surface opacity', exact: true });
    await opacity.focus();
    await opacity.press('ArrowRight');
    await expect(opacity).toHaveAttribute('aria-valuenow', '25');
    await page.getByRole('button', { name: 'Close systems', exact: true }).click();
    await page.getByRole('button', { name: 'Assemble and reset', exact: true }).click();
    const pixels = await page.locator('canvas').evaluate(c => c.width * c.height);
    expect(pixels).toBeLessThanOrEqual(4_000_000);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('WebGL startup failure leaves accessible recovery controls', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      return args[0] === 'webgl2' ? null : getContext.apply(this, args);
    };
  });
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('could not start the 3D viewer');
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload viewer', exact: true })).toBeEnabled();
});

test('both saved models reopen when the origin server is unavailable', async ({ browser, browserName, contextOptions }) => {
  // Use a dedicated origin so it can be stopped without disturbing other tests.
  // Frozen WebKit builds reject SW navigation with setOffline(true):
  // https://github.com/microsoft/playwright/issues/42775
  const server = await preview({ base: '/ha/', preview: { host: '127.0.0.1', port: 0, strictPort: true } });
  const stop = () => new Promise((resolve, reject) => {
    if (!server.httpServer.listening) return resolve();
    server.httpServer.close(error => error ? reject(error) : resolve());
    server.httpServer.closeAllConnections();
  });
  const baseURL = `http://127.0.0.1:${server.httpServer.address().port}/ha/`;
  const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'allow', baseURL });
  try {
    const page = await context.newPage();
    await page.goto('./');
    await ready(page);
    await page.getByRole('button', { name: 'About this atlas', exact: true }).click();
    await expect(page.locator('.pwa-offline')).toContainText('Ready offline', { timeout: 90_000 });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await stop();
    if (browserName === 'chromium') await context.setOffline(true);
    const response = await page.reload();
    expect(response.fromServiceWorker()).toBe(true);
    await ready(page);
    await page.locator('.model-option[title^="Female model"]').click();
    await ready(page);
    await expect(page.locator('.identity-meta')).toContainText('2,456');
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await context.close();
    await stop();
  }
});
