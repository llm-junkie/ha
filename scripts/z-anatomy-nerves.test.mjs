import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { Matrix3, Vector3 } from "three";
import {
  hash,
  loadRecipe,
  bounds,
  femaleMorph,
  differential,
  distalMorph,
  installSupplement,
  tessellateForMorph,
} from "./z-anatomy-nerves.mjs";
import { buildSearchConcepts, matchesAnatomySearch } from "../app/anatomy-search.ts";
import { systemStructures } from "../app/structure-layers.ts";
import { MODELS, anatomicalSources } from "../app/model-catalogue.ts";
const read = (name) => readFile(new URL(`../public/models/${name}`, import.meta.url));
const recipe = await loadRecipe(),
  report = JSON.parse(await read("z-anatomy-source.json"));
const atlases = await Promise.all(
  ["atlas.json", "atlas-female.json"].map((f) => read(f).then(JSON.parse)),
);
const morph = JSON.parse(await read("female-fit-report.json")).morph;
const records = new Map(recipe.parts.map((p) => [p.id, p]));

test("neural sources and registration evidence are pinned and preserve chirality", async () => {
  assert.equal(recipe.parts.length, 210);
  assert.equal(records.size, 210);
  assert.equal(report.recipeSha256, hash(JSON.stringify(recipe)));
  assert.equal(recipe.files.length, 3);
  assert.equal(report.registration.landmarks.length, 47);
  assert.equal(report.registration.heldOutBones.length, 6);
  assert(
    Math.abs(new Matrix3().set(...recipe.registration.rotation.flat()).determinant() - 1) < 1e-8,
  );
  for (const metric of report.registration.landmarks) {
    assert(metric.p95Mm < 40, metric.name);
    assert(metric.maxMm < 70, metric.name);
  }
  for (const asset of report.assets) {
    const bytes = await read(asset.path);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(hash(bytes), asset.sha256);
  }
  assert(recipe.classificationSources.some((s) => s.id === "uams-leg"));
  assert(recipe.classificationSources.some((s) => s.id === "mesh-peripheral"));
  assert.equal(recipe.registration.distalRegions.length, 4);
  for (const region of recipe.registration.distalRegions) {
    assert(Math.abs(new Matrix3().set(...region.rotation.flat()).determinant() - 1) < 1e-8);
    assert.equal(region.landmarks.length, region.region.endsWith("hand") ? 27 : 26);
    assert.equal(region.landmarks.filter((p) => !p.usedForFit).length, 9);
  }
});

