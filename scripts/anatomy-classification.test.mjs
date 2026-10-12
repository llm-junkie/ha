import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { explanation, SYSTEMS } from "../app/anatomy.ts";
import { partIsVisible } from "../app/part-visibility.ts";
import { systemStructures } from "../app/structure-layers.ts";
import { applyClassificationOverrides } from "./apply-classification-overrides.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url));
const corrections = JSON.parse(await read("data/anatomy/classification-overrides.json"));
const evidence = JSON.parse(await read("data/anatomy/classification-evidence.json"));
const sourceConcepts = new Map(evidence.concepts.map((concept) => [concept.id, concept]));
const systems = new Set(SYSTEMS.map((system) => system.id));

test("every correction has pinned identity, official source membership, and corroborating references", () => {
  assert.equal(new Set(corrections.parts.map((part) => part.id)).size, corrections.parts.length);
  for (const record of corrections.parts) {
    assert(record.name && record.conceptId);
    assert(systems.has(record.system) && systems.has(record.originalSystem));
    assert.notEqual(record.originalSystem, record.system);
    assert(sourceConcepts.get(record.evidenceConceptId)?.elements.includes(record.id), record.id);
    const group = corrections.groups[record.group];
    assert(group.reason);
    assert(group.sources.includes("bp3d") && group.sources.length >= 2, record.id);
    for (const id of group.sources) assert.match(corrections.sources[id].url, /^https:\/\//);
  }
});

for (const name of ["atlas.json", "atlas-female.json"]) {
  const atlas = JSON.parse(await read(`public/models/${name}`));
  const parts = new Map(atlas.parts.map((part) => [part.id, part]));
  test(`${name}: all verified corrections control browsing and visibility`, () => {
    const layers = systemStructures(atlas);
    for (const record of corrections.parts) {
      const part = parts.get(record.id);
      assert.equal(part.name.toLowerCase(), record.name.toLowerCase(), record.id);
      assert.equal(part.conceptId, record.conceptId, record.id);
      assert.equal(part.system, record.system, record.id);
      assert(layers.get(record.system).some((concept) => concept.elements.includes(record.id)), record.id);
      assert(!layers.get(record.originalSystem)?.some((concept) => concept.elements.includes(record.id)), record.id);
      assert(partIsVisible(part, { visible: [record.system], selected: [], isolate: false }), record.id);
      assert(!partIsVisible(part, { visible: [record.originalSystem], selected: [], isolate: false }), record.id);
    }
  });
  test(`${name}: independent official type memberships catch omitted corrections`, () => {
    // Memberships come from the downloaded archive, independently of the overrides.
    for (const [conceptId, system] of [
      ["FMA5018", "skeletal"], ["FMA5022", "muscular"],
      ["FMA55107", "connective"], ["FMA7538", "connective"],
      ["FMA7646", "connective"], ["FMA49071", "connective"],
      ["FMA12516", "digestive"], ["FMA59762", "digestive"], ["FMA15737", "digestive"],
      ["FMA78447", "nervous"], ["FMA75351", "nervous"], ["FMA61934", "nervous"],
      ["FMA50720", "arterial"], ["FMA50723", "venous"],
    ]) {
      for (const id of sourceConcepts.get(conceptId).elements) {
        const part = parts.get(id);
        if (part) assert.equal(part.system, system, `${conceptId}: ${id} (${part.name})`);
      }
    }
    // Whole heart includes vessels: only its nonvascular components use Heart.
    for (const id of sourceConcepts.get("FMA7088").elements) {
      const part = parts.get(id);
      if (part && !["arterial", "venous"].includes(part.system)) assert.equal(part.system, "cardiac", id);
    }
    for (const part of atlas.parts) assert(systems.has(part.system), part.id);
  });
  test(`${name}: reapplication changes only verified system fields and is idempotent`, () => {
    const original = structuredClone(atlas);
    for (const record of corrections.parts) original.parts.find((part) => part.id === record.id).system = record.originalSystem;
    const corrected = structuredClone(original);
    assert.equal(applyClassificationOverrides(corrected), corrections.parts.length);
    assert.deepEqual(corrected, atlas); // Includes geometry, identities and concepts.
    assert.equal(applyClassificationOverrides(corrected), 0);
    assert.deepEqual(corrected, atlas);
  });
  test(`${name}: source drift is rejected atomically before any assignments change`, () => {
    for (const mutation of [
      (part) => { part.name = "Unrelated replacement"; },
      (part) => { part.conceptId = "FMA:unrelated"; },
      (part) => { part.system = "integumentary"; },
    ]) {
      const changed = structuredClone(atlas);
      for (const record of corrections.parts) changed.parts.find((part) => part.id === record.id).system = record.originalSystem;
      mutation(changed.parts.find((part) => part.id === corrections.parts.at(-1).id));
      const before = structuredClone(changed);
      assert.throws(() => applyClassificationOverrides(changed), /unexpected source/);
      assert.deepEqual(changed, before);
    }
    const missing = structuredClone(atlas);
    missing.parts = missing.parts.filter((part) => part.id !== corrections.parts.at(-1).id);
    assert.throws(() => applyClassificationOverrides(missing), /unexpected source identity/);
    const duplicate = structuredClone(atlas);
    duplicate.parts.push(structuredClone(duplicate.parts.find((part) => part.id === corrections.parts[0].id)));
    assert.throws(() => applyClassificationOverrides(duplicate), /unexpected source identity/);
  });
}

test("corrected structures receive descriptions appropriate to their anatomy", () => {
  for (const [name, system, expected] of [
    ["Right iliotibial tract", "connective", /deep fascia/],
    ["Left lateral ventricle", "nervous", /cerebrospinal-fluid space/i],
    ["Third ventricle", "nervous", /cerebrospinal-fluid space/i],
    ["Fourth ventricle", "nervous", /cerebrospinal-fluid space/i],
    ["Interventricular foramen", "nervous", /brain/],
    ["Choroid plexus of cerebral hemisphere", "nervous", /produces cerebrospinal fluid/],
    ["Flexor retinaculum of left wrist", "connective", /carpal tunnel/],
    ["Left common tendinous ring", "connective", /extraocular rectus/],
    ["Left lower first secondary molar tooth", "digestive", /mechanical digestion/],
    ["Gingiva of upper jaw", "digestive", /gum tissue/],
    ["Hepatovenous segment IX", "digestive", /region of liver tissue/i],
    ["Intervertebral disk of axis", "connective", /fibrocartilaginous/],
    ["Thyroid cartilage", "connective", /connective-tissue/],
    ["Anterior papillary muscle of right ventricle", "cardiac", /heart muscle/],
  ]) assert.match(explanation(name, system), expected, name);
  assert.equal(explanation("Cavity of right ventricle", "cardiac"), SYSTEMS.find((s) => s.id === "cardiac").description);
  assert.equal(explanation("Left tibialis anterior", "muscular"), SYSTEMS.find((s) => s.id === "muscular").description);
});

test("female provenance records each corrected layer and the exact override definition", async () => {
  const source = JSON.parse(await read("public/models/female-source.json"));
  assert.equal(source.classificationOverrides.sha256, createHash("sha256").update(JSON.stringify(corrections)).digest("hex"));
  assert.deepEqual(source.classificationOverrides.parts, corrections.parts.map(({ id, system, group }) => ({ id, system, group })));
  const delivered = source.files.find((file) => file.path === "atlas-female.json");
  const bytes = await read("public/models/atlas-female.json");
  assert.equal(delivered.bytes, bytes.length);
  assert.equal(delivered.sha256, createHash("sha256").update(bytes).digest("hex"));
});
