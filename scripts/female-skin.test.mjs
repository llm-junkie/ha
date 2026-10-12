import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { Vector3 } from "three";
import { hash, bounds } from "./z-anatomy-nerves.mjs";
import { buildSearchConcepts, matchesAnatomySearch } from "../app/anatomy-search.ts";
import { partIsVisible } from "../app/part-visibility.ts";
import { layerOpacity } from "../app/layer-opacity.ts";
import { anatomicalSources, MODELS } from "../app/model-catalogue.ts";

const read = (name) => readFile(new URL(`../public/models/${name}`, import.meta.url));
const atlas = JSON.parse(await read("atlas-female.json"));
const recipe = JSON.parse(await readFile(new URL("../data/anatomy/female-skin.json", import.meta.url)));
const report = JSON.parse(await read("female-skin-source.json"));
const skin = atlas.parts.find((p) => p.id === "VH_F_skin");

test("female skin source is pinned, attributed and added without changing existing anatomy", async () => {
  assert(skin);
  assert.equal(report.recipeSha256, hash(JSON.stringify(recipe)));
  assert.equal(recipe.source.sha256, "0fc377c7a2e7e9644b81d318feda9d0b2c5a38f39bd14e74966f8b6364eb0a78");
  assert.equal(skin.provenance.license, "CC-BY-4.0");
  assert.equal(skin.provenance.ontologyId, "UBERON:0002097");
  assert.equal(anatomicalSources([skin])[0].name, "HRA");
  assert(anatomicalSources([skin])[0].url.endsWith("/v1.3/models/3d-vh-f-skin.glb"));
  assert.equal(atlas.parts.length, MODELS.female.pieces);
  assert.equal(atlas.concepts.length, MODELS.female.concepts);
  assert.equal(hash(JSON.stringify(atlas.parts.filter((p) => p.id !== skin.id))), recipe.base.partsSha256);
  assert.equal(hash(JSON.stringify(atlas.concepts.filter((c) => c.id !== skin.conceptId))), recipe.base.conceptsSha256);
  for (const c of recipe.base.chunks) assert.equal(hash(await read(c.url.split("/").at(-1))), c.sha256);
  for (const asset of report.assets) {
    const bytes = await read(asset.path);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(hash(bytes), asset.sha256);
  }
  const source = JSON.parse(await read("female-source.json"));
  const catalogue = source.files.find((f) => f.path === "atlas-female.json");
  assert.equal(hash(await read("atlas-female.json")), catalogue.sha256);
  assert.equal(source.skinSupplement.provenance, "female-skin-source.json");
});

test("delivered full-body skin has finite bounds, complete indices, consistent normals and raw/gzip equivalents", async () => {
  const c = atlas.chunks[skin.chunk], b = await read(c.url.split("/").at(-1));
  assert.deepEqual(gunzipSync(await read(c.gzip.split("/").at(-1))), b);
  const p = new Float32Array(b.buffer, b.byteOffset + skin.positions, skin.vertexCount * 3);
  const n = new Int16Array(b.buffer, b.byteOffset + skin.normals, skin.vertexCount * 3);
  const ix = new Uint32Array(b.buffer, b.byteOffset + skin.indices, skin.indexCount);
  assert.deepEqual(bounds(p), skin.bounds);
  assert.equal(skin.vertexCount, 36998);
  assert.equal(skin.indexCount / 3, 73992);
  assert(skin.bounds[0][1] < .01 && skin.bounds[1][1] > 1.62);
  assert(skin.bounds[0][0] < -.30 && skin.bounds[1][0] > .30);
  for (const value of p) assert(Number.isFinite(value));
  for (let i = 0; i < n.length; i += 3)
    assert(Math.abs(Math.hypot(...n.subarray(i, i + 3)) / 32767 - 1) < .0001);
  let area = 0, reversedArea = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const ids = Array.from(ix.subarray(i, i + 3));
    for (const id of ids) assert(id < skin.vertexCount);
    const [a, b, c] = ids.map((j) => new Vector3(...p.subarray(j * 3, j * 3 + 3)));
    const face = b.sub(a).cross(c.sub(a));
    assert(face.length() / 2 > 1e-14);
    const normal = new Vector3();
    for (const id of ids) normal.add(new Vector3(...n.subarray(id * 3, id * 3 + 3)));
    area += face.length();
    if (face.dot(normal) <= 0) reversedArea += face.length();
  }
  assert(reversedArea / area < .001);
  assert(report.registration.jacobianSamples >= skin.vertexCount);
  assert.equal(report.registration.nonPositiveJacobianSamples, 0);
  assert(report.registration.minimumSampledJacobian > 0);
  assert(report.simplifiedSource.errorM <= .0002);
});

