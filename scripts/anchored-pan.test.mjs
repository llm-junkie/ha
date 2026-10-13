import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { anchorPan } from "../app/anchored-pan.ts";
import { createWheelZoom } from "../app/wheel-zoom.ts";
import { captureCameraPose, restoreCameraPose } from "../app/camera-pose.ts";

class Canvas extends EventTarget {
  style = {};
  clientWidth = 1000;
  clientHeight = 800;
  ownerDocument = new EventTarget();
  getRootNode() { return this.ownerDocument; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

const near = (a, b) => assert(a.distanceTo(b) < 1e-8, `distance ${a.distanceTo(b)}`);
const screen = ({ controls, camera }) => {
  camera.updateMatrixWorld();
  const p = controls.target.clone().project(camera);
  return new T.Vector2((p.x + 1) * 500, (1 - p.y) * 400);
};
const settle = (controls) => { for (let i = 0; i < 320; i++) controls.update(1 / 60); };
const pointer = (type, button, x, y, extra = {}) => Object.assign(new Event(type), {
  pointerId: 1, pointerType: "mouse", button, clientX: x, clientY: y, pageX: x, pageY: y, ...extra,
});
function drag({ canvas, controls }, button, dx, dy, extra) {
  canvas.dispatchEvent(pointer("pointerdown", button, 500, 400, extra));
  canvas.ownerDocument.dispatchEvent(pointer("pointermove", button, 500 + dx, 400 + dy, extra));
  canvas.ownerDocument.dispatchEvent(pointer("pointerup", button, 500 + dx, 400 + dy, extra));
  settle(controls);
}
function make(t, offset = false) {
  const canvas = new Canvas();
  const camera = new T.PerspectiveCamera(34, 1.25, 0.005, 100);
  const controls = new OrbitControls(camera, canvas);
  const release = anchorPan(controls, camera, canvas);
  controls.target.set(0.3, 1.2, -0.4);
  camera.position.copy(controls.target).add(new T.Vector3(1.4, 0.2, 3.6));
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  if (offset) camera.setViewOffset(1000, 800, 130, -80, 1000, 800);
  controls.update();
  t.after(() => { release(); controls.dispose(); });
  return { canvas, camera, controls };
}

test("right-drag moves framing by the pointer distance without moving the orbit center", (t) => {
  for (const offset of [false, true]) {
    const c = make(t, offset);
    const target = c.controls.target.clone(), position = c.camera.position.clone(), before = screen(c);
    drag(c, 2, 180, 80);
    near(c.controls.target, target);
    near(c.camera.position, position);
    near(screen(c), before.clone().add(new T.Vector2(180, 80)));
    const after = screen(c);
    drag(c, 0, 170, 30);
    assert(c.camera.position.distanceTo(position) > 0.1);
    near(c.controls.target, target);
    near(screen(c), after);
    const resting = c.camera.position.clone();
    settle(c.controls);
    near(c.camera.position, resting);
    near(screen(c), after);
  }
});

test("panning finishes its full distance and becomes idle with demand-driven rendering", (t) => {
  const c = make(t);
  const before = screen(c), target = c.controls.target.clone();
  let pending = false, frames = 0;
  c.controls.addEventListener("change", () => { pending = true; });
  c.canvas.dispatchEvent(pointer("pointerdown", 2, 500, 400));
  c.canvas.ownerDocument.dispatchEvent(pointer("pointermove", 2, 640, 460));
  c.canvas.ownerDocument.dispatchEvent(pointer("pointerup", 2, 640, 460));
  while (pending && frames < 500) {
    pending = false;
    c.controls.update(1 / 60);
    frames++;
  }
  assert(frames > 0 && frames < 500);
  assert.equal(pending, false);
  assert(screen(c).distanceTo(before.add(new T.Vector2(140, 60))) < 0.03);
  near(c.controls.target, target);
});

test("repeated pans, zoom and automatic rotation retain the anchor and screen placement", (t) => {
  const c = make(t, true);
  const target = c.controls.target.clone(), before = screen(c);
  for (let n = 0; n < 8; n++) { drag(c, 2, 75, -35); drag(c, 2, -75, 35); }
  near(c.controls.target, target);
  near(screen(c), before);
  drag(c, 2, 90, 60);
  const panned = screen(c);
  const wheel = createWheelZoom({ ...c, ready: () => true, onZoom: () => {} });
  for (const deltaY of [-180, 180]) {
    wheel({ deltaY, deltaMode: 0, ctrlKey: false, clientX: 900, clientY: 700, preventDefault() {}, stopImmediatePropagation() {} });
    c.controls.update();
    near(c.controls.target, target);
    near(screen(c), panned);
  }
  c.controls.autoRotate = true;
  settle(c.controls);
  near(c.controls.target, target);
  near(screen(c), panned);
});

test("Locate can assign a new anchor and saved views restore panning around that anchor", (t) => {
  const c = make(t);
  drag(c, 2, 100, 50);
  const located = new T.Vector3(-0.8, 1.9, 0.4);
  c.camera.position.copy(located).add(new T.Vector3(0, 0.1, 0.7));
  c.controls.target.copy(located);
  c.camera.setViewOffset(1000, 800, 140, -20, 1000, 800);
  c.controls.update();
  drag(c, 2, -60, 35);
  near(c.controls.target, located);
  const panned = screen(c);
  const pose = captureCameraPose(c.camera, c.controls.target, 1000, 800);
  const restored = make(t);
  restoreCameraPose(restored.camera, restored.controls.target, pose, 1000, 800);
  restored.controls.update();
  near(restored.controls.target, located);
  near(screen(restored), panned);
  drag(restored, 0, 60, 10);
  near(restored.controls.target, located);
  near(screen(restored), panned);
});

test("inventory and modifier-key panning use the same fixed anchor", (t) => {
  for (const inventory of [false, true]) {
    const c = make(t);
    if (inventory) c.controls.mouseButtons.LEFT = T.MOUSE.PAN;
    const target = c.controls.target.clone(), before = screen(c);
    drag(c, 0, -120, 45, inventory ? {} : { shiftKey: true });
    near(c.controls.target, target);
    near(screen(c), before.clone().add(new T.Vector2(-120, 45)));
  }
});

test("touch panning and pinch gestures retain the rotation center", (t) => {
  const c = make(t, true);
  const target = c.controls.target.clone(), before = screen(c);
  c.controls.touches.ONE = T.TOUCH.PAN;
  drag(c, 0, 75, 30, { pointerType: "touch" });
  near(c.controls.target, target);
  near(screen(c), before.clone().add(new T.Vector2(75, 30)));
  const touch = (type, id, x, y) => pointer(type, 0, x, y, { pointerType: "touch", pointerId: id });
  c.canvas.dispatchEvent(touch("pointerdown", 1, 400, 400));
  c.canvas.dispatchEvent(touch("pointerdown", 2, 600, 400));
  const distance = c.camera.position.distanceTo(target);
  c.canvas.ownerDocument.dispatchEvent(touch("pointermove", 1, 380, 440));
  near(c.controls.target, target);
  c.canvas.ownerDocument.dispatchEvent(touch("pointermove", 2, 680, 440));
  near(c.controls.target, target);
  c.canvas.ownerDocument.dispatchEvent(touch("pointerup", 1, 380, 440));
  c.canvas.ownerDocument.dispatchEvent(touch("pointerup", 2, 680, 440));
  settle(c.controls);
  assert(c.camera.position.distanceTo(target) < distance);
  near(c.controls.target, target);
  const panned = screen(c);
  c.controls.autoRotate = true;
  settle(c.controls);
  near(c.controls.target, target);
  near(screen(c), panned);
});