for (const atlas of atlases) {
  const sex = atlas.sex,
    model = report.models[sex],
    parts = atlas.parts.filter((p) => records.has(p.id));
  const buffers = await Promise.all(atlas.chunks.map((c) => read(c.url.split("/").at(-1))));
  test(`${sex}: existing identities, classifications, geometry and concepts are retained`, async () => {
    const base = atlas.parts.filter((p) => !records.has(p.id) && p.id !== "VH_F_skin");
    assert.equal(hash(JSON.stringify(base)), model.partsSha256);
    assert.equal(base.length, model.baseParts);
    const concepts = atlas.concepts
      .filter((c) => !c.id.startsWith("ZA_") && c.id !== "HRA:VH_F_skin")
      .map((c) => ({
        ...c,
        elements: c.elements.filter((id) => !records.has(id)),
      }));
    assert.equal(hash(JSON.stringify(concepts)), model.conceptsSha256);
    assert.equal(atlas.parts.length, MODELS[sex].pieces);
    assert.equal(atlas.concepts.length, MODELS[sex].concepts);
    for (const c of model.baseChunks) {
      const index = atlas.chunks.findIndex((q) => q.url === c.url);
      assert.equal(hash(buffers[index]), c.sha256, c.url);
    }
    for (const c of atlas.chunks.filter((c) => /z-nerves-/.test(c.url)))
      assert.deepEqual(
        gunzipSync(await read(c.gzip.split("/").at(-1))),
        buffers[atlas.chunks.indexOf(c)],
      );
  });
  test(`${sex}: new meshes retain separate source identities and valid surfaces`, () => {
    assert.equal(parts.length, 210);
    for (const p of parts) {
      const source = records.get(p.id),
        b = buffers[p.chunk];
      assert.equal(p.name, source.name);
      assert.equal(p.provenance.sourceName, source.sourceName);
      assert.equal(p.provenance.sourceNodeId, source.sourceNodeId);
      assert.equal(p.provenance.license, "CC-BY-SA-4.0");
      assert.equal(p.system, "nervous");
      assert.equal(anatomicalSources([p])[0].name, "Z-Anatomy");
      const positions = new Float32Array(b.buffer, b.byteOffset + p.positions, p.vertexCount * 3);
      const normals = new Int16Array(b.buffer, b.byteOffset + p.normals, p.vertexCount * 3);
      const indices = new Uint32Array(b.buffer, b.byteOffset + p.indices, p.indexCount);
      assert.deepEqual(bounds(positions), p.bounds);
      let disagreeArea = 0,
        area = 0,
        faces = 0;
      for (let i = 0; i < normals.length; i += 3)
        assert(Math.abs(Math.hypot(...normals.subarray(i, i + 3)) / 32767 - 1) < 0.0001, p.id);
      for (let i = 0; i < indices.length; i += 3) {
        const points = Array.from(
          indices.subarray(i, i + 3),
          (j) => new Vector3(...positions.subarray(j * 3, j * 3 + 3)),
        );
        const face = points[1].sub(points[0]).cross(points[2].sub(points[0]));
        if (face.lengthSq() < 1e-24) continue;
        const normal = new Vector3();
        for (const j of indices.subarray(i, i + 3))
          normal.add(new Vector3(...normals.subarray(j * 3, j * 3 + 3)));
        if (face.dot(normal) < 0) disagreeArea += face.length();
        area += face.length();
        faces++;
        for (const [a, c] of [
          [indices[i], indices[i + 1]],
          [indices[i + 1], indices[i + 2]],
          [indices[i + 2], indices[i]],
        ]) {
          const length = Math.hypot(
            ...[0, 1, 2].map((j) => positions[a * 3 + j] - positions[c * 3 + j]),
          );
          // Blending the local extremity fits can expand an edge slightly; the
          // composed field's orientation is independently checked below.
          assert(length < 0.012, p.name);
        }
      }
      assert(faces > 0, p.name);
      // Source smooth normals can oppose tiny faces at tight branch junctions.
      // Weight by surface area so subdivision does not change the meaning of this check.
      assert(disagreeArea / area < 0.01, `${p.name}: reversed normal area ${disagreeArea / area}`);
      assert(model.parts.find((q) => q.id === p.id).simplificationErrorM <= 0.0001001);
    }
    // These distinct nerves were conflated by substring matching in the reference PR.
    for (const side of ["Left", "Right"]) {
      const femoral = parts.find((p) => p.name === `${side} femoral nerve`);
      const cutaneous = parts.find((p) => p.name === `${side} lateral femoral cutaneous nerve`);
      assert(femoral && cutaneous && femoral.conceptId !== cutaneous.conceptId);
      for (const name of [
        "median nerve",
        "ulnar nerve",
        "radial nerve",
        "sciatic nerve",
        "tibial nerve",
        "common fibular nerve",
        "superficial fibular nerve",
        "deep fibular nerve",
      ]) {
        const p = parts.find((p) => p.name === `${side} ${name}`);
        assert(p, `${side} ${name}`);
        const centerX = (p.bounds[0][0] + p.bounds[1][0]) / 2;
        assert(side === "Left" ? centerX > 0 : centerX < 0, p.name);
      }
    }
  });
  test(`${sex}: nervous-layer browsing and search include trunk and limb anatomy`, () => {
    const concepts = buildSearchConcepts(atlas),
      layers = systemStructures(atlas);
    for (const p of parts)
      assert(
        layers.get("nervous").some((c) => c.elements.includes(p.id)),
        p.name,
      );
    for (const term of [
      "sciatic nerve",
      "median nerve",
      "cauda equina",
      "spinal cord",
      "intercostal nerves",
      "brachial plexus",
    ])
      assert(
        concepts.some((c) => matchesAnatomySearch(c, term)),
        term,
      );
    const cord = concepts.find((c) => c.id === "FMA7647");
    assert.equal(cord.elements.filter((id) => records.has(id)).length, 4);
    assert.deepEqual(
      anatomicalSources(cord.elements.map((id) => atlas.parts.find((p) => p.id === id))).map(
        (s) => s.name,
      ),
      ["BodyParts3D", "Z-Anatomy"],
    );
    const tissue = cord.elements
      .filter((id) => records.has(id))
      .map((id) => parts.find((p) => p.id === id));
    assert(
      Math.max(...tissue.map((p) => p.bounds[1][1])) -
        Math.min(...tissue.map((p) => p.bounds[0][1])) >
        0.4,
    );
  });
  test(`${sex}: additive installation is idempotent and leaves the input unchanged`, () => {
    // Replay the neural import at its own pipeline stage, before the later skin supplement.
    const neuralAtlas = structuredClone(atlas);
    neuralAtlas.parts = neuralAtlas.parts.filter((p) => p.id !== "VH_F_skin");
    neuralAtlas.concepts = neuralAtlas.concepts.filter((c) => c.id !== "HRA:VH_F_skin");
    neuralAtlas.chunks = neuralAtlas.chunks.filter((c) => !/\/female-skin-/.test(c.url));
    neuralAtlas.supplements = neuralAtlas.supplements.filter((s) => s.source === "Z-Anatomy");
    neuralAtlas.triangles = neuralAtlas.parts.reduce((s, p) => s + p.indexCount / 3, 0);
    neuralAtlas.optimized.preservedMeshes = neuralAtlas.parts.length;
    const original = JSON.stringify(neuralAtlas),
      offset = model.baseChunks.length;
    const packed = {
      parts: parts.map((p) => ({ ...p, chunk: p.chunk - offset })),
      chunks: neuralAtlas.chunks.slice(offset),
    };
    assert.deepEqual(installSupplement(neuralAtlas, packed, recipe).atlas, neuralAtlas);
    assert.equal(JSON.stringify(neuralAtlas), original);
  });
}

