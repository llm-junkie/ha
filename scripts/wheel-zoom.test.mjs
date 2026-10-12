import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createWheelZoom } from "../app/wheel-zoom.ts";

const rect = { left: 30, top: 20, width: 1000, height: 800 };
const near = (a, b) => assert(a.distanceTo(b) < 1e-9, `distance ${a.distanceTo(b)}`);
const screenNear = (a, b) => assert(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9);

class Canvas extends EventTarget {
  style = {};
  clientWidth = rect.width;
  clientHeight = rect.height;
  ownerDocument = new EventTarget();
  getRootNode() { return this.ownerDocument; }
  getBoundingClientRect() { return rect; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

function make(t, options = {}) {
  const canvas = new Canvas();
  const target = new T.Vector3(...(options.target ?? [0, 0.85, 0]));
  const camera = new T.PerspectiveCamera(34, rect.width / rect.height, 0.005, 100);
  camera.position.copy(target).add(new T.Vector3(1.4, 0.2, 3.6));
  if (options.viewOffset) camera.setViewOffset(1000, 800, 130, -80, 1000, 800);
  const controls = new OrbitControls(camera, canvas);
  t.after(() => controls.dispose());
  controls.target.copy(target);
  controls.minDistance = 0.07;
  controls.maxDistance = 40;
  controls.zoomToCursor = false;
  Object.assign(controls, options.controls);
  controls.update();
  camera.updateMatrixWorld();
  let wakeCount = 0;
  const wheel = createWheelZoom({
    camera,
    controls,
    canvas: { getBoundingClientRect: () => options.rect ?? rect },
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
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...extra,
  });
  return { camera, controls, canvas, wheel, event, get wakeCount() { return wakeCount; } };
}

test("off-center scrolling keeps the orbit pivot and its screen position fixed, including inspector framing", (t) => {
  for (const viewOffset of [false, true]) {
    for (const [clientX, clientY] of [[100, 100], [950, 740], [530, 420]]) {
      const context = make(t, { viewOffset, target: [0.3, 1.2, -0.4] });
      const target = context.controls.target.clone();
      const before = target.clone().project(context.camera);
      const direction = context.camera.position.clone().sub(target).normalize();
      const distance = context.camera.position.distanceTo(target);
      const event = context.event(-100, { clientX, clientY });
      context.wheel(event);
      near(context.controls.target, target);
      screenNear(target.clone().project(context.camera), before);
      near(context.camera.position.clone().sub(target).normalize(), direction);
      assert(context.camera.position.distanceTo(target) < distance);
      assert(event.prevented && event.stopped);
      assert.equal(context.wakeCount, 1);
    }
  }
});

test("alternating wheel positions and zoom directions cannot accumulate model or pivot drift", (t) => {
  const context = make(t, { viewOffset: true });
  const target = context.controls.target.clone(), position = context.camera.position.clone();
  const center = target.clone().project(context.camera);
  for (let index = 0; index < 40; index++) {
    context.wheel(context.event(-120, { clientX: rect.left + 900, clientY: rect.top + 700 }));
    context.wheel(context.event(120, { clientX: rect.left + 100, clientY: rect.top + 100 }));
    context.controls.update();
    context.camera.updateMatrixWorld();
    near(context.controls.target, target);
    screenNear(target.clone().project(context.camera), center);
  }
  near(context.camera.position, position);
  assert.equal(context.wakeCount, 80);
});

test("mouse dragging after off-center wheel zoom still rotates around the model's fixed center", (t) => {
  const context = make(t, { controls: { enableDamping: true, dampingFactor: 0.085 } });
  const target = context.controls.target.clone(), center = target.clone().project(context.camera);
  context.wheel(context.event(-180, { clientX: rect.left + 900, clientY: rect.top + 700 }));
  const position = context.camera.position.clone(), distance = position.distanceTo(target);
  const pointer = (type, x, y) => Object.assign(new Event(type), {
    pointerId: 1, pointerType: "mouse", button: 0,
    clientX: x, clientY: y, pageX: x, pageY: y,
  });
  context.canvas.dispatchEvent(pointer("pointerdown", 530, 420));
  context.canvas.ownerDocument.dispatchEvent(pointer("pointermove", 710, 490));
  context.canvas.ownerDocument.dispatchEvent(pointer("pointerup", 710, 490));
  for (let index = 0; index < 160; index++) context.controls.update(1 / 60);
  context.camera.updateMatrixWorld();
  assert(context.camera.position.distanceTo(position) > 0.1);
  near(context.controls.target, target);
  screenNear(target.clone().project(context.camera), center);
  assert(Math.abs(context.camera.position.distanceTo(target) - distance) < 1e-9);
});

test("wheel pixel/line/page units and trackpad pinch produce consistent centered zoom", (t) => {
  const pixels = make(t), lines = make(t), pages = make(t), pinch = make(t);
  pixels.wheel(pixels.event(-80));
  lines.wheel(lines.event(-5, { deltaMode: 1 }));
  pages.wheel(pages.event(-0.1, { deltaMode: 2 }));
  pinch.wheel(pinch.event(-32, { ctrlKey: true }));
  for (const context of [lines, pages, pinch]) {
    near(context.camera.position, pixels.camera.position);
    near(context.controls.target, pixels.controls.target);
  }
});

test("wheel zoom honors distance limits without moving the orbit pivot", (t) => {
  const context = make(t, { controls: { minDistance: 3, maxDistance: 5 } });
  const target = context.controls.target.clone();
  for (let index = 0; index < 20; index++) context.wheel(context.event(-10000));
  assert(Math.abs(context.camera.position.distanceTo(target) - 3) < 1e-9);
  for (let index = 0; index < 20; index++) context.wheel(context.event(10000));
  assert(Math.abs(context.camera.position.distanceTo(target) - 5) < 1e-9);
  near(context.controls.target, target);
});

test("disabled controls, loading, invalid events, and empty canvases do not change the camera", (t) => {
  for (const options of [
    { controls: { enabled: false } }, { controls: { enableZoom: false } },
    { ready: false }, { rect: { ...rect, width: 0 } }, { rect: { ...rect, height: 0 } }, {},
  ]) {
    const context = make(t, options), before = context.camera.position.clone();
    const target = context.controls.target.clone();
    for (const delta of [0, NaN, Infinity]) context.wheel(context.event(delta));
    context.wheel(context.event(-100, { clientX: NaN }));
    context.wheel(context.event(-100, { clientY: Infinity }));
    if (Object.keys(options).length) context.wheel(context.event());
    near(context.camera.position, before);
    near(context.controls.target, target);
    assert.equal(context.wakeCount, 0);
  }
});
