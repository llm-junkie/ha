import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { Matrix3, Vector3 } from "three";
import { MeshoptSimplifier } from "meshoptimizer";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const loadRecipe = async () =>
  JSON.parse(await readFile(new URL("../data/anatomy/z-anatomy-nerves.json", import.meta.url)));

export async function sourceScene(path, expected) {
  const bytes = await readFile(path);
  if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256)
    throw new Error(`Unexpected Z-Anatomy source: ${expected.name}`);
  const scene = new FBXLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  scene.updateMatrixWorld(true);
  const nodes = new Map();
  scene.traverse((object) => {
    if (object.isMesh && object.geometry.attributes.position?.count) nodes.set(object.ID, object);
  });
  return nodes;
}

// Extract only this object's surface. Its descendants are separate named meshes;
// including them here would duplicate nerves and give incorrect bounds.
export function worldMesh(object) {
  const geometry = object.geometry,
    p = geometry.attributes.position,
    n = geometry.attributes.normal;
  const normalMatrix = new Matrix3().getNormalMatrix(object.matrixWorld);
  const positions = new Float32Array(p.count * 3),
    normals = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    positions.set(
      new Vector3()
        .fromBufferAttribute(p, i)
        .applyMatrix4(object.matrixWorld)
        .multiplyScalar(0.01)
        .toArray(),
      i * 3,
    ); // FBX world is centimetres, Y-up.
    normals.set(
      new Vector3().fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize().toArray(),
      i * 3,
    );
  }
  const indices = geometry.index
    ? Uint32Array.from(geometry.index.array)
    : Uint32Array.from({ length: p.count }, (_, i) => i);
  if (object.matrixWorld.determinant() < 0)
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  return { positions, normals, indices };
}

export function bounds(positions) {
  const low = [Infinity, Infinity, Infinity],
    high = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    low[i % 3] = Math.min(low[i % 3], positions[i]);
    high[i % 3] = Math.max(high[i % 3], positions[i]);
  }
  return [low, high];
}

export async function simplifyMesh(mesh, maximumErrorM = 0.0001) {
  await MeshoptSimplifier.ready;
  // FBX stores separate triangle corners. Weld identical corners, retaining normal seams.
  const map = new Map(),
    remap = [],
    p = [],
    n = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const point = mesh.positions.slice(i, i + 3),
      normal = mesh.normals.slice(i, i + 3);
    const key = [...point, ...normal.map((v) => Math.round(v * 32767))].join(",");
    let index = map.get(key);
    if (index === undefined) {
      index = p.length / 3;
      map.set(key, index);
      p.push(...point);
      n.push(...normal);
    }
    remap.push(index);
  }
  const positions = Float32Array.from(p),
    normals = Float32Array.from(n);
  const indices = Uint32Array.from(mesh.indices, (i) => remap[i]);
  const [simplified, error] = MeshoptSimplifier.simplify(
    indices,
    positions,
    3,
    Math.min(indices.length, Math.max(96, Math.floor((indices.length * 0.22) / 3) * 3)),
    maximumErrorM,
    ["ErrorAbsolute"],
  );
  const [compact, count] = MeshoptSimplifier.compactMesh(simplified);
  const outP = new Float32Array(count * 3),
    outN = new Float32Array(count * 3);
  for (let i = 0; i < compact.length; i++)
    if (compact[i] !== 0xffffffff) {
      outP.set(positions.subarray(i * 3, i * 3 + 3), compact[i] * 3);
      outN.set(normals.subarray(i * 3, i * 3 + 3), compact[i] * 3);
    }
  return { positions: outP, normals: outN, indices: simplified, simplificationErrorM: error };
}

const clamp = (t) => Math.max(0, Math.min(1, t));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lateral = (y, knots) => {
  if (y < knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++)
    if (y < knots[i][0]) {
      const [a, x] = knots[i - 1],
        [b, z] = knots[i];
      return x + (z - x) * smooth(a, b, y);
    }
  return knots.at(-1)[1];
};