test("female body skin is searchable, selectable, faded by default and controlled by Body surface", () => {
  assert.equal(skin.system, "integumentary");
  assert.equal(layerOpacity({}, skin.system), .2);
  assert(partIsVisible(skin, { visible: ["integumentary"], selected: [], isolate: false }));
  assert(!partIsVisible(skin, { visible: ["muscular"], selected: [], isolate: false }));
  assert(!partIsVisible(skin, { visible: ["integumentary"], selected: [], isolate: false, partVisibility: { [skin.id]: false } }));
  assert(buildSearchConcepts(atlas).some((c) => c.id === skin.conceptId && matchesAnatomySearch(c, "skin")));
  assert.deepEqual(atlas.concepts.find((c) => c.id === skin.conceptId).elements, [skin.id]);
});

test("skin relaxation reduces local contour noise while retaining orientation, scale and fitting clearance", () => {
  const smoothing = report.registration.meshSmoothing;
  assert.equal(report.registration.torsoControlSmoothing, recipe.registration.torsoControlSmoothing);
  assert.deepEqual(smoothing.settings, recipe.registration.meshSmoothing);
  assert.equal(smoothing.vertices, 42092);
  assert.equal(smoothing.trianglesChecked, 84180);
  assert.equal(smoothing.reversedTriangles, 0);
  assert(smoothing.maximumDisplacementM <= smoothing.settings.bodyDisplacementLimitM + 1e-7);
  assert(smoothing.bodyLaplacianEnergyRatio < .25);
  assert(Math.abs(smoothing.signedVolumeRatio - 1) < .015);
  assert(smoothing.settings.bodyInwardLimitM <= .0015);
  assert(smoothing.settings.detailInwardLimitM <= .0004);
});

test("posterior tightening is bounded and leaves the anterior surface, scalp and outer limbs outside the adjustment", () => {
  const tightening = report.registration.posteriorTightening;
  assert.deepEqual(tightening.settings, recipe.registration.posteriorTightening);
  assert(tightening.affectedVertices > 0 && tightening.affectedVertices < skin.vertexCount / 4);
  assert(tightening.maximumForwardShiftM > .01 && tightening.maximumForwardShiftM <= .022);
  assert.equal(tightening.anteriorVerticesShifted, 0);
  assert.equal(tightening.scalpVerticesShifted, 0);
  assert.equal(tightening.lateralVerticesShifted, 0);
  assert(tightening.settings.centralBackWeight <= .25);
  assert(report.registration.jacobianStage.includes("posterior contour adjustment"));
});