test("female nerves use the existing shared morph without folds or altered topology", async () => {
  const [male, female] = atlases;
  const buffers = await Promise.all(
    atlases.map((a) => Promise.all(a.chunks.map((c) => read(c.url.split("/").at(-1))))),
  );
  for (const p of male.parts.filter((p) => records.has(p.id))) {
    const q = female.parts.find((q) => q.id === p.id),
      a = buffers[0][p.chunk],
      b = buffers[1][q.chunk];
    assert.equal(p.vertexCount, q.vertexCount);
    assert.equal(p.indexCount, q.indexCount);
    assert.deepEqual(
      a.subarray(p.indices, p.indices + p.indexCount * 4),
      b.subarray(q.indices, q.indices + q.indexCount * 4),
    );
    // Sample over each entire mesh. Male Float32 storage adds at most a rounding
    // unit before this independent comparison with the shared body field.
    for (let i = 0; i < p.vertexCount; i += Math.max(1, Math.floor(p.vertexCount / 50))) {
      const point = [0, 1, 2].map((j) => a.readFloatLE(p.positions + (i * 3 + j) * 4));
      const expected = femaleMorph(point, morph);
      assert(differential((v) => femaleMorph(v, morph), point).determinant() > 0);
      const actual = [0, 1, 2].map((j) => b.readFloatLE(q.positions + (i * 3 + j) * 4));
      assert(Math.hypot(...expected.map((v, j) => v - actual[j])) < 3e-7, p.name);
    }
  }
  assert(report.models.female.minimumJacobian > 0.5);
});