// The existing female assembly's shared non-breast morph. The glute projection is
// explicitly restricted upstream to four existing muscles/veins, so it does not
// apply to the neural supplement. Parameters come from female-fit-report.json.
export function femaleMorph([x, y, z], m) {
  const r = m.lateralRadius,
    b = m.lateralBlend;
  const factor = lateral(y, m.lateralKnots),
    reference = lateral(y, b.referenceKnots);
  const w = smooth(b.innerRadius, b.outerRadius, Math.abs(x)),
    h = b.heightRamp;
  const outer =
    Math.sign(x) * b.outerTranslation * smooth(h[0], h[1], y) * (1 - smooth(h[2], h[3], y));
  let dx =
    (reference - 1) * r * Math.tanh(x / r) +
    (1 - w) * (factor - reference) * r * Math.tanh(x / r) +
    w * outer;
  const waist = m.waistRefinement,
    wh = waist.heightRamp;
  dx +=
    waist.delta *
    r *
    Math.tanh(x / r) *
    smooth(wh[0], wh[1], y) *
    (1 - smooth(wh[1], wh[2], y)) *
    (1 - smooth(...waist.radialRamp, Math.abs(x)));
  const t = m.thoraxDepth,
    th = t.ramp;
  const q = [
    x + dx,
    y,
    z + z * (t.scale - 1) * smooth(th[0], th[1], y) * (1 - smooth(th[2], th[3], y)),
  ];
  const nose = m.nose,
    radius2 =
      ((x - nose.center[0]) / nose.radius[0]) ** 2 + ((y - nose.center[1]) / nose.radius[1]) ** 2;
  q[2] -=
    (1 - smooth(0, 1, radius2)) *
    smooth(nose.plane - nose.rampDepth, nose.plane + nose.rampDepth, z) *
    (1 - nose.scale) *
    (z - nose.plane);
  const head = m.head,
    hw = smooth(...head.ramp, y);
  return q.map((v, i) => (v - hw * (1 - head.scale) * (v - head.center[i])) * m.stature);
}

export function differential(map, point) {
  const h = 1e-6;
  const columns = [0, 1, 2].map((axis) => {
    const a = [...point],
      b = [...point];
    a[axis] += h;
    b[axis] -= h;
    const high = map(a),
      low = map(b);
    return high.map((v, i) => (v - low[i]) / (2 * h));
  });
  return new Matrix3().set(...[0, 1, 2].flatMap((row) => columns.map((c) => c[row])));
}

// The reference assemblies have different hand offsets and foot rotations.
// Apply a bone-fitted rigid transform at each extremity, fading continuously
// into the forearm/shin. The same spatial field applies to every nerve mesh,
// including parent nerves crossing the wrist/ankle, so branches stay joined.
const distalWeight = ([x, y], region) =>
  (region.blend.lowerHeight ? smooth(...region.blend.lowerHeight, y) : 1) *
  (1 - smooth(...region.blend.height, y)) *
  smooth(...region.blend.lateral, region.blend.side * x);

export function distalMorph(point, regions = []) {
  const out = [...point];
  for (const region of regions) {
    const weight = distalWeight(point, region);
    if (!weight) continue;
    for (let i = 0; i < 3; i++) {
      const fitted = region.rotation[i].reduce((sum, v, j) => sum + v * point[j], region.offset[i]);
      out[i] += weight * (fitted - point[i]);
    }
  }
  return out;
}

