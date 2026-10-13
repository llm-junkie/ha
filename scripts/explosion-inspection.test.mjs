import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExplosionLayout, createInspectionLayout } from "../app/explosion-layout.ts";
import { partIsEnabled, partIsVisible } from "../app/part-visibility.ts";
import { captureSavedView, normalizeSavedView, savedViewState } from "../app/saved-views.ts";

for (const file of ["atlas.json", "atlas-female.json"]) {
  const atlas = JSON.parse(readFileSync(new URL(`../public/models/${file}`, import.meta.url)));
  const rib = atlas.parts.find((part) => part.name.toLowerCase() === "left ninth rib");
  const liverId = atlas.concepts.find((concept) => concept.name.toLowerCase() === "liver").elements[0];
  const liver = atlas.parts.find((part) => part.id === liverId);
  const layoutFor = (state) => createInspectionLayout(
    atlas.parts, atlas.parts.filter((part) => partIsEnabled(part, state)), 0.8,
  );
  const base = {
    visible: ["skeletal"], selected: [], isolate: false, explode: 0.58,
    view: "front", rotate: false, reset: 0, partVisibility: { [rib.id]: false },
  };

  test(`${file}: inspection preserves the enabled layout and layer choices`, () => {
    const initial = layoutFor(base);
    const compact = createExplosionLayout(atlas.parts.filter((part) => partIsEnabled(part, base)), 0.8);
    assert.equal(initial.width, compact.width);
    assert.equal(initial.height, compact.height);
    assert.equal(initial.cells.size, atlas.parts.length);
    for (const [id, cell] of compact.cells) assert.deepEqual(initial.cells.get(id), cell);
    for (const part of atlas.parts.filter((part) => !partIsEnabled(part, base))) {
      const cell = initial.cells.get(part.id);
      assert(cell.y + cell.height / 2 <= -compact.height / 2 + 1e-8);
    }
    for (const part of [rib, liver]) {
      for (const isolate of [false, true, false]) {
        const inspected = { ...base, selected: [part.id], isolate, focus: 1 };
        assert(partIsVisible(part, inspected), "hidden selections must be inspectable");
        assert.deepEqual(layoutFor(inspected), initial, "inspection must not move any slot");
      }
    }
    assert.equal(partIsVisible(rib, base), false, "deselection must restore the hidden choice");
    assert.equal(base.partVisibility[rib.id], false);
  });

  test(`${file}: isolated exploded views restore the same positions from saved settings`, () => {
    const isolated = { ...base, selected: [rib.id], isolate: true };
    const camera = { position: [0, 1, 3], target: [0, 1, 0], offset: [0, 0] };
    const model = atlas.sex ?? "male";
    const restored = savedViewState(normalizeSavedView(captureSavedView(isolated, camera, rib.conceptId, model), atlas), 1);
    assert.equal(restored.explode, 0.58);
    assert.deepEqual(layoutFor(restored), layoutFor(isolated));
    assert.deepEqual(layoutFor({ ...restored, isolate: false }), layoutFor(isolated));
    const allHidden = { ...base, visible: [], partVisibility: {} };
    assert.deepEqual(layoutFor({ ...allHidden, selected: [rib.id] }), layoutFor(allHidden));
  });
}