test("reviewed scalp and neck tightening is localized and produces the narrower head/neck envelope", async () => {
  const tightening = report.registration.headNeckTightening;
  assert.deepEqual(tightening.settings, recipe.registration.headNeckTightening);
  assert(tightening.affectedVertices > 0 && tightening.affectedVertices < skin.vertexCount / 4);
  assert(tightening.maximumLateralShiftM <= .028);
  assert.equal(tightening.maximumCrownLoweringM, .0065);
  assert.equal(tightening.belowShoulderVerticesShifted, 0);
  assert.equal(tightening.faceVerticesShifted, 0);
  assert(skin.bounds[1][1] > 1.627 && skin.bounds[1][1] < 1.631);
  const bytes = await read(atlas.chunks[skin.chunk].url.split("/").at(-1));
  const p = new Float32Array(bytes.buffer, bytes.byteOffset + skin.positions, skin.vertexCount * 3);
  let neckWidth = 0, vertices = 0;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 1] > 1.398 && p[i + 1] < 1.408 && p[i + 2] > -.09 && p[i + 2] < .025) {
      neckWidth = Math.max(neckWidth, Math.abs(p[i]));
      vertices++;
    }
  }
  assert(vertices > 20);
  assert(neckWidth > .055 && neckWidth < .075);
});

test("head profile registration brings the face, chin, throat and posterior scalp into the reviewed depth ranges", async () => {
  const registration = report.registration.headProfileRegistration;
  assert.deepEqual(registration.settings, recipe.registration.headProfileRegistration);
  assert(registration.affectedVertices > 0 && registration.affectedVertices < skin.vertexCount / 4);
  assert(registration.maximumAnteriorRetractionM <= .017);
  assert(registration.maximumPosteriorRetractionM <= .013);
  assert(registration.maximumNoseLoweringM > .0029 && registration.maximumNoseLoweringM <= .003);
  assert.equal(registration.belowShoulderVerticesShifted, 0);
  const bytes = await read(atlas.chunks[skin.chunk].url.split("/").at(-1));
  const p = new Float32Array(bytes.buffer, bytes.byteOffset + skin.positions, skin.vertexCount * 3);
  const regions = [
    { name: "nose", y: [1.480, 1.501], side: 1, depth: [.074, .085] },
    { name: "mouth", y: [1.450, 1.477], side: 1, depth: [.070, .085] },
    { name: "chin", y: [1.432, 1.444], side: 1, depth: [.069, .085] },
    { name: "front neck", y: [1.405, 1.416], side: 1, depth: [.033, .059] },
    { name: "posterior scalp", y: [1.552, 1.582], side: -1, depth: [.105, .120] },
  ];
  for (const region of regions) {
    let depth = 0, count = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(p[i]) < .009 && p[i + 1] > region.y[0] && p[i + 1] < region.y[1]) {
        depth = Math.max(depth, region.side * p[i + 2]);
        count++;
      }
    }
    assert(count > 10, region.name);
    assert(depth > region.depth[0] && depth < region.depth[1], `${region.name}: ${depth}`);
  }
});

