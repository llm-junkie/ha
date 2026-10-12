import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { hash, simplifyMesh, bounds } from "./z-anatomy-nerves.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const models = resolve(root, "public/models");
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const recipe = JSON.parse(await readFile(resolve(root, "data/anatomy/female-skin.json")));
if (recipe.registration.posedExtremities) {
  const pin = recipe.registration.posedExtremities;
  const bytes = await readFile(resolve(root, "data/anatomy", pin.path));
  if (bytes.length !== pin.bytes || hash(bytes) !== pin.sha256) throw Error("Posed skin patches differ from the reviewed fixture.");
  if (hash(await readFile(resolve(models, pin.referenceChunk.path))) !== pin.referenceChunk.sha256 ||
      hash(await readFile(resolve(models, "female-fit-report.json"))) !== pin.referenceMorphReportSha256)
    throw Error("The skin patch reference or female morph changed; review the posed patches.");
}
const work = resolve(root, "work/female-skin-import");
const output = process.argv.includes("--output-dir") ? resolve(arg("--output-dir")) : models;
await mkdir(work, { recursive: true });
await mkdir(output, { recursive: true });
let original;
if (process.argv.includes("--source")) original = await readFile(resolve(arg("--source")));
else if (process.argv.includes("--download")) {
  const response = await fetch(recipe.source.url);
  if (!response.ok) throw Error(`Skin source download failed: HTTP ${response.status}`);
  original = Buffer.from(await response.arrayBuffer());
  await writeFile(resolve(work, "3d-vh-f-skin.glb"), original);
} else throw Error("Use --source <3d-vh-f-skin.glb> or --download.");
if (original.length !== recipe.source.bytes || hash(original) !== recipe.source.sha256)
  throw Error("The skin source differs from the pinned HRA release.");

const atlas = JSON.parse(await readFile(resolve(models, "atlas-female.json")));
const oldChunks = atlas.chunks;
atlas.parts = atlas.parts.filter((p) => p.id !== "VH_F_skin");
atlas.concepts = atlas.concepts.filter((c) => c.id !== "HRA:VH_F_skin");
atlas.chunks = atlas.chunks.filter((c) => !/\/female-skin-[a-f\d]+\.bin$/.test(c.url));
for (const p of atlas.parts) p.chunk = atlas.chunks.findIndex((c) => c.url === oldChunks[p.chunk].url);
if (hash(JSON.stringify(atlas.parts)) !== recipe.base.partsSha256 ||
    hash(JSON.stringify(atlas.concepts)) !== recipe.base.conceptsSha256)
  throw Error("The female assembly changed; review the skin registration against the new anatomy.");
for (const pin of recipe.base.chunks) {
  if (hash(await readFile(resolve(models, basename(pin.url)))) !== pin.sha256)
    throw Error(`The fitted anatomy changed: ${pin.url}`);
}

const jsonLength = original.readUInt32LE(12);
const gltf = JSON.parse(original.subarray(20, 20 + jsonLength));
const start = 20 + jsonLength + 8;
const node = gltf.nodes.find((n) => n.name === "VH_F_skin");
if (!node || ["translation", "rotation", "scale", "matrix"].some((key) => key in node))
  throw Error("Unexpected skin source transform.");
