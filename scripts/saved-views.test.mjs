import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import {
  captureSavedView,
  normalizeSavedView,
  readViewHash,
  shareViewUrl,
  viewHash,
  savedViewState,
  readBookmarks,
  writeBookmarks,
  SAVED_VIEWS_KEY,
  MAX_SAVED_VIEWS,
} from "../app/saved-views.ts";
import { layerOpacity, partOpacity } from "../app/layer-opacity.ts";
import { applyLayerOpacity, createAnatomyMaterial } from "../app/anatomy-material.ts";
import { captureCameraPose, restoreCameraPose } from "../app/camera-pose.ts";

const atlas = JSON.parse(fs.readFileSync(new URL("../public/models/atlas.json", import.meta.url)));
const first = atlas.parts[0],
  second = atlas.parts[1];
const state = {
  visible: ["skeletal", "muscular"],
  selected: [first.id],
  isolate: true,
  inspectorOpen: true,
  explode: 0.3,
  view: "back",
  rotate: true,
  reset: 9,
  focus: 2,
  focusContext: true,
  partVisibility: { [second.id]: false },
  opacity: { muscular: 0.2, skeletal: 0.7 },
  rotationSpeed: 3.5,
  rotationDirection: "counterclockwise",
};
const camera = { position: [2, 1.5, -3], target: [0.1, 0.8, 0.2], offset: [0.12, -0.08] };
const snapshot = () => captureSavedView(state, camera, "ATLAS:group:quadriceps");

test("sharing round-trips the camera, layers, overrides and selection under root and Pages paths", () => {
  const view = snapshot();
  for (const url of ["https://example.com/", "https://llm-junkie.github.io/ha/?test=1#old"]) {
    const link = new URL(shareViewUrl(url, view));
    assert.equal(link.pathname, new URL(url).pathname);
    assert.equal(link.searchParams.get("model"), "male");
    assert.equal(link.searchParams.get("test"), new URL(url).searchParams.get("test"));
    assert.deepEqual(readViewHash(link.hash, atlas), view);
  }
  assert(!viewHash(view).includes("+"));
  assert(!viewHash(view).includes("/"));
  const restored = savedViewState(view, 10);
  assert.equal(restored.rotate, false);
  assert.equal(restored.reset, 10);
  assert.equal(restored.focus, 1);
  assert.deepEqual(restored.camera, camera);
  assert(!("concept" in restored));
});

test("capture makes independent snapshots and accepts Unicode source references", () => {
  const view = snapshot();
  view.visible.push("cardiac");
  view.selected.push(second.id);
  view.camera.position[0] = 8;
  view.opacity.muscular = 0.8;
  view.partVisibility[second.id] = true;
  assert.deepEqual(state.visible, ["skeletal", "muscular"]);
  assert.deepEqual(state.selected, [first.id]);
  assert.equal(camera.position[0], 2);
  assert.equal(state.opacity.muscular, 0.2);
  assert.equal(state.partVisibility[second.id], false);
  const unicode = { ...snapshot(), concept: "構造 🫀" };
  assert.deepEqual(readViewHash(viewHash(unicode), atlas), unicode);
});

test("invalid, unsupported, oversized and impossible-camera links are ignored", () => {
  for (const hash of [
    "",
    "#other=x",
    "#view=invalid!",
    "#view=" + "a".repeat(100_001),
    "#view=" + btoa("{broken"),
  ])
    assert.equal(readViewHash(hash, atlas), null);
  for (const value of [
    null,
    [],
    {},
    { ...snapshot(), version: 2 },
    { ...snapshot(), camera: { ...camera, position: [Infinity, 1, 2] } },
    { ...snapshot(), camera: { ...camera, target: camera.position } },
    { ...snapshot(), camera: { ...camera, position: [1000, 1, 2] } },
  ])
    assert.equal(normalizeSavedView(value, atlas), null);
});

test("restoration filters obsolete IDs, preserves Hide all, and clamps numeric settings", () => {
  const view = normalizeSavedView(
    {
      ...snapshot(),
      selected: [first.id, first.id, "obsolete"],
      visible: ["skeletal", "unknown", "skeletal"],
      partVisibility: { [second.id]: false, obsolete: true, [first.id]: "yes" },
      opacity: { muscular: -10, skeletal: 50, cardiac: NaN, unknown: 0.3 },
      explode: 12,
      rotationSpeed: -3,
      camera: { ...camera, offset: [Infinity, 3] },
    },
    atlas,
  );
  assert.deepEqual(view.selected, [first.id]);
  assert.deepEqual(view.visible, ["skeletal"]);
  assert.deepEqual(view.partVisibility, { [second.id]: false });
  assert.deepEqual(view.opacity, { muscular: 0.05, skeletal: 1 });
  assert.equal(view.explode, 1);
  assert.equal(view.rotationSpeed, 1);
  assert.deepEqual(view.camera.offset, [0, 1]);
  const hidden = normalizeSavedView({ ...snapshot(), selected: [], visible: [] }, atlas);
  assert.deepEqual(hidden.visible, []);
  assert.equal(hidden.isolate, false);
  assert.equal(hidden.inspectorOpen, false);
});

