import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { correctedMesh, sliceSourceMesh, RECIPE } from "./uterosacral-registration.mjs";

const folder = new URL("../public/models/", import.meta.url);
const fixture = JSON.parse(
  await readFile(new URL("../data/anatomy/uterosacral-source.json", import.meta.url)),
);
const atlas = JSON.parse(await readFile(new URL("atlas-female.json", folder)));
const source = JSON.parse(await readFile(new URL("female-source.json", folder)));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const filename = (url) => url.split("/").pop();
const chunkIndex = atlas.parts.find((p) => p.id === fixture.parts[0].id).chunk;
const chunk = atlas.chunks[chunkIndex];
const compressed = await readFile(new URL(filename(chunk.gzip), folder));
assert.equal(
  hash(compressed),
  source.files.find((f) => f.path === filename(chunk.gzip) || f.name === filename(chunk.gzip))
    .sha256,
  "Run against the pinned imported assets, before local corrections.",
);
assert(!source.geometryChanged, "This script requires an unmodified import.");
const before = gunzipSync(compressed),
  summaries = [],
  pieces = [];
let offset = 0;
const append = (bytes) => {
  const padding = Buffer.alloc((4 - (offset % 4)) % 4);
  pieces.push(padding, bytes);
  const start = offset + padding.length;
  offset = start + bytes.length;
  return start;
};
await mkdir(new URL("../work/", import.meta.url), { recursive: true });
await writeFile(new URL("../work/female-before.bin", import.meta.url), before);
for (const original of fixture.parts) {
  const part = atlas.parts.find((p) => p.id === original.id);
  assert.equal(part.chunk, chunkIndex);
  const refined = sliceSourceMesh(original),
    mesh = correctedMesh(refined, fixture);
  const positions = Buffer.alloc(mesh.positions.length * 12),
    normals = Buffer.alloc(mesh.normals.length * 2),
    indices = Buffer.alloc(refined.indices.length * 4);
  mesh.positions.flat().forEach((v, i) => positions.writeFloatLE(v, i * 4));
  mesh.normals.forEach((v, i) => normals.writeInt16LE(v, i * 2));
  refined.indices.forEach((v, i) => indices.writeUInt32LE(v, i * 4));
  part.chunk = atlas.chunks.length;
  part.vertexCount = mesh.positions.length;
  part.indexCount = refined.indices.length;
  part.positions = append(positions);
  part.normals = append(normals);
  part.indices = append(indices);
  part.bounds = [0, 1].map((end) =>
    [0, 1, 2].map((axis) => (end ? Math.max : Math.min)(...mesh.positions.map((p) => p[axis]))),
  );
  part.provenance.adaptation +=
    "; source surface tessellated at 0.25 mm depth intervals before monotone uterosacral registration; posterior cap follows the recorded pelvic transform, cervicovaginal cap retained; no posterior path overshoot; source attachment anatomy remains unreviewed";
  part.provenance.registrationReport = "/models/female-ligament-fit-report.json";
  summaries.push({
    id: part.id,
    minimumVertexJacobian: mesh.minimumJacobian,
    anteriorOriginalVerticesUnchanged: original.anterior.length,
    posteriorOriginalVerticesInPelvicFrame: original.posterior.length,
    sourceTriangles: original.indices.length / 3,
    correctedTriangles: part.indexCount / 3,
  });
}
const after = Buffer.concat(pieces);
const gzip = gzipSync(after, { level: 9, mtime: 0 });
const name = `female-ligament-registration-${hash(after).slice(0, 16)}.bin`;
atlas.chunks.push({
  url: `/models/${name}`,
  bytes: after.length,
  gzip: `/models/${name}.gz`,
  gzipBytes: gzip.length,
});
await writeFile(new URL(name + ".gz", folder), gzip);
atlas.triangles = atlas.parts.reduce((sum, p) => sum + p.indexCount / 3, 0);
atlas.localRegistrationReport = "/models/female-ligament-fit-report.json";
await writeFile(new URL("atlas-female.json", folder), JSON.stringify(atlas));
// Retain uncompressed equivalents for browsers without DecompressionStream.
for (const c of atlas.chunks)
  await writeFile(
    new URL(filename(c.url), folder),
    gunzipSync(await readFile(new URL(filename(c.gzip), folder))),
  );
const correction = {
  schemaVersion: 1,
  sourceRevision: fixture.revision,
  recipe: RECIPE,
  method:
    "Tessellate the source surfaces without changing their shape; join the recorded reproductive/pelvic registrations using a strictly monotone, C1 posterior-depth interpolant, then apply the unchanged pelvic body morph.",
  validationScope:
    "Source registration consistency and mesh integrity. No independent anatomical review; source soft-tissue attachments are not reconstructed or asserted to attach directly to sacral bone.",
  references: [
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC3515066/",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC3986864/",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC1226709/",
  ],
  originalChunk: chunkIndex,
  addedChunk: atlas.chunks.length - 1,
  originalChunkHash: hash(before),
  correctedChunkHash: hash(after),
  parts: summaries,
};
await writeFile(
  new URL("female-ligament-fit-report.json", folder),
  JSON.stringify(correction, null, 2),
);
source.upstreamFiles = source.files;
source.geometryChanged = true;
source.modifications = {
  parts: fixture.parts.map((p) => p.id),
  report: "female-ligament-fit-report.json",
  method: correction.method,
};
const paths = [
  ...source.upstreamFiles.map((f) => f.path ?? f.name),
  ...atlas.chunks.map((c) => filename(c.url)),
  name + ".gz",
  "female-ligament-fit-report.json",
];
source.files = await Promise.all(
  paths.map(async (path) => {
    const b = await readFile(new URL(path, folder));
    return { path, bytes: b.length, sha256: hash(b) };
  }),
);
await writeFile(new URL("female-source.json", folder), JSON.stringify(source, null, 2));
// Verify the delivered geometry independently before recording its measurements.
execFileSync(
  process.execPath,
  [fileURLToPath(new URL("./female-ligaments.test.mjs", import.meta.url)), "--report"],
  { cwd: fileURLToPath(new URL("../", import.meta.url)), maxBuffer: 1024 * 1024 },
);
correction.measurements = JSON.parse(
  await readFile(new URL("../work/ligament-measurements.json", import.meta.url)),
);
const verifiedReport = Buffer.from(JSON.stringify(correction, null, 2));
await writeFile(new URL("female-ligament-fit-report.json", folder), verifiedReport);
const reportFile = source.files.find((file) => file.path === "female-ligament-fit-report.json");
reportFile.bytes = verifiedReport.length;
reportFile.sha256 = hash(verifiedReport);
await writeFile(new URL("female-source.json", folder), JSON.stringify(source, null, 2));
console.log(JSON.stringify(summaries, null, 2));
