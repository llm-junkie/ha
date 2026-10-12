import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { Vector3, Triangle } from "three";
import {
  registration,
  correctedMesh,
  pelvicMorph,
  sliceSourceMesh,
} from "./uterosacral-registration.mjs";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const [atlas, fixture, report, source] = await Promise.all(
  [
    "public/models/atlas-female.json",
    "data/anatomy/uterosacral-source.json",
    "public/models/female-ligament-fit-report.json",
    "public/models/female-source.json",
  ].map((p) => read(p).then(JSON.parse)),
);
const buffers = await Promise.all(
  atlas.chunks.map((c) => read(`public${c.gzip}`).then(gunzipSync)),
);
const mesh = (id) => {
  const p = atlas.parts.find((p) => p.id === id),
    b = buffers[p.chunk];
  return {
    part: p,
    positions: Array.from({ length: p.vertexCount }, (_, i) =>
      [0, 1, 2].map((j) => b.readFloatLE(p.positions + (i * 3 + j) * 4)),
    ),
    indices: Array.from({ length: p.indexCount }, (_, i) => b.readUInt32LE(p.indices + i * 4)),
  };
};
const sacrum = mesh("VH_F_sacrum");
function nearest(point, mesh) {
  const p = new Vector3(...point),
    q = new Vector3(),
    t = new Triangle();
  let distance = Infinity;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    t.set(...mesh.indices.slice(i, i + 3).map((j) => new Vector3(...mesh.positions[j])));
    t.closestPointToPoint(p, q);
    distance = Math.min(distance, p.distanceTo(q));
  }
  return distance * 1000;
}
const range = (values) => ({
  min: Math.min(...values),
  max: Math.max(...values),
  mean: values.reduce((s, v) => s + v, 0) / values.length,
});
const measurements = [];
for (const original of fixture.parts) {
  const refined = sliceSourceMesh(original),
    actual = mesh(original.id),
    transform = registration(original, fixture),
    expected = correctedMesh(refined, fixture);
  test(`${original.id}: retains the source surface and the complete cervicovaginal cap`, () => {
    assert.deepEqual(actual.indices, refined.indices);
    const area = (source) => {
      let sum = 0;
      for (let k = 0; k < source.indices.length; k += 3)
        sum += new Triangle(
          ...source.indices.slice(k, k + 3).map((i) => new Vector3(...source.positions[i])),
        ).getArea();
      return sum;
    };
    assert(
      Math.abs(area(refined) / area(original) - 1) < 1e-8,
      "Source tessellation preserves the original surface area.",
    );
    assert.deepEqual(actual.positions, expected.positions);
    for (const i of original.anterior) {
      assert.equal(transform.weight(original.positions[i]), 0);
      assert.deepEqual(actual.positions[i], original.baselinePositions[i]);
    }
    for (let i = 0; i < original.positions.length; i++)
      if (nearest(original.positions[i], fixture.sourceCervicovaginal) <= 5)
        assert.deepEqual(
          actual.positions[i],
          original.baselinePositions[i],
          "Every source vertex within 5 mm of the genital attachment region stays unchanged.",
        );
    const b = buffers[actual.part.chunk];
    for (let i = 0; i < actual.part.vertexCount; i++)
      for (let j = 0; j < 3; j++)
        assert.equal(
          b.readInt16LE(actual.part.normals + (i * 3 + j) * 2),
          expected.normals[i * 3 + j],
        );
  });
  test(`${original.id}: restores the source posterior relationship in the pelvic frame`, () => {
    for (const i of original.posterior) {
      assert.equal(transform.weight(original.positions[i]), 1);
      const p = original.positions[i].map(
        (v, j) => v * fixture.transforms.pelvis.scale[j] + fixture.transforms.pelvis.offset[j],
      );
      const target = pelvicMorph(p, fixture.morph);
      assert(Math.hypot(...actual.positions[i].map((v, j) => v - target[j])) < 1e-7);
      assert(
        nearest(original.baselinePositions[i], sacrum) > 40,
        "Regression fixture must reproduce the protrusion.",
      );
      assert(
        nearest(actual.positions[i], sacrum) < 4,
        "Corrected posterior cap stays in the source presacral region.",
      );
    }
  });
  test(`${original.id}: has no sampled folds, newly degenerate triangles, or reversed surface orientation`, () => {
    const vertex = (positions, i) => new Vector3(...positions[i]);
    for (let k = 0; k < refined.indices.length; k += 3) {
      const ids = refined.indices.slice(k, k + 3);
      const triangle = (positions) => new Triangle(...ids.map((i) => vertex(positions, i)));
      const before = triangle(refined.baselinePositions),
        after = triangle(actual.positions);
      if (before.getArea() > 1e-12)
        assert(after.getArea() > before.getArea() * 0.01, "No newly collapsed faces.");
      const sourceTriangle = triangle(refined.positions),
        centroid = sourceTriangle.getMidpoint(new Vector3()).toArray();
      const differential = transform.differential(centroid);
      assert(differential.determinant > 0);
      const expectedNormal = sourceTriangle
        .getNormal(new Vector3())
        .applyMatrix3(differential.normalMatrix)
        .normalize();
      if (sourceTriangle.getArea() > 1e-12)
        assert(after.getNormal(new Vector3()).dot(expectedNormal) > 0.9);
    }
    for (const p of refined.positions) assert(transform.differential(p).determinant > 0);
    const ordered = refined.positions
      .map((p, i) => i)
      .sort((a, b) => refined.positions[b][2] - refined.positions[a][2]);
    for (let k = 1; k < ordered.length; k++)
      assert(
        actual.positions[ordered[k]][2] <= actual.positions[ordered[k - 1]][2] + 1e-7,
        "The registered path cannot reverse its posterior course.",
      );
  });
  measurements.push({
    id: original.id,
    posteriorSurfaceDistanceMm: {
      source: range(
        original.posterior.map((i) => nearest(original.positions[i], fixture.sourceSacrum)),
      ),
      before: range(original.posterior.map((i) => nearest(original.baselinePositions[i], sacrum))),
      after: range(original.posterior.map((i) => nearest(actual.positions[i], sacrum))),
    },
    anteriorVerticesUnchanged: original.anterior.length,
    minimumVertexJacobian: expected.minimumJacobian,
  });
}
test("the correction modifies only the two ligaments and all delivered assets match their provenance record", async () => {
  assert.equal(hash(buffers[report.originalChunk]), report.originalChunkHash);
  assert.equal(hash(buffers[report.addedChunk]), report.correctedChunkHash);
  for (const file of source.files)
    assert.equal(hash(await read(`public/models/${file.path}`)), file.sha256, file.path);
  for (const file of source.upstreamFiles.filter((f) => (f.path ?? f.name) !== "atlas-female.json"))
    assert.equal(
      hash(await read(`public/models/${file.path ?? file.name}`)),
      file.sha256,
      "Unrelated imported assets retain their upstream bytes.",
    );
});
if (process.argv.includes("--report")) {
  await mkdir(new URL("../work/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../work/ligament-measurements.json", import.meta.url),
    JSON.stringify(measurements, null, 2),
  );
  console.log(JSON.stringify(measurements, null, 2));
}