const primitive = gltf.meshes[node.mesh].primitives[0];
const accessor = (index, width, component) => {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  if (a.componentType !== component || (v.byteStride && v.byteStride !== width * 4) || a.sparse)
    throw Error("Unexpected source accessor.");
  const offset = start + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return component === 5126
    ? new Float32Array(original.buffer, original.byteOffset + offset, a.count * width)
    : new Uint32Array(original.buffer, original.byteOffset + offset, a.count * width);
};
const positions = Float32Array.from(accessor(primitive.attributes.POSITION, 3, 5126));
for (let i = 1; i < positions.length; i += 3) positions[i] += recipe.source.stageYOffsetM;
const mesh = await simplifyMesh({
  positions,
  normals: accessor(primitive.attributes.NORMAL, 3, 5126),
  indices: accessor(primitive.indices, 1, 5125),
}, recipe.source.maximumSimplificationErrorM);
for (const [name, values] of Object.entries({ positions: mesh.positions, indices: mesh.indices })) {
  const bytes = Buffer.from(values.buffer);
  if (hash(bytes) !== recipe.simplified[`${name}Sha256`])
    throw Error(`Simplified source ${name} changed. Review the registration before rebuilding.`);
  await writeFile(resolve(work, `source-${name}.bin`), bytes);
}
await writeFile(resolve(work, "source-normals.bin"), Buffer.from(mesh.normals.buffer));
execFileSync(process.env.PYTHON ?? "python", [
  resolve(root, "scripts/register-female-skin.py"), work,
  resolve(root, "data/anatomy/female-skin.json"),
], { stdio: "inherit" });
const fitted = await readFile(resolve(work, "fitted-positions.bin"));
const fittedIndices = await readFile(resolve(work, "fitted-indices.bin"));
const normalBytes = await readFile(resolve(work, "fitted-normals.bin"));
const normalFloats = new Float32Array(normalBytes.buffer, normalBytes.byteOffset, normalBytes.length / 4);
const normals = Int16Array.from(normalFloats, (n) => Math.max(-32767, Math.min(32767, Math.round(n * 32767))));
const pieces = [], offsets = [];
let length = 0;
for (const bytes of [fitted, Buffer.from(normals.buffer), fittedIndices]) {
  const padding = (4 - length % 4) % 4;
  if (padding) { pieces.push(Buffer.alloc(padding)); length += padding; }
  offsets.push(length); pieces.push(bytes); length += bytes.length;
}
const packed = Buffer.concat(pieces), compressed = gzipSync(packed, { level: 9 });
const name = `female-skin-${hash(packed).slice(0, 16)}.bin`;
const part = {
  id: "VH_F_skin", name: "Female body skin", conceptId: "HRA:VH_F_skin", system: "integumentary",
  chunk: atlas.chunks.length, positions: offsets[0], normals: offsets[1], indices: offsets[2],
  vertexCount: fitted.length / 12, indexCount: fittedIndices.length / 4,
  bounds: bounds(new Float32Array(fitted.buffer, fitted.byteOffset, fitted.length / 4)),
  provenance: {
    source: "Human Reference Atlas", sourceName: "VH_F_skin", ontologyId: "UBERON:0002097",
    license: "CC-BY-4.0", registration: "/models/female-skin-source.json",
    adaptation: "HRA female skin with posed BodyParts3D external hand/foot patches in the existing female body morph",
  },
};
atlas.parts.push(part);
atlas.concepts.push({ id: part.conceptId, name: part.name, elements: [part.id] });
atlas.chunks.push({ url: `/models/${name}`, bytes: packed.length, gzip: `/models/${name}.gz`, gzipBytes: compressed.length });
atlas.triangles = atlas.parts.reduce((sum, p) => sum + p.indexCount / 3, 0);
atlas.optimized.preservedMeshes = atlas.parts.length;
atlas.supplements = (atlas.supplements ?? []).filter((s) => s.provenance !== "/models/female-skin-source.json");
atlas.supplements.push({ source: "HRA female skin", license: "CC-BY-4.0", parts: 1,
  provenance: "/models/female-skin-source.json", reviewStatus: "Estimated surface fit; independent anatomical review pending" });
const catalogue = Buffer.from(JSON.stringify(atlas));
const checks = JSON.parse(await readFile(resolve(work, "registration-checks.json")));
const report = {
  schemaVersion: 1, source: recipe.source, license: "CC-BY-4.0", recipeSha256: hash(JSON.stringify(recipe)),
  method: recipe.method, limitations: recipe.limitations, base: recipe.base,
  registration: { controls: recipe.registration.positions.length, smoothing: recipe.registration.smoothing,
    torsoControlSmoothing: recipe.registration.torsoControlSmoothing,
    clearanceEnvelope: recipe.registration.clearanceEnvelope, ...checks },
  simplifiedSource: { ...recipe.simplified, errorM: mesh.simplificationErrorM },
  addedPart: part.id, addedConcept: part.conceptId, addedTriangles: part.indexCount / 3,
  assets: [ { path: name, bytes: packed.length, sha256: hash(packed) },
    { path: `${name}.gz`, bytes: compressed.length, sha256: hash(compressed) } ],
};
const reportBytes = Buffer.from(JSON.stringify(report, null, 2) + "\n");
const femaleSource = JSON.parse(await readFile(resolve(models, "female-source.json")));
const delivered = femaleSource.files.find((f) => (f.path ?? f.name) === "atlas-female.json");
delivered.bytes = catalogue.length; delivered.sha256 = hash(catalogue);
femaleSource.skinSupplement = { source: "Human Reference Atlas + BodyParts3D", license: "CC-BY-4.0", parts: 1,
  provenance: "female-skin-source.json", sourceSha256: recipe.source.sha256,
  adaptation: "Female HRA body surface with posed external BodyParts3D hand/foot patches fitted to the existing derived anatomy; experimental" };
femaleSource.files = femaleSource.files.filter((f) => !/^(female-skin-.*\.bin(?:\.gz)?|female-skin-source\.json)$/.test(f.path ?? f.name));
femaleSource.files.push(...report.assets, { path: "female-skin-source.json", bytes: reportBytes.length, sha256: hash(reportBytes) });
for (const [path, bytes] of [ [name, packed], [`${name}.gz`, compressed],
  ["atlas-female.json", catalogue], ["female-skin-source.json", reportBytes],
  ["female-source.json", Buffer.from(JSON.stringify(femaleSource, null, 2))] ])
  await writeFile(resolve(output, path), bytes);
console.log(`Added ${part.name}: ${part.vertexCount} vertices, ${part.indexCount / 3} triangles, ${(compressed.length / 1e6).toFixed(2)} MB compressed.`);