test("skin covers the lateral adipose surface of both breasts", async () => {
  const envelope = report.registration.breastEnvelope;
  assert.deepEqual(envelope.settings, recipe.registration.breastEnvelope);
  assert(envelope.affectedVertices > 0 && envelope.affectedVertices < skin.vertexCount / 10);
  assert(envelope.maximumLateralExpansionM <= .012);
  assert.equal(envelope.posteriorVerticesShifted, 0);
  assert.equal(envelope.outsideChestVerticesShifted, 0);
  const bytes = await read(atlas.chunks[skin.chunk].url.split("/").at(-1));
  const positions = new Float32Array(bytes.buffer, bytes.byteOffset + skin.positions, skin.vertexCount * 3);
  const indices = new Uint32Array(bytes.buffer, bytes.byteOffset + skin.indices, skin.indexCount);
  for (const [side, sign] of [["L", 1], ["R", -1]]) {
    // Project the delivered lateral skin triangles onto the Y/Z plane, then
    // compare their outermost X intersection against the actual tissue vertices.
    const triangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = Array.from(indices.subarray(i, i + 3), (id) => Array.from(positions.subarray(id * 3, id * 3 + 3)));
      const x = vertices.map((v) => sign * v[0]), y = vertices.map((v) => v[1]), z = vertices.map((v) => v[2]);
      if (Math.max(...x) < .12 || Math.min(...y) > 1.235 || Math.max(...y) < 1.145 || Math.min(...z) > .115 || Math.max(...z) < .055) continue;
      const [a, b, c] = vertices;
      const denominator = (b[2] - c[2]) * (a[1] - c[1]) + (c[1] - b[1]) * (a[2] - c[2]);
      if (Math.abs(denominator) > 1e-12) triangles.push({ a, b, c, denominator, y: [Math.min(...y), Math.max(...y)], z: [Math.min(...z), Math.max(...z)] });
    }
    const fat = atlas.parts.find((p) => p.id === `VH_F_fat_${side}`);
    const fatBytes = await read(atlas.chunks[fat.chunk].url.split("/").at(-1));
    const tissue = new Float32Array(fatBytes.buffer, fatBytes.byteOffset + fat.positions, fat.vertexCount * 3);
    let checked = 0, minimumGap = Infinity;
    for (let i = 0; i < tissue.length; i += 3) {
      const x = sign * tissue[i], y = tissue[i + 1], z = tissue[i + 2];
      if (x < .13 || y < 1.15 || y > 1.225 || z < .06 || z > .115) continue;
      let outerSkin = -Infinity;
      for (const { a, b, c, denominator, y: yr, z: zr } of triangles) {
        if (y < yr[0] || y > yr[1] || z < zr[0] || z > zr[1]) continue;
        const alpha = ((b[2] - c[2]) * (y - c[1]) + (c[1] - b[1]) * (z - c[2])) / denominator;
        const beta = ((c[2] - a[2]) * (y - c[1]) + (a[1] - c[1]) * (z - c[2])) / denominator;
        const gamma = 1 - alpha - beta;
        if (Math.min(alpha, beta, gamma) >= -1e-7)
          outerSkin = Math.max(outerSkin, sign * (alpha * a[0] + beta * b[0] + gamma * c[0]));
      }
      minimumGap = Math.min(minimumGap, outerSkin - x);
      checked++;
    }
    assert(checked > 50, `${side}: insufficient tissue samples`);
    assert(minimumGap > .0015, `${side}: minimum lateral clearance ${minimumGap}`);
  }
});

