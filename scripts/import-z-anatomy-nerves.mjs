import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { gzipSync } from "node:zlib";
import { Vector3, Matrix3 } from "three";
import {
  hash,
  loadRecipe,
  sourceScene,
  worldMesh,
  simplifyMesh,
  tessellateForMorph,
  registerMesh,
  distalMorph,
  femaleMorph,
  packMeshes,
  installSupplement,
} from "./z-anatomy-nerves.mjs";

const args = process.argv.slice(2),
  arg = (name) => args[args.indexOf(name) + 1];
if (!args.includes("--source-dir"))
  throw new Error("Use --source-dir <folder> [--download] [--review-dir <folder>].");
const sourceDir = resolve(arg("--source-dir")),
  models = new URL("../public/models/", import.meta.url);
const recipe = await loadRecipe();
if (args.includes("--download")) {
  await mkdir(sourceDir, { recursive: true });
  for (const file of recipe.files) {
    let bytes;
    try {
      bytes = await readFile(resolve(sourceDir, file.name));
    } catch {
      /* download missing source */
    }
    if (bytes && hash(bytes) === file.sha256) continue;
    const response = await fetch(
      `https://raw.githubusercontent.com/LluisV/Z-Anatomy/${recipe.revision}/${file.path}`,
    );
    if (!response.ok) throw new Error(`${file.name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== file.sha256) throw new Error(`${file.name}: source checksum differs.`);
    await writeFile(resolve(sourceDir, file.name), bytes);
  }
}
const nerveFile = recipe.files.find((f) => f.name === "NervousSystem100.fbx");
const licenseFile = recipe.files.find((f) => f.name === "License.txt");
if (hash(await readFile(resolve(sourceDir, licenseFile.name))) !== licenseFile.sha256)
  throw new Error("Unexpected Z-Anatomy model notice.");
const nodes = await sourceScene(resolve(sourceDir, nerveFile.name), nerveFile);
const meshes = [];
for (const record of recipe.parts) {
  const node = nodes.get(record.sourceNodeId);
  if (
    !node ||
    node.userData.originalName !== record.sourceName ||
    node.geometry.attributes.position.count !== record.sourceVertices ||
    (node.geometry.index?.count ?? node.geometry.attributes.position.count) !==
      record.sourceTriangles * 3
  )
    throw new Error(`Unexpected source mesh identity: ${record.sourceName}`);
  if (
    record.sourceName === "Common plantar digital branches of medial plantar nerve" &&
    node.parent.userData.originalName !== "Medial plantar nerve.r"
  )
    throw new Error("Missing right-side hierarchy evidence.");
  const simplified = await simplifyMesh(worldMesh(node));
  if (simplified.simplificationErrorM > 0.0001001)
    throw new Error(`Excess simplification: ${record.sourceName}`);
  meshes.push({ record, mesh: tessellateForMorph(simplified) });
}
const male = JSON.parse(await readFile(new URL("atlas.json", models)));
const female = JSON.parse(await readFile(new URL("atlas-female.json", models)));
const femaleFit = JSON.parse(await readFile(new URL("female-fit-report.json", models)));

// An independent measurement against corresponding bones, including six bones
// excluded from the fit. Distances are to sampled vertices, not clinical accuracy.
const boneFile = recipe.files.find((f) => f.name === "SkeletalSystem100.fbx");
const bones = await sourceScene(resolve(sourceDir, boneFile.name), boneFile);
const rotation = new Matrix3().set(...recipe.registration.rotation.flat());
const buffers = new Map(),
  anchors = [],
  metrics = [];
const unique = (positions) => {
  const map = new Map();
  for (let i = 0; i < positions.length; i += 3) {
    const point = Array.from(positions.slice(i, i + 3));
    map.set(point.join(","), point);
  }
  return [...map.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
};
const percentile = (values, fraction) => {
  const index = (values.length - 1) * fraction,
    lo = Math.floor(index),
    hi = Math.ceil(index);
  return values[lo] + (values[hi] - values[lo]) * (index - lo);
};
const boneAnchor = async (landmark, atlas = male) => {
  const bone = landmark.sourceNodeId
    ? bones.get(landmark.sourceNodeId)
    : [...bones.values()].find((b) => b.userData.originalName === landmark.sourceName);
  const part = atlas.parts.find((p) => p.id === landmark.id);
  if (
    !bone ||
    bone.userData.originalName !== landmark.sourceName ||
    !part ||
    (landmark.name && part.name !== landmark.name)
  )
    throw new Error(`Missing registration bone: ${landmark.id}`);
  const url = atlas.chunks[part.chunk].url;
  if (!buffers.has(url)) buffers.set(url, await readFile(new URL(basename(url), models)));
  const b = buffers.get(url),
    target = unique(
      new Float32Array(b.buffer, b.byteOffset + part.positions, part.vertexCount * 3),
    );
  const source = unique(worldMesh(bone).positions),
    count = Math.min(400, source.length);
  const sampled = Array.from(
    { length: count },
    (_, i) => source[Math.floor((i * (source.length - 1)) / (count - 1))],
  );
  return { part, target, source: sampled };
};
const globalPoint = (point) =>
  new Vector3(...point)
    .applyMatrix3(rotation)
    .toArray()
    .map((v, i) => v + recipe.registration.offset[i]);
const measure = (source, target) => {
  const distances = source
    .map((q) => {
      let squared = Infinity;
      for (const t of target)
        squared = Math.min(
          squared,
          q.reduce((sum, v, i) => sum + (v - t[i]) ** 2, 0),
        );
      return Math.sqrt(squared) * 1000;
    })
    .sort((a, b) => a - b);
  return {
    medianMm: percentile(distances, 0.5),
    p95Mm: percentile(distances, 0.95),
    maxMm: distances.at(-1),
  };
};
for (const landmark of recipe.registration.landmarks) {
  const { part, target, source: sampled } = await boneAnchor(landmark);
  const metric = {
    id: part.id,
    name: part.name,
    sourceName: landmark.sourceName,
    usedForFit: landmark.usedForFit,
    ...measure(sampled.map(globalPoint), target),
  };
  if (metric.p95Mm > 40 || metric.maxMm > 70)
    throw new Error(`Registration source drift: ${part.name}`);
  metrics.push(metric);
  anchors.push({ ...metric, source: sampled, target });
}
const distalAnchors = [],
  distalMetrics = { male: [], female: [] };
for (const region of recipe.registration.distalRegions) {
  if (Math.abs(new Matrix3().set(...region.rotation.flat()).determinant() - 1) > 1e-8)
    throw new Error(`Distal registration must preserve chirality: ${region.region}`);
  for (const landmark of region.landmarks) {
    const { part, target, source } = await boneAnchor(landmark),
      registered = source.map(globalPoint);
    distalAnchors.push({ ...landmark, region: region.region, source: registered, target });
    for (const atlas of [male, female]) {
      const adapted = atlas.sex === "female" ? (p) => femaleMorph(p, femaleFit.morph) : (p) => p;
      const targetPoints =
        atlas.sex === "male" ? target : (await boneAnchor(landmark, atlas)).target;
      const before = measure(registered.map(adapted), targetPoints);
      const after = measure(
        registered.map((p) => adapted(distalMorph(p, recipe.registration.distalRegions))),
        targetPoints,
      );
      if (after.p95Mm > 5 || after.maxMm > 10)
        throw new Error(`Distal registration source drift: ${atlas.sex} ${part.name}`);
      distalMetrics[atlas.sex].push({
        id: part.id,
        name: part.name,
        region: region.region,
        usedForFit: landmark.usedForFit,
        before,
        after,
      });
    }
  }
}
if (args.includes("--review-dir")) {
  const review = resolve(arg("--review-dir"));
  await mkdir(review, { recursive: true });
  await writeFile(resolve(review, "anchors.json"), JSON.stringify(anchors));
  await writeFile(resolve(review, "distal-anchors.json"), JSON.stringify(distalAnchors));
}

const results = [],
  assets = new Map();
for (const [atlas, morph] of [
  [male, null],
  [female, femaleFit.morph],
]) {
  const registered = meshes.map(({ record, mesh }) => ({
    record,
    mesh: registerMesh(mesh, recipe.registration, morph),
  }));
  const packed = packMeshes(registered, `z-nerves-${atlas.sex}`);
  for (let i = 0; i < packed.chunks.length; i++) {
    const c = packed.chunks[i],
      name = basename(c.url),
      gz = gzipSync(packed.buffers[i], { level: 9 });
    c.gzip = `${c.url}.gz`;
    c.gzipBytes = gz.length;
    assets.set(name, packed.buffers[i]);
    assets.set(`${name}.gz`, gz);
  }
  const installed = installSupplement(atlas, packed, recipe);
  const expected = atlas.sex === "male" ? [2234, 3432] : [2245, 4248];
  if (
    installed.preservation.baseParts !== expected[0] ||
    installed.preservation.baseConcepts !== expected[1]
  )
    throw new Error(
      "The base catalogue differs from the reviewed import. Review its memberships first.",
    );
  if (
    recipe.base &&
    (installed.preservation.partsSha256 !== recipe.base[atlas.sex].partsSha256 ||
      installed.preservation.conceptsSha256 !== recipe.base[atlas.sex].conceptsSha256)
  )
    throw new Error("Base identities or concepts changed since the reviewed recipe.");
  const baseChunks = [];
  for (const c of installed.preservation.chunks) {
    const bytes = await readFile(new URL(basename(c.url), models));
    const sha256 = hash(bytes);
    const pin = recipe.base?.[atlas.sex].chunks?.find((p) => p.url === c.url);
    if (pin && pin.sha256 !== sha256) throw new Error(`Base geometry changed: ${c.url}`);
    baseChunks.push({ ...c, sha256 });
  }
  results.push({
    sex: atlas.sex,
    ...installed,
    baseChunks,
    addedTriangles: packed.parts.reduce((sum, p) => sum + p.indexCount / 3, 0),
    compressedBytes: packed.chunks.reduce((sum, c) => sum + c.gzipBytes, 0),
    minimumJacobian: Math.min(...registered.map(({ mesh }) => mesh.minimumJacobian)),
    parts: registered.map(({ record, mesh }) => ({
      id: record.id,
      sourceName: record.sourceName,
      sourceTriangles: record.sourceTriangles,
      triangles: mesh.indices.length / 3,
      simplificationErrorM: mesh.simplificationErrorM,
      bounds: mesh.bounds,
      minimumJacobian: mesh.minimumJacobian,
    })),
  });
}
const report = {
  schemaVersion: 1,
  source: "Z-Anatomy",
  repository: recipe.repository,
  revision: recipe.revision,
  license: recipe.license,
  verifiedOn: "2026-10-12",
  recipeSha256: hash(JSON.stringify(recipe)),
  files: recipe.files,
  method:
    "Pinned FBX object surfaces; centimetres to metres; rigid body and four local hand/foot bone fits; C1 spatial blending into forearms/shins; maximum 0.1 mm meshoptimizer error; conforming tessellation to 10 mm maximum source edges; inverse-transpose field normals, quantized. Female follows the existing non-breast body morph after the hand/foot correction.",
  limitations: [
    "Estimated registration between reference assemblies with differing proportions; sampled bone distances do not validate nerve courses or attachments.",
    "Source mesh names and branch courses are retained. Not a complete nervous system, independently reviewed anatomy, or a female-specific nerve dataset.",
  ],
  registration: {
    ...recipe.registration,
    landmarks: metrics,
    metric: "One-way nearest-vertex distances; up to 400 unique source vertices per bone",
    heldOutBones: metrics.filter((m) => !m.usedForFit).map((m) => m.id),
  },
  models: Object.fromEntries(
    results.map((r) => [
      r.sex,
      {
        ...r.preservation,
        baseChunks: r.baseChunks,
        totalParts: r.atlas.parts.length,
        totalConcepts: r.atlas.concepts.length,
        addedParts: r.parts.length,
        addedTriangles: r.addedTriangles,
        compressedBytes: r.compressedBytes,
        minimumJacobian: r.minimumJacobian,
        distalRegistration: distalMetrics[r.sex],
        parts: r.parts,
      },
    ]),
  ),
  assets: [...assets].map(([name, b]) => ({ path: name, bytes: b.length, sha256: hash(b) })),
};
for (const r of results)
  assets.set(
    r.sex === "male" ? "atlas.json" : "atlas-female.json",
    Buffer.from(JSON.stringify(r.atlas)),
  );
assets.set("z-anatomy-source.json", Buffer.from(JSON.stringify(report, null, 2) + "\n"));
const femaleSource = JSON.parse(await readFile(new URL("female-source.json", models)));
const delivered = femaleSource.files.find((f) => f.path === "atlas-female.json"),
  bytes = assets.get("atlas-female.json");
delivered.bytes = bytes.length;
delivered.sha256 = hash(bytes);
femaleSource.neuralSupplement = {
  source: "Z-Anatomy",
  license: recipe.license,
  revision: recipe.revision,
  provenance: "z-anatomy-source.json",
  parts: recipe.parts.length,
  adaptation: "Same estimated non-breast body morph; no female-specific nerve validation",
};
assets.set("female-source.json", Buffer.from(JSON.stringify(femaleSource, null, 2)));
// All identities, source hashes and transformations have been checked before publishing files.
for (const [name, b] of assets) await writeFile(new URL(name, models), b);
console.log(
  JSON.stringify(
    results.map((r) => ({
      model: r.sex,
      addedMeshes: r.parts.length,
      addedTriangles: r.addedTriangles,
      gzipBytes: r.compressedBytes,
      minimumJacobian: r.minimumJacobian,
    })),
  ),
);
