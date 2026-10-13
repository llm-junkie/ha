import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as T from "three";
import { buildSearchConcepts, matchesAnatomySearch } from "../app/anatomy-search.ts";
import { partIsVisible } from "../app/part-visibility.ts";
import { systemStructures, clearStructureOverrides } from "../app/structure-layers.ts";
import { readRecentStructures, rememberStructure } from "../app/recent-structures.ts";
import { updateDrawBatches } from "../app/draw-batches.ts";
import { createFrameScheduler } from "../app/frame-scheduler.ts";
import { atlasTools } from "../app/agent-tools.ts";

const atlas = JSON.parse(fs.readFileSync(new URL("../public/models/atlas.json", import.meta.url)));
const expected = {
  hamstrings: ["FJ1395", "FJ1395M", "FJ1444", "FJ1444M", "FJ1435", "FJ1435M", "FJ1436", "FJ1436M"],
  quadriceps: ["FJ1433", "FJ1433M", "FJ1441", "FJ1441M", "FJ1442", "FJ1442M", "FJ1443", "FJ1443M"],
  calf: ["FJ1394", "FJ1394M", "FJ1397", "FJ1397M", "FJ1437", "FJ1437M", "FJ1429", "FJ1429M"],
  gluteal: ["FJ1418", "FJ1418M", "FJ1419", "FJ1419M", "FJ1420", "FJ1420M"],
};

test("muscle shortcuts preserve source concepts and select exact bilateral members", () => {
  const before = JSON.stringify(atlas),
    concepts = buildSearchConcepts(atlas);
  assert.equal(concepts.length, atlas.concepts.length + 4);
  atlas.concepts.forEach((concept, index) => assert.equal(concepts[index], concept));
  for (const [name, members] of Object.entries(expected)) {
    const group = concepts.find((concept) => concept.id === `ATLAS:group:${name}`);
    assert.deepEqual(group.elements, members);
    assert.deepEqual(group.searchGroup.missingPartIds, []);
    assert(
      group.elements.every(
        (id) => atlas.parts.find((part) => part.id === id)?.system === "muscular",
      ),
    );
  }
  for (const [query, name] of [
    [" HAMSTRING ", "hamstrings"],
    ["quads", "quadriceps"],
    ["calves", "calf"],
    ["glutes", "gluteal"],
  ])
    assert(
      concepts.some(
        (concept) => concept.id === `ATLAS:group:${name}` && matchesAnatomySearch(concept, query),
      ),
    );
  assert.equal(matchesAnatomySearch(concepts[0], " "), false);
  assert.equal(JSON.stringify(atlas), before);
  assert.deepEqual(buildSearchConcepts({ ...atlas, concepts }), concepts);
});

test("missing or renamed meshes yield explicit partial groups; absent groups are omitted", () => {
  const parts = atlas.parts
    .filter((part) => part.id !== "FJ1433")
    .map((part) => (part.id === "FJ1441" ? { ...part, name: "Unrelated replacement" } : part));
  const group = buildSearchConcepts({ ...atlas, parts }).find(
    (concept) => concept.id === "ATLAS:group:quadriceps",
  );
  assert.equal(group.name, "Quadriceps (available muscles)");
  assert.deepEqual(group.searchGroup.missingPartIds, ["FJ1433", "FJ1441"]);
  assert.match(group.searchGroup.description, /6 of 8/);
  assert.deepEqual(buildSearchConcepts({ parts: [], concepts: [] }), []);
  const reserved = { id: "ATLAS:group:quadriceps", name: "Source entry", elements: ["FJ1433"] };
  assert.equal(
    buildSearchConcepts({ ...atlas, concepts: [...atlas.concepts, reserved] }).find(
      (concept) => concept.id === reserved.id,
    ),
    reserved,
  );
});

test("browser tools find aliases and inspect the same muscle group as the visible search", () => {
  let selected;
  const [find, inspect] = atlasTools(atlas, (concept) => (selected = concept));
  const group = find
    .execute({ query: "quads" })
    .find((concept) => concept.id === "ATLAS:group:quadriceps");
  assert(group);
  assert.equal(inspect.execute({ id: group.id }).selectedPieces, 8);
  assert.deepEqual(selected.elements, expected.quadriceps);
});

test("structure lists partition actual meshes by system without cross-system leakage", () => {
  const groups = systemStructures(atlas),
    ids = [];
  for (const [system, concepts] of groups)
    for (const concept of concepts) {
      assert(concept.name);
      assert(
        concept.elements.every((id) =>
          atlas.parts.some((part) => part.id === id && part.system === system),
        ),
      );
      ids.push(...concept.elements);
    }
  assert.equal(ids.length, atlas.parts.length);
  assert.equal(new Set(ids).size, atlas.parts.length);
});