test("posed hand and foot patches are pinned, joined, and surround the retained bones", async () => {
  const posed = report.registration.posedExtremities;
  const pin = recipe.registration.posedExtremities;
  assert.deepEqual(posed.settings, pin);
  assert.equal(posed.collars.length, 4);
  const fixture = await readFile(new URL(`../data/anatomy/${pin.path}`, import.meta.url));
  assert.equal(fixture.length, pin.bytes);
  assert.equal(hash(fixture), pin.sha256);
  assert.equal(hash(await read(pin.referenceChunk.path)), pin.referenceChunk.sha256);
  assert.equal(hash(await read("female-fit-report.json")), pin.referenceMorphReportSha256);
  const bytes = await read(atlas.chunks[skin.chunk].url.split("/").at(-1));
  const p = new Float32Array(bytes.buffer, bytes.byteOffset + skin.positions, skin.vertexCount * 3);
  const ix = new Uint32Array(bytes.buffer, bytes.byteOffset + skin.indices, skin.indexCount);
  const edges = new Map();
  for (let i = 0; i < ix.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = ix[i + j], b = ix[i + (j + 1) % 3];
    const key = Math.min(a, b) * skin.vertexCount + Math.max(a, b);
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  let retainedSourceSeams = 0;
  for (const [key, count] of edges) {
    assert(count === 2 || count === 4, "joined skin has an open edge");
    if (count === 4) {
      const a = Math.floor(key / skin.vertexCount), b = key % skin.vertexCount;
      const height = (p[a * 3 + 1] + p[b * 3 + 1]) / 2;
      assert((height > 1.50 && height < 1.53) || (height > .25 && height < .27), "new nonmanifold edge outside the two pinned HRA seams");
      retainedSourceSeams++;
    }
  }
  assert.equal(retainedSourceSeams, 2);
  for (const region of pin.regions) {
    const hand = region.name.includes("hand"), axis = hand ? 2 : 1, u = 0, v = hand ? 1 : 2;
    const triangles = [];
    for (let i = 0; i < ix.length; i += 3) {
      const vertices = Array.from(ix.subarray(i, i + 3), (id) => Array.from(p.subarray(id * 3, id * 3 + 3)));
      const center = [0, 1, 2].map((k) => vertices.reduce((sum, q) => sum + q[k], 0) / 3);
      if (center[0] * region.side < (hand ? .195 : .01) || (hand ? center[1] < .60 || center[1] > .90 : center[1] > .175)) continue;
      const [a, b, c] = vertices;
      const denominator = (b[v] - c[v]) * (a[u] - c[u]) + (c[u] - b[u]) * (a[v] - c[v]);
      if (Math.abs(denominator) < 1e-12) continue;
      triangles.push({ a, b, c, denominator, ur: [Math.min(...vertices.map((q) => q[u])), Math.max(...vertices.map((q) => q[u]))], vr: [Math.min(...vertices.map((q) => q[v])), Math.max(...vertices.map((q) => q[v]))] });
    }
    const bones = atlas.parts.filter((q) => q.system === "skeletal" &&
      (region.side > 0 ? q.bounds[0][0] > (hand ? .195 : .005) : q.bounds[1][0] < -(hand ? .195 : .005)) &&
      q.bounds[1][1] < (hand ? .865 : .15) && (hand ? q.bounds[0][1] > .68 : /phalanx/i.test(q.name)));
    let checked = 0, minimumGap = Infinity;
    for (const bone of bones) {
      const b = await read(atlas.chunks[bone.chunk].url.split("/").at(-1));
      const q = new Float32Array(b.buffer, b.byteOffset + bone.positions, bone.vertexCount * 3);
      for (let i = 0; i < q.length; i += 3) {
        const point = q.subarray(i, i + 3);
        let low = Infinity, high = -Infinity;
        for (const { a, b, c, denominator, ur, vr } of triangles) {
          if (point[u] < ur[0] || point[u] > ur[1] || point[v] < vr[0] || point[v] > vr[1]) continue;
          const alpha = ((b[v] - c[v]) * (point[u] - c[u]) + (c[u] - b[u]) * (point[v] - c[v])) / denominator;
          const beta = ((c[v] - a[v]) * (point[u] - c[u]) + (a[u] - c[u]) * (point[v] - c[v])) / denominator;
          const gamma = 1 - alpha - beta;
          if (Math.min(alpha, beta, gamma) < -1e-7) continue;
          const depth = alpha * a[axis] + beta * b[axis] + gamma * c[axis];
          low = Math.min(low, depth); high = Math.max(high, depth);
        }
        minimumGap = Math.min(minimumGap, point[axis] - low, high - point[axis]);
        checked++;
      }
    }
    assert(checked > 1000, `${region.name}: insufficient bone samples`);
    assert(minimumGap > .00001, `${region.name}: bone clearance ${minimumGap}`);
  }
});

test("face and ear alignment lowers the features while preserving the crown", () => {
  const alignment = report.registration.faceAlignment;
  assert.deepEqual(alignment.settings, recipe.registration.faceAlignment);
  assert(alignment.affectedVertices > 1000 && alignment.affectedVertices < skin.vertexCount / 4);
  assert(alignment.maximumLoweringM >= .009 && alignment.maximumLoweringM <= .011);
  assert.equal(alignment.crownVerticesShifted, 0);
});

test("both medial forearms enclose the retained muscle and basilic vein surfaces", async () => {
  const envelope = report.registration.forearmEnvelope;
  assert.deepEqual(envelope.settings, recipe.registration.forearmEnvelope);
  assert(envelope.affectedVertices > 1000 && envelope.affectedVertices < skin.vertexCount / 10);
  assert(envelope.maximumMedialExpansionM <= .008);
  assert.equal(envelope.belowWristVerticesShifted, 0);
  assert.equal(envelope.aboveElbowVerticesShifted, 0);
  assert.equal(envelope.centralTorsoVerticesShifted, 0);
  assert(envelope.jacobianSamples >= skin.vertexCount);
  assert(envelope.minimumSampledJacobian > .5);
  assert.equal(envelope.nonPositiveJacobianSamples, 0);
  assert.equal(envelope.trianglesChecked, skin.indexCount / 3);
  assert.equal(envelope.reversedTriangles, 0);
  const bytes = await read(atlas.chunks[skin.chunk].url.split("/").at(-1));
  const positions = new Float32Array(bytes.buffer, bytes.byteOffset + skin.positions, skin.vertexCount * 3);
  const indices = new Uint32Array(bytes.buffer, bytes.byteOffset + skin.indices, skin.indexCount);
  for (const side of [-1, 1]) {
    // Cast through the delivered forearm skin at the anatomy's own Y/Z
    // coordinates; both radial limits must surround the previously exposed tissue.
    const triangles = [];
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = Array.from(indices.subarray(i, i + 3), (id) => Array.from(positions.subarray(id * 3, id * 3 + 3)));
      const x = vertices.map((q) => q[0] * side), y = vertices.map((q) => q[1]), z = vertices.map((q) => q[2]);
      if (Math.min(...x) < .145 || Math.max(...x) > .32 || Math.max(...y) < .925 || Math.min(...y) > 1.075 || Math.max(...z) < -.038 || Math.min(...z) > .013) continue;
      const [a, b, c] = vertices;
      const denominator = (b[2] - c[2]) * (a[1] - c[1]) + (c[1] - b[1]) * (a[2] - c[2]);
      if (Math.abs(denominator) > 1e-12)
        triangles.push({ a, b, c, denominator, y: [Math.min(...y), Math.max(...y)], z: [Math.min(...z), Math.max(...z)] });
    }
    const anatomy = atlas.parts.filter((p) => /basilic|antebrachial|palmaris|pronator|flexor carpi|flexor digitorum|extensor carpi|extensor digitorum|ulna|radius|brachioradialis|anconeus|triceps/i.test(p.name)
      && p.bounds[0][1] < 1.075 && p.bounds[1][1] > .925);
    let checked = 0, minimumGap = Infinity;
    for (const part of anatomy) {
      const buffer = await read(atlas.chunks[part.chunk].url.split("/").at(-1));
      const tissue = new Float32Array(buffer.buffer, buffer.byteOffset + part.positions, part.vertexCount * 3);
      for (let i = 0; i < tissue.length; i += 3) {
        const x = side * tissue[i], y = tissue[i + 1], z = tissue[i + 2];
        if (x < .155 || x > .235 || y < .925 || y > 1.075 || z < -.038 || z > .013) continue;
        let inner = Infinity, outer = -Infinity;
        for (const { a, b, c, denominator, y: yr, z: zr } of triangles) {
          if (y < yr[0] || y > yr[1] || z < zr[0] || z > zr[1]) continue;
          const alpha = ((b[2] - c[2]) * (y - c[1]) + (c[1] - b[1]) * (z - c[2])) / denominator;
          const beta = ((c[2] - a[2]) * (y - c[1]) + (a[1] - c[1]) * (z - c[2])) / denominator;
          const gamma = 1 - alpha - beta;
          if (Math.min(alpha, beta, gamma) < -1e-7) continue;
          const depth = side * (alpha * a[0] + beta * b[0] + gamma * c[0]);
          inner = Math.min(inner, depth); outer = Math.max(outer, depth);
        }
        minimumGap = Math.min(minimumGap, x - inner, outer - x);
        checked++;
      }
    }
    assert(checked > 1000, `${side}: insufficient forearm tissue samples`);
    assert(minimumGap > .001, `${side}: medial forearm clearance ${minimumGap}`);
  }
});