test("bookmarks persist, deduplicate IDs, cap their size and reject damaged storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  const bookmark = { id: "one", name: "  Heart 🫀  ", view: snapshot() };
  assert(writeBookmarks(storage, [bookmark]));
  assert.equal(readBookmarks(storage, atlas)[0].name, "Heart 🫀");
  storage.setItem(
    SAVED_VIEWS_KEY,
    JSON.stringify([bookmark, bookmark, { ...bookmark, id: "two", view: {} }]),
  );
  assert.equal(readBookmarks(storage, atlas).length, 1);
  assert(
    writeBookmarks(
      storage,
      Array.from({ length: 40 }, (_, i) => ({ ...bookmark, id: String(i) })),
    ),
  );
  assert.equal(readBookmarks(storage, atlas).length, MAX_SAVED_VIEWS);
  for (const raw of ["broken", "null", "{}", "[null]", "x".repeat(2_000_001)]) {
    storage.setItem(SAVED_VIEWS_KEY, raw);
    assert.deepEqual(readBookmarks(storage, atlas), []);
  }
  assert.deepEqual(readBookmarks(undefined, atlas), []);
  assert.deepEqual(
    readBookmarks(
      {
        getItem: () => {
          throw new Error("blocked");
        },
      },
      atlas,
    ),
    [],
  );
  assert.equal(writeBookmarks(undefined, [bookmark]), false);
  assert.equal(
    writeBookmarks(
      {
        setItem: () => {
          throw new Error("quota");
        },
      },
      [bookmark],
    ),
    false,
  );
});

test("layer fading preserves selected structures and updates actual material render settings", () => {
  assert.equal(layerOpacity({}, "integumentary"), 0.2);
  assert.equal(layerOpacity({}, "muscular"), 1);
  assert.equal(layerOpacity({ opacity: { muscular: NaN } }, "muscular"), 1);
  assert.equal(partOpacity(first, state), 1);
  assert.equal(partOpacity({ ...second, system: "muscular" }, state), 0.2);
  const texture = new T.DataTexture();
  const material = createAnatomyMaterial("muscular", texture, texture, 1);
  const version = material.version;
  assert(applyLayerOpacity(material, 0.2));
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.opacity, 0.2);
  assert(material.version > version);
  const transparentVersion = material.version;
  assert(applyLayerOpacity(material, 0.3));
  assert.equal(material.version, transparentVersion);
  assert.equal(applyLayerOpacity(material, 0.3), false);
  assert(applyLayerOpacity(material, 1));
  assert.equal(material.transparent, false);
  assert.equal(material.depthWrite, true);
  material.dispose();
  texture.dispose();
});

test("camera restoration keeps arbitrary orbit, zoom, pan and inspector offsets", () => {
  const camera = new T.PerspectiveCamera(34, 1200 / 800, 0.005, 100);
  const target = new T.Vector3(0.1, 0.8, 0.2);
  camera.position.set(2, 1.5, -3);
  camera.setViewOffset(1200, 800, 144, -64, 1200, 800);
  camera.lookAt(target);
  const pose = captureCameraPose(camera, target, 1200, 800);
  assert.deepEqual(pose.viewport, [1200, 800]);
  const view = captureSavedView(state, pose);
  assert.deepEqual(readViewHash(viewHash(view), atlas), view);
  camera.position.set(1, 2, 4);
  target.set(0, 0, 0);
  restoreCameraPose(camera, target, pose, 1200, 800);
  assert.deepEqual(captureCameraPose(camera, target, 1200, 800), pose);
  camera.aspect = 320 / 568;
  restoreCameraPose(camera, target, pose, 320, 568);
  const direction = new T.Vector3().fromArray(pose.position).sub(target).normalize();
  assert(camera.position.clone().sub(target).normalize().distanceTo(direction) < 1e-12);
  assert(
    camera.position.distanceTo(target) >
      new T.Vector3().fromArray(pose.position).distanceTo(target),
  );
  assert.deepEqual(captureCameraPose(camera, target, 320, 568).offset, pose.offset);
  assert.deepEqual(pose.position, [2, 1.5, -3]);
});
