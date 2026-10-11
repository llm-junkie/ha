import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createCursorZoom } from "../app/cursor-zoom.ts";

const rect = { left: 30, top: 20, width: 1000, height: 800 };
const near = (a, b) => assert(a.distanceTo(b) < 1e-9, `distance ${a.distanceTo(b)}`);
const screenNear = (a, b) => assert(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9);
function make(specs = [], options = {}) {
  const camera = new T.PerspectiveCamera(34, rect.width / rect.height, 0.005, 100);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  if (options.viewOffset) camera.setViewOffset(1000, 800, 130, -80, 1000, 800);
  camera.updateMatrixWorld();
  const controls = {
    enabled: true,
    enableZoom: true,
    zoomSpeed: 1,
    minDistance: 0.07,
    maxDistance: 40,
    target: new T.Vector3(),
    ...options.controls,
  };
  const atlas = {
    parts: specs.map((spec, index) => ({
      id: spec.id ?? String(index),
      system: spec.system ?? "muscular",
    })),
  };
  const bounds = specs.map(
    (spec) => new T.Box3(new T.Vector3(-1, -1, spec.z - 0.1), new T.Vector3(1, 1, spec.z + 0.1)),
  );
  const pickers = specs.map((spec) => {
    const geometry = new T.BoxGeometry(2, 2, 0.2);
    geometry.translate(0, 0, spec.z);
    const mesh = new T.Mesh(geometry);
    mesh.updateMatrixWorld();
    return mesh;
  });
  const renderedVisibility = new Float32Array(specs.length * 4);
  specs.forEach(
    (spec, index) => (renderedVisibility[index * 4 + 3] = spec.rendered === false ? 0 : 1),
  );
  let current = {
      visible: ["muscular", "integumentary"],
      selected: [],
      isolate: false,
      ...options.state,
    },
    wakeCount = 0;
  const wheel = createCursorZoom({
    camera,
    controls,
    canvas: { getBoundingClientRect: () => rect },
    atlas,
    pickers,
    bounds,
    renderedVisibility,
    state: () => current,
    ready: () => options.ready !== false,
    onZoom: () => wakeCount++,
  });
  const event = (deltaY = -100, extra = {}) => ({
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    clientX: rect.left + 650,
    clientY: rect.top + 330,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopImmediatePropagation() {
      this.stopped = true;
    },
    ...extra,
  });
  return {
    camera,
    controls,
    wheel,
    event,
    pickers,
    setState: (state) => (current = state),
    get wakeCount() {
      return wakeCount;
    },
  };
}

test("zoom retains the actual surface under the pointer, including inspector view offsets", () => {
  for (const viewOffset of [false, true]) {
    const context = make([{ z: 0 }], { viewOffset }),
      ray = new T.Raycaster();
    ray.setFromCamera(new T.Vector2(0.3, 0.175), context.camera);
    const hit = ray.intersectObject(context.pickers[0])[0];
    assert(hit);
    const before = hit.point.clone().project(context.camera),
      event = context.event();
    context.wheel(event);
    screenNear(hit.point.clone().project(context.camera), before);
    assert(event.prevented && event.stopped);
    assert.equal(context.wakeCount, 1);
  }
});

test("empty space zooms around the current target plane", () => {
  const context = make(),
    ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2(0.3, 0.175), context.camera);
  const anchor = ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), 0), new T.Vector3());
  const before = anchor.clone().project(context.camera);
  context.wheel(context.event(-120));
  screenNear(anchor.clone().project(context.camera), before);
});

test("hidden layers, individual overrides and isolation never anchor the zoom to invisible foreground", () => {
  for (const options of [
    { state: { visible: ["muscular"] } },
    { state: { partVisibility: { foreground: false } } },
    { state: { isolate: true, selected: ["back"] } },
    { rendered: false },
  ]) {
    const specs = [
      { id: "back", z: 0 },
      { id: "foreground", z: 1, system: "skeletal", rendered: options.rendered },
    ];
    const state = {
      visible: ["muscular", "skeletal"],
      selected: [],
      isolate: false,
      ...options.state,
    };
    const mixed = make(specs, { state }),
      baseline = make([{ id: "back", z: 0 }], { state });
    mixed.wheel(mixed.event());
    baseline.wheel(baseline.event());
    near(mixed.camera.position, baseline.camera.position);
  }
});

test("transparent body surface does not mask a solid target but works when it is alone", () => {
  const mixed = make([{ z: 0 }, { z: 1, system: "integumentary" }]),
    solid = make([{ z: 0 }]),
    skin = make([{ z: 1, system: "integumentary" }]);
  mixed.wheel(mixed.event());
  solid.wheel(solid.event());
  near(mixed.camera.position, solid.camera.position);
  skin.wheel(skin.event());
  assert(skin.camera.position.distanceTo(solid.camera.position) > 1e-3);
});

test("wheel pixel/line/page units and trackpad pinch produce consistent zoom", () => {
  const pixels = make(),
    lines = make(),
    pages = make(),
    pinch = make();
  pixels.wheel(pixels.event(-80));
  lines.wheel(lines.event(-5, { deltaMode: 1 }));
  pages.wheel(pages.event(-0.1, { deltaMode: 2 }));
  pinch.wheel(pinch.event(-32, { ctrlKey: true }));
  for (const context of [lines, pages, pinch])
    near(context.camera.position, pixels.camera.position);
});

test("zoom obeys distance limits and ignores disabled, unready and nonfinite input", () => {
  const limited = make([], { controls: { minDistance: 3, maxDistance: 5 } });
  for (let index = 0; index < 20; index++) limited.wheel(limited.event(-10000));
  assert(Math.abs(limited.camera.position.distanceTo(limited.controls.target) - 3) < 1e-9);
  for (let index = 0; index < 20; index++) limited.wheel(limited.event(10000));
  assert(Math.abs(limited.camera.position.distanceTo(limited.controls.target) - 5) < 1e-9);
  for (const options of [
    { controls: { enabled: false } },
    { controls: { enableZoom: false } },
    { ready: false },
    {},
  ]) {
    const context = make([], options),
      before = context.camera.position.clone();
    for (const delta of [0, NaN, Infinity]) context.wheel(context.event(delta));
    if (options.ready === false || options.controls) context.wheel(context.event());
    near(context.camera.position, before);
    assert.equal(context.wakeCount, 0);
  }
});