// Long triangles from simplification cannot follow a curved body field. Split
// shared edges conformingly before either registration, retaining the same
// source surface and shared male/female topology. This avoids twisted faces and
// cracks where the existing female waist/shoulder field changes rapidly.
export function tessellateForMorph(mesh, maximumEdgeM = 0.01) {
  const positions = Array.from(mesh.positions),
    normals = Array.from(mesh.normals);
  let indices = Array.from(mesh.indices);
  const key = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let pass = 0; pass < 12; pass++) {
    const midpoints = new Map();
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3);
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const k = key(u, v);
        if (midpoints.has(k)) continue;
        const distance = Math.hypot(
          ...[0, 1, 2].map((j) => positions[u * 3 + j] - positions[v * 3 + j]),
        );
        if (distance <= maximumEdgeM) continue;
        const id = positions.length / 3;
        midpoints.set(k, id);
        positions.push(...[0, 1, 2].map((j) => (positions[u * 3 + j] + positions[v * 3 + j]) / 2));
        normals.push(
          ...new Vector3(...[0, 1, 2].map((j) => normals[u * 3 + j] + normals[v * 3 + j]))
            .normalize()
            .toArray(),
        );
      }
    }
    if (!midpoints.size)
      return {
        ...mesh,
        positions: Float32Array.from(positions),
        normals: Float32Array.from(normals),
        indices: Uint32Array.from(indices),
      };
    const next = [];
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3),
        ab = midpoints.get(key(a, b)),
        bc = midpoints.get(key(b, c)),
        ca = midpoints.get(key(c, a));
      const mask =
        (ab === undefined ? 0 : 1) | (bc === undefined ? 0 : 2) | (ca === undefined ? 0 : 4);
      const faces = [
        [a, b, c],
        [a, ab, c, ab, b, c],
        [a, b, bc, a, bc, c],
        [ab, b, bc, a, ab, c, ab, bc, c],
        [a, b, ca, ca, b, c],
        [a, ab, ca, ab, b, c, ab, c, ca],
        [bc, c, ca, a, b, bc, a, bc, ca],
        [a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca],
      ][mask];
      next.push(...faces);
    }
    indices = next;
  }
  throw new Error("Neural body-morph tessellation did not converge.");
}

export function registerMesh(mesh, registration, morph) {
  const rotation = new Matrix3().set(...registration.rotation.flat());
  if (Math.abs(rotation.determinant() - 1) > 1e-8)
    throw new Error("Registration must preserve chirality and scale.");
  const positions = new Float32Array(mesh.positions.length),
    normals = new Int16Array(mesh.normals.length);
  let minimumJacobian = 1;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = new Vector3(...mesh.positions.subarray(i, i + 3))
      .applyMatrix3(rotation)
      .toArray()
      .map((v, j) => v + registration.offset[j]);
    const normal = new Vector3(...mesh.normals.subarray(i, i + 3)).applyMatrix3(rotation);
    let q = distalMorph(p, registration.distalRegions);
    let jacobian = new Matrix3();
    if (registration.distalRegions?.some((region) => distalWeight(p, region) > 0)) {
      jacobian = differential((point) => distalMorph(point, registration.distalRegions), p);
    }
    if (morph) {
      const j = differential((point) => femaleMorph(point, morph), q);
      jacobian.premultiply(j);
      q = femaleMorph(q, morph);
    }
    const det = jacobian.determinant();
    minimumJacobian = Math.min(minimumJacobian, det);
    if (!(det > 0)) throw new Error("Neural registration folds.");
    normal.applyMatrix3(jacobian.invert().transpose());
    positions.set(q, i);
    normal.normalize();
    normals.set(
      normal.toArray().map((v) => Math.round(v * 32767)),
      i,
    );
  }
  return { ...mesh, positions, normals, minimumJacobian, bounds: bounds(positions) };
}

export function packMeshes(meshes, prefix) {
  const buffers = [],
    chunks = [],
    parts = [];
  let segments = [],
    bytes = 0;
  const flush = () => {
    if (!bytes) return;
    buffers.push(Buffer.concat(segments));
    chunks.push({ url: `/models/${prefix}-${chunks.length}.bin`, bytes });
    segments = [];
    bytes = 0;
  };
  const append = (array) => {
    const padding = (4 - (bytes % 4)) % 4;
    if (padding) {
      segments.push(Buffer.alloc(padding));
      bytes += padding;
    }
    const offset = bytes,
      b = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    segments.push(b);
    bytes += b.length;
    return offset;
  };
  for (const { record, mesh } of meshes) {
    if (bytes > 4_000_000) flush();
    parts.push({
      id: record.id,
      name: record.name,
      conceptId: `ZA_C${record.sourceNodeId}`,
      system: "nervous",
      chunk: chunks.length,
      positions: append(mesh.positions),
      normals: append(mesh.normals),
      indices: append(mesh.indices),
      vertexCount: mesh.positions.length / 3,
      indexCount: mesh.indices.length,
      bounds: mesh.bounds,
      provenance: {
        source: "Z-Anatomy",
        sourceNodeId: record.sourceNodeId,
        sourceName: record.sourceName,
        license: "CC-BY-SA-4.0",
        registration: "z-anatomy-source.json",
      },
    });
  }
  flush();
  return { parts, chunks, buffers };
}

