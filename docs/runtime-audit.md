# Runtime stability and efficiency audit

Date: 13 October 2026. Baseline: `5ddac38` (0.6.1).

The audit covered the React interface, scene lifecycle, navigation, loading and cancellation, geometry/material ownership, frame scheduling, local persistence, offline worker, build/CI configuration, dependency audit, and geometry tooling. Both shipped catalogues and their binary assets were validated. Source anatomy was not regenerated or changed.

## Findings corrected

| Finding | Correction and evidence |
| --- | --- |
| **High: switching models retained previous geometry.** OrbitControls attached keyboard listeners to the document, but React's passive effect cleanup ran after the canvas host was detached. Its `getRootNode()` cleanup then targeted the detached host. | Move scene ownership to a layout effect, which disposes controls before removal. A heap snapshot traced the retaining path from document listeners through OrbitControls and its change callback to the old geometry arrays. Six model switches now retain one model's buffers. The browser regression checks memory and document keyboard-listener counts. |
| **Failed loading kept a partial scene alive.** Error UI appeared while GPU resources and controls remained mounted. | Unmount the scene on error. Injected download failure and WebGL context loss now remove the canvas and release the context; switching models or reloading recovers. |
| **Locate accumulated individual GPU geometry during exploration.** Previously inspected pieces stayed uploaded alongside the batched scene. This was bounded by the model, but increased its working set. | Dispose the previous highlight's GPU geometry when the selection changes or closes. CPU geometry remains available for picking. Heart, brain and liver inspection checks return the live buffer count to baseline. |
| **Large displays could allocate excessive drawing buffers.** A DPR limit of 2 still permits 33.2 million pixels at a 3840×2160 CSS viewport. The renderer also always requested the high-performance GPU. | Bound the scene to four million pixels and use the browser's default GPU preference. Keep the existing mobile density limit. The 3D view may be less sharp on very large displays; interface text remains native resolution. |
| **Unnecessary scene and interface work.** Rotation continued with no visible geometry; reduced-motion users still received the exploded-layout animation; visibility counts were recomputed on unrelated renders. | Stop rotation work while loading or empty, apply reduced motion to explosion, and memoize counts with set-based selection lookups. Idle, hidden and empty-scene browser checks observe no continued animation callbacks or draws after settling. |
| **Opacity handles disappeared after Systems was hidden and reopened.** Hidden controls could retain an undefined measured position, including after resizing. | Unmount expanded controls while the panel is closed and recreate them on reopening. Keep expansion/filter state. Chromium and WebKit checks exercise repeated reopening and keyboard adjustment across five viewport sizes. |
| **The male source converter omitted `sex`.** Its output no longer matched the viewer's required catalogue identity. | Emit `sex: 'male'`. An isolated synthetic conversion covering all classification overrides passes the actual runtime catalogue validator. All Python scripts also parse successfully. Full source registration pipelines were not rerun. |

## Memory measurements

Production build, Microsoft Edge (Chromium) on Windows, 1280×900 CSS viewport, DPR 2. Force garbage collection before samples; alternate female/male six times, ending with male. Repeat without rendering instrumentation to confirm the baseline leak. Values below use decimal MB and describe JavaScript/array-buffer memory, not total process RAM or VRAM.

| Measurement | Before | After scene cleanup fix |
| --- | ---: | ---: |
| Initial array-buffer backing storage | 174.8 MB | 174.8 MB |
| Backing storage after six switches | 1,252.9 MB | 174.8 MB |
| JavaScript heap after six switches | 68.0 MB | 17.9 MB |
| Backing storage after simulated context loss | 1,252.9 MB | 1.1 MB |
| Canvas remaining after failed model download | 1 | 0 |

The female working set was about 186.8 MB of array-buffer storage after the fix. No continuing scene rendering was observed during settled idle or hidden-tab measurement windows. Hidden-tab automation dispatches visibility changes deterministically because headless tabs do not behave like real background windows.

## Reproducible checks

```sh
npm ci
npm run check
npm run lint
npm test
npx playwright install chromium webkit
npm run test:browser
npm audit
```

The browser suite builds the app under `/ha/`, uses one worker, and covers repeated model switching, idle/hidden/empty rendering, failure recovery, Locate buffer disposal, WebGL unavailability, responsive search/inspection/layers, and both models with the origin server stopped. Viewports: 320×568, 390×844, 844×390, 1280×900 and 3840×2160. CDP heap measurements run only in Chromium; that test is explicitly skipped in WebKit. Chromium also uses browser offline mode. WebKit uses the stopped-origin test because the pinned automation version has a [known offline-emulation navigation issue](https://github.com/microsoft/playwright/issues/42775).

The repository validation passes 115 Node tests plus catalogue, binary, interaction, and asset checks. The final browser run passes 15 checks across Chromium and WebKit, with the Chromium-only memory check explicitly skipped in WebKit. Type checking, lint and the production PWA build pass. The dependency audit reports zero known vulnerabilities at the time of this audit. CI now runs Chromium runtime checks before rebuilding for the actual deployment base path.

## Remaining limits

- These measurements demonstrate that the reproduced retention bug is fixed; they cannot prove the absence of every possible leak or browser-driver failure. Longer sessions and physical low-memory devices remain useful follow-up coverage.
- Physical iOS/Android multitouch, GPU thermals and battery draw in watts were not measured. The pixel budget and idle checks reduce known sources of work; no battery-life percentage is claimed. Automatic rotation intentionally keeps rendering while enabled and visible.
- A loaded model still needs substantial memory for CPU picking data and GPU batches. First-use offline preparation saves both models, about 78.5 MB compressed, and uses network/CPU resources until complete.
- The main production JavaScript bundle is about 1.11 MB (317 KB gzip), and Vite still reports its size warning. Slow-network startup and long-task profiling on low-end hardware remain performance work beyond the verified lifecycle fixes.
