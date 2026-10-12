import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { explanation } from "../app/anatomy.ts";
import { partIsVisible } from "../app/part-visibility.ts";
import { systemStructures } from "../app/structure-layers.ts";
import { applyClassificationOverrides } from "./apply-classification-overrides.mjs";

for (const name of ["atlas.json", "atlas-female.json"]) {
  const atlas = JSON.parse(await readFile(new URL(`../public/models/${name}`, import.meta.url)));
  test(`${name}: both iliotibial tracts use connective visibility, browsing, and fascia descriptions`, () => {
    const systems = systemStructures(atlas);
    for (const [id, conceptId] of [["FJ1423", "FMA58776"], ["FJ1423M", "FMA58777"]]) {
      const part = atlas.parts.find((part) => part.id === id);
      assert.equal(part.system, "connective");
      assert.equal(part.conceptId, conceptId);
      assert(systems.get("connective").some((concept) => concept.elements.includes(id)));
      assert(!systems.get("skeletal").some((concept) => concept.elements.includes(id)));
      assert(partIsVisible(part, { visible: ["connective"], selected: [], isolate: false }));
      assert(!partIsVisible(part, { visible: ["skeletal"], selected: [], isolate: false }));
      assert.match(explanation(part.name, part.system), /deep fascia \(fascia lata\)/);
      assert.doesNotMatch(explanation(part.name, part.system), /minerals|blood cells/);
    }
    assert.match(explanation("iliotibial tract", "connective"), /fascia lata/);
  });
  test(`${name}: rebuilding the correction changes only two system fields and is idempotent`, () => {
    const original = structuredClone(atlas);
    for (const part of original.parts) if (["FJ1423", "FJ1423M"].includes(part.id)) part.system = "skeletal";
    const corrected = structuredClone(original);
    assert.equal(applyClassificationOverrides(corrected), 2);
    assert.deepEqual(corrected, atlas);
    assert.equal(applyClassificationOverrides(corrected), 0);
    assert.deepEqual(corrected, atlas);
  });
}

test("unrecognized source identities are rejected before either tract is changed", () => {
  const atlas = { parts: [
    { id: "FJ1423", name: "Right iliotibial tract", system: "skeletal" },
    { id: "FJ1423M", name: "Unrelated replacement", system: "skeletal" },
  ] };
  const original = structuredClone(atlas);
  assert.throws(() => applyClassificationOverrides(atlas), /unexpected source identity/);
  assert.deepEqual(atlas, original);
});