test("individual switches, selection, isolation and system reset use consistent visibility", () => {
  const part = atlas.parts[0],
    state = { visible: [], selected: [], isolate: false };
  assert.equal(partIsVisible(part, state), false);
  assert.equal(partIsVisible(part, { ...state, partVisibility: { [part.id]: true } }), true);
  assert.equal(
    partIsVisible(part, { ...state, isolate: true, partVisibility: { [part.id]: true } }),
    false,
  );
  assert.equal(partIsVisible(part, { ...state, isolate: true, selected: [part.id] }), true);
  assert.equal(
    partIsVisible(part, {
      ...state,
      visible: [part.system],
      selected: [part.id],
      partVisibility: { [part.id]: false },
    }),
    true,
  );
  assert.equal(partIsVisible(part, { ...state, partVisibility: { [part.id]: false } }), false);
  const overrides = { [part.id]: false, other: true };
  assert.deepEqual(clearStructureOverrides(overrides, [part.id]), { other: true });
  assert.equal(overrides[part.id], false);
});

test("recent selections deduplicate, limit history, and tolerate invalid or unavailable storage", () => {
  let ids = [];
  for (let index = 0; index < 9; index++) ids = rememberStructure(ids, String(index));
  assert.deepEqual(ids, ["8", "7", "6", "5", "4", "3"]);
  assert.deepEqual(rememberStructure(ids, "5"), ["5", "8", "7", "6", "4", "3"]);
  assert.deepEqual(
    readRecentStructures({ getItem: () => JSON.stringify(["a", null, "a", {}, "b", ""]) }),
    ["a", "b"],
  );
  for (const getItem of [
    () => "{bad",
    () => "{}",
    () => {
      throw new Error("blocked");
    },
  ])
    assert.deepEqual(readRecentStructures({ getItem }), []);
  assert.deepEqual(readRecentStructures(undefined), []);
});

test("draw batches submit only visible indices, suppress unchanged uploads, and re-enable hidden parts", () => {
  const geometry = new T.BufferGeometry(),
    index = new T.BufferAttribute(new Uint32Array(9), 1),
    mesh = new T.Mesh(geometry);
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  mesh.visible = false;
  const batch = {
    mesh,
    index,
    source: Uint32Array.from([10, 11, 12, 20, 21, 22, 30, 31, 32]),
    spans: [0, 1, 2].map((part) => ({ part, start: part * 3, count: 3, visible: 0 })),
  };
  updateDrawBatches([batch], Uint8Array.from([0, 0, 0]));
  assert.equal(mesh.visible, false);
  updateDrawBatches([batch], Uint8Array.from([1, 0, 1]));
  assert.equal(geometry.drawRange.count, 6);
  assert.deepEqual(Array.from(index.array.subarray(0, 6)), [10, 11, 12, 30, 31, 32]);
  assert.deepEqual(index.updateRanges, [{ start: 0, count: 6 }]);
  const version = index.version;
  updateDrawBatches([batch], Uint8Array.from([1, 0, 1]));
  assert.equal(index.version, version);
  updateDrawBatches([batch], Uint8Array.from([0, 0, 0]));
  assert.equal(mesh.visible, false);
  assert.equal(geometry.drawRange.count, 0);
  assert.equal(index.version, version);
  updateDrawBatches([batch], Uint8Array.from([0, 1, 0]));
  assert.equal(mesh.visible, true);
  assert.equal(geometry.drawRange.count, 3);
  assert.deepEqual(Array.from(index.array.subarray(0, 3)), [20, 21, 22]);
  assert.deepEqual(index.updateRanges, [{ start: 0, count: 3 }]);
});

test("frame scheduling coalesces events, stops when idle or hidden, and cannot restart after disposal", () => {
  let next = 0,
    hidden = false,
    renders = 0;
  const queued = new Map();
  const environment = {
    request: (callback) => {
      queued.set(++next, callback);
      return next;
    },
    cancel: (id) => queued.delete(id),
    hidden: () => hidden,
  };
  const frames = createFrameScheduler(() => renders++, environment);
  frames.request();
  frames.request();
  assert.equal(queued.size, 1);
  const step = () => {
    const [id, callback] = queued.entries().next().value;
    queued.delete(id);
    callback(16);
  };
  step();
  assert.equal(renders, 1);
  assert.equal(queued.size, 0);
  assert.equal(frames.pending, false);
  frames.request();
  frames.pause();
  assert.equal(queued.size, 0);
  hidden = true;
  frames.request();
  assert.equal(queued.size, 0);
  hidden = false;
  frames.request();
  step();
  assert.equal(renders, 2);
  frames.dispose();
  frames.request();
  assert.equal(queued.size, 0);
  let motion = 3;
  const animated = createFrameScheduler(() => {
    if (--motion) animated.request();
  }, environment);
  animated.request();
  step();
  step();
  step();
  assert.equal(queued.size, 0);
  animated.dispose();
});