export function supplementConcepts(parts, recipe) {
  const concepts = parts.map((p) => ({ id: p.conceptId, name: p.name, elements: [p.id] }));
  for (const [id, name, filter] of [
    ["ZA_PERIPHERAL", "Peripheral nerves and ganglia (Z-Anatomy)", (p) => p.role === "nerve"],
    [
      "ZA_BRACHIAL",
      "Brachial plexuses (represented roots, trunks and divisions)",
      (p) => /brachial plexus/.test(p.sourceName),
    ],
    [
      "ZA_ROOTS",
      "Spinal roots and cauda equina",
      (p) =>
        /^(Anterior root of spinal nerve|Posterior root of spinal nerve|Cauda equina)/.test(
          p.sourceName,
        ),
    ],
  ])
    concepts.push({ id, name, elements: recipe.parts.filter(filter).map((p) => p.id) });
  return concepts;
}

export function installSupplement(original, packed, recipe) {
  const atlas = structuredClone(original),
    oldChunks = atlas.chunks;
  atlas.parts = atlas.parts.filter((p) => !p.id.startsWith("ZA_N"));
  atlas.concepts = atlas.concepts.filter((c) => !c.id.startsWith("ZA_"));
  for (const c of atlas.concepts) c.elements = c.elements.filter((id) => !id.startsWith("ZA_N"));
  atlas.chunks = atlas.chunks.filter((c) => !/\/z-nerves-(male|female)-\d+\.bin$/.test(c.url));
  for (const p of atlas.parts)
    p.chunk = atlas.chunks.findIndex((c) => c.url === oldChunks[p.chunk].url);
  const baseParts = atlas.parts.length,
    baseConcepts = atlas.concepts.length;
  const preservation = {
    baseParts,
    baseConcepts,
    partsSha256: hash(JSON.stringify(atlas.parts)),
    conceptsSha256: hash(JSON.stringify(atlas.concepts)),
    chunks: structuredClone(atlas.chunks),
  };
  const offset = atlas.chunks.length;
  atlas.parts.push(...packed.parts.map((p) => ({ ...p, chunk: p.chunk + offset })));
  atlas.chunks.push(...packed.chunks);
  atlas.concepts.push(...supplementConcepts(packed.parts, recipe));
  // BodyParts3D's spinal-cord concept previously referenced only its tiny canal
  // mesh. Retain that membership, and extend it with actual cord neural tissue.
  const cord = atlas.concepts.find((c) => c.id === "FMA7647");
  if (!cord || cord.name.toLowerCase() !== "spinal cord")
    throw new Error("Unexpected spinal-cord concept.");
  cord.elements.push(...recipe.parts.filter((p) => p.role === "cord").map((p) => p.id));
  atlas.triangles = atlas.parts.reduce((s, p) => s + p.indexCount / 3, 0);
  if (atlas.optimized?.preservedMeshes) atlas.optimized.preservedMeshes = atlas.parts.length;
  atlas.supplements = [
    {
      source: "Z-Anatomy",
      license: "CC-BY-SA-4.0",
      provenance: "/models/z-anatomy-source.json",
      parts: packed.parts.length,
      reviewStatus: "Estimated registration; source anatomy is not independently validated",
    },
  ];
  atlas.licenses = {
    catalogue: "CC-BY-SA-4.0",
    "Z-Anatomy adaptations": "CC-BY-SA-4.0",
    "BodyParts3D source meshes": "CC-BY-4.0",
    ...(atlas.sex === "female" ? { "HRA source meshes": "CC-BY-4.0" } : {}),
  };
  atlas.source = atlas.sex === "male" ? "BodyParts3D + Z-Anatomy" : "BodyParts3D + HRA + Z-Anatomy";
  atlas.scope =
    atlas.sex === "male"
      ? `${baseParts.toLocaleString("en-US")} BodyParts3D meshes + ${packed.parts.length} Z-Anatomy neural meshes; estimated registration`
      : "Estimated female proportions and neural registration; experimental organ placement";
  return { atlas, preservation };
}