test("hand/foot registration improves independently held-out bones in both models", () => {
  for (const sex of ["male", "female"]) {
    const metrics = report.models[sex].distalRegistration;
    assert.equal(metrics.length, 106);
    assert.equal(metrics.filter((p) => p.usedForFit).length, 70);
    assert.equal(metrics.filter((p) => !p.usedForFit).length, 36);
    for (const region of recipe.registration.distalRegions) {
      const regional = metrics.filter((p) => p.region === region.region);
      const before = Math.max(...regional.map((p) => p.before.p95Mm));
      const after = Math.max(...regional.map((p) => p.after.p95Mm));
      assert(after < before * 0.25, `${sex} ${region.region}: ${before} -> ${after}`);
      for (const p of regional) {
        assert(p.after.p95Mm < 5, p.name);
        assert(p.after.maxMm < 10, p.name);
      }
    }
  }
});

test("local fits preserve trunk anatomy, blend continuously and do not fold", () => {
  const regions = recipe.registration.distalRegions;
  const map = (p) => distalMorph(p, regions);
  for (const p of [
    [0, 0.8, 0],
    [0.12, 0.9, 0.04],
    [-0.12, 0.9, 0.04],
    [0.25, 1.1, 0],
    [-0.25, 1.1, 0],
    [0.1, 0.3, 0.02],
    [-0.1, 0.3, 0.02],
  ]) {
    assert.deepEqual(map(p), p);
    assert(Math.abs(differential(map, p).determinant() - 1) < 1e-8);
  }
  for (const region of regions) {
    const hand = region.region.endsWith("hand"),
      side = region.blend.side;
    const p = [side * (hand ? 0.26 : 0.08), region.blend.height[1], 0.02];
    assert.deepEqual(map(p), p);
    const inward = [...p];
    inward[1] -= 1e-6;
    assert(Math.hypot(...map(inward).map((v, j) => v - inward[j])) < 1e-10);
    // Cover the whole support, including its lateral and wrist/ankle ramps.
    for (let x = hand ? 0.14 : 0.01; x <= (hand ? 0.36 : 0.18); x += 0.01)
      for (let y = hand ? 0.6 : 0; y <= (hand ? 1.1 : 0.3); y += 0.02)
        for (let z = -0.1; z <= 0.15; z += 0.025) {
          const point = [side * x, y, z];
          assert(differential(map, point).determinant() > 0.5, JSON.stringify(point));
          const composed = (p) => femaleMorph(map(p), morph);
          assert(differential(composed, point).determinant() > 0.4, JSON.stringify(point));
        }
  }
});

test("body-morph tessellation preserves surfaces and shared edges", () => {
  const mesh = {
    positions: Float32Array.from([0, 0, 0, 0.2, 0, 0, 0.2, 0.1, 0, 0, 0.1, 0]),
    normals: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  };
  const refined = tessellateForMorph(mesh),
    edges = new Map();
  let area = 0;
  for (let i = 0; i < refined.indices.length; i += 3) {
    const ids = Array.from(refined.indices.slice(i, i + 3));
    const [a, b, c] = ids.map((j) => new Vector3(...refined.positions.slice(j * 3, j * 3 + 3)));
    const face = b.clone().sub(a).cross(c.clone().sub(a));
    assert(face.z > 0);
    area += face.length() / 2;
    for (const [u, v] of [
      [ids[0], ids[1]],
      [ids[1], ids[2]],
      [ids[2], ids[0]],
    ]) {
      const key = [u, v].sort((a, b) => a - b).join(":");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert(Math.abs(area - 0.02) < 1e-8);
  for (const [edge, count] of edges) {
    assert(count === 1 || count === 2);
    if (count === 1) {
      const [a, b] = edge
        .split(":")
        .map(Number)
        .map((i) => Array.from(refined.positions.slice(i * 3, i * 3 + 3)));
      assert(
        (a[0] === b[0] && (a[0] === 0 || Math.abs(a[0] - 0.2) < 1e-8)) ||
          (a[1] === b[1] && (a[1] === 0 || Math.abs(a[1] - 0.1) < 1e-8)),
        "Interior edges must be shared by two faces.",
      );
    }
  }
});
