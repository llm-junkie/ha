import { Matrix3, Vector3, Triangle } from "three";

export const RECIPE = {
  transition: [0.1, 0.95],
  coordinate: "source anterior–posterior depth",
  protectedSourceGenitalGapMm: 5,
  sliceSpacingM: 0.00025,
  precisionWeldM: 1e-7,
  monotoneDepth: true,
  revision: 3,
};
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const affine = (p, transform) => p.map((v, i) => v * transform.scale[i] + transform.offset[i]);
function lateral(y, knots) {
  if (y < knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [a, x] = knots[i - 1],
      [b, z] = knots[i];
    if (y < b) return x + (z - x) * smooth(a, b, y);
  }
  return knots.at(-1)[1];
}

// The pinned pelvic meshes are below the waist/thorax/head fields and are excluded
// from the upstream glute-only field. Reproduce their shared body morph exactly.
export function pelvicMorph([x, y, z], m) {
  if (y >= Math.min(m.waistRefinement.heightRamp[0], m.thoraxDepth.ramp[0]))
    throw new Error("This registration only supports the pinned pelvic source.");
  const r = m.lateralRadius,
    b = m.lateralBlend;
  const factor = lateral(y, m.lateralKnots),
    reference = lateral(y, b.referenceKnots);
  const w = smooth(b.innerRadius, b.outerRadius, Math.abs(x)),
    h = b.heightRamp;
  const outer =
    Math.sign(x) * b.outerTranslation * smooth(h[0], h[1], y) * (1 - smooth(h[2], h[3], y));
  const dx =
    (reference - 1) * r * Math.tanh(x / r) +
    (1 - w) * (factor - reference) * r * Math.tanh(x / r) +
    w * outer;
  return [(x + dx) * m.stature, y * m.stature, z * m.stature];
}

export function registration(source, fixture) {
  const zs = source.positions.map((p) => p[2]),
    front = Math.max(...zs),
    back = Math.min(...zs),
    span = front - back;
  const [start, end] = RECIPE.transition.map((t) => front - span * t),
    length = start - end;
  const a = fixture.transforms.reproductive,
    b = fixture.transforms.pelvis;
  const startDepth = start * a.scale[2] + a.offset[2],
    endDepth = end * b.scale[2] + b.offset[2];
  const secant = (startDepth - endDepth) / length;
  if (secant <= 0)
    throw new Error(
      "The source attachments cannot be joined by a posterior-directed registration.",
    );
  // Integrate a strictly positive derivative, with the original affine slopes
  // at both caps. This avoids a loop/overshoot when the source depth is shortened.
  const epsilon = Math.min(0.1, secant / (2.5 * (a.scale[2] + b.scale[2])));
  const edge = Math.exp(-1 / epsilon),
    h = (epsilon * (1 - edge)) / (1 + edge);
  const slope = (secant - h * (a.scale[2] + b.scale[2])) / (1 - 2 * h);
  const first = (a.scale[2] - slope - edge * (b.scale[2] - slope)) / (1 - edge * edge);
  const last = (b.scale[2] - slope - edge * (a.scale[2] - slope)) / (1 - edge * edge);
  if (slope <= 0 || first < 0 || last < 0) throw new Error("Non-monotone registration derivative.");
  const weight = (p) => {
    if (p[2] >= start) return 0;
    if (p[2] <= end) return 1;
    const t = (start - p[2]) / length;
    const distance =
      length *
      (slope * t +
        first * epsilon * (1 - Math.exp(-t / epsilon)) +
        last * epsilon * (Math.exp(-(1 - t) / epsilon) - edge));
    const depth = startDepth - distance;
    const ra = p[2] * a.scale[2] + a.offset[2],
      rb = p[2] * b.scale[2] + b.offset[2];
    return (depth - ra) / (rb - ra);
  };
  const map = (p) => {
    const w = weight(p),
      a = affine(p, fixture.transforms.reproductive),
      b = affine(p, fixture.transforms.pelvis);
    return pelvicMorph(
      a.map((v, i) => v + (b[i] - v) * w),
      fixture.morph,
    );
  };
  const differential = (p) => {
    const h = 1e-6,
      columns = [0, 1, 2].map((axis) => {
        const a = [...p],
          b = [...p];
        a[axis] += h;
        b[axis] -= h;
        return map(a).map((v, i) => (v - map(b)[i]) / (2 * h));
      });
    const j = new Matrix3().set(...[0, 1, 2].flatMap((row) => columns.map((c) => c[row])));
    return { determinant: j.determinant(), normalMatrix: j.clone().invert().transpose() };
  };
  return { map, weight, differential };
}

export function correctedMesh(source, fixture) {
  const transform = registration(source, fixture);
  const determinants = [];
  const positions = source.positions.map((p, i) =>
    transform.weight(p) === 0 ? source.baselinePositions[i] : transform.map(p).map(Math.fround),
  );
  const normals = source.positions.flatMap((p, i) => {
    const { determinant, normalMatrix } = transform.differential(p);
    determinants.push(determinant);
    if (determinant <= 0) throw new Error(`${source.id}: registration folds at vertex ${i}`);
    if (transform.weight(p) === 0) return source.baselineNormals.slice(i * 3, i * 3 + 3);
    return new Vector3(...source.normals[i])
      .applyMatrix3(normalMatrix)
      .normalize()
      .toArray()
      .map((v) => Math.round(v * 32767) || 0);
  });
  return { positions, normals, minimumJacobian: Math.min(...determinants) };
}

// Long thin source triangles cannot approximate a curved shear with only their
// original corners. Split on common depth planes before mapping, retaining the
// original surface and shared-edge connectivity. No vertices are clipped away.
export function sliceSourceMesh(source, spacing = RECIPE.sliceSpacingM) {
  const positions = source.positions.map((p) => [...p]),
    normals = source.normals.map((n) => [...n]);
  const baselinePositions = source.baselinePositions.map((p) => [...p]),
    baselineNormals = [...source.baselineNormals];
  const indices = [],
    cache = new Map();
  const cells = new Map(),
    tolerance = RECIPE.precisionWeldM;
  const cell = (p) => p.map((v) => Math.floor(v / tolerance));
  const addCell = (p, i) => {
    const key = cell(p).join(":");
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  };
  positions.forEach(addCell);
  const low = Math.min(...positions.map((p) => p[2])),
    high = Math.max(...positions.map((p) => p[2]));
  const steps = Math.ceil((high - low) / spacing),
    step = (high - low) / steps;
  const weights = (index) => new Map([[index, 1]]);
  const interpolate = (a, b, t) => {
    const w = new Map();
    for (const [i, v] of a) w.set(i, v * (1 - t));
    for (const [i, v] of b) w.set(i, (w.get(i) ?? 0) + v * t);
    for (const [i, v] of w) if (Math.abs(v) < 1e-10) w.delete(i);
    return w;
  };
  const height = (w) => [...w].reduce((s, [i, v]) => s + source.positions[i][2] * v, 0);
  const clip = (polygon, y, above) => {
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        ay = height(a),
        by = height(b),
        insideA = above ? ay >= y : ay <= y,
        insideB = above ? by >= y : by <= y;
      if (insideA) out.push(a);
      if (insideA !== insideB) out.push(interpolate(a, b, (y - ay) / (by - ay)));
    }
    return out;
  };
  const vertex = (w) => {
    if (w.size === 1) return [...w.keys()][0];
    const key = [...w]
      .sort((a, b) => a[0] - b[0])
      .map(([i, v]) => `${i}:${v.toFixed(10)}`)
      .join(",");
    if (cache.has(key)) return cache.get(key);
    const sum = (values) =>
      [0, 1, 2].map((axis) => [...w].reduce((s, [i, v]) => s + values[i][axis] * v, 0));
    const point = sum(source.positions),
      bucket = cell(point);
    // Slicing close to an existing corner can create nanometre-wide slivers,
    // below the precision of the shipped Float32 coordinates. Weld only new
    // points within that precision; every original source vertex is retained.
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++)
          for (const i of cells.get([bucket[0] + x, bucket[1] + y, bucket[2] + z].join(":")) ?? [])
            if (Math.hypot(...point.map((v, j) => v - positions[i][j])) <= tolerance) {
              cache.set(key, i);
              return i;
            }
    const id = positions.length;
    cache.set(key, id);
    positions.push(point);
    addCell(point, id);
    baselinePositions.push(sum(source.baselinePositions).map(Math.fround));
    normals.push(new Vector3(...sum(source.normals)).normalize().toArray());
    const old = Array.from({ length: source.positions.length }, (_, i) =>
      source.baselineNormals.slice(i * 3, i * 3 + 3),
    );
    baselineNormals.push(
      ...new Vector3(...sum(old))
        .normalize()
        .toArray()
        .map((v) => Math.round(v * 32767)),
    );
    return id;
  };
  for (let k = 0; k < source.indices.length; k += 3) {
    const ids = source.indices.slice(k, k + 3),
      ys = ids.map((i) => positions[i][2]);
    const start = Math.max(0, Math.floor((Math.min(...ys) - low) / step)),
      end = Math.min(steps - 1, Math.floor((Math.max(...ys) - low) / step));
    for (let band = start; band <= end; band++) {
      let polygon = ids.map(weights);
      polygon = clip(polygon, low + band * step, true);
      polygon = clip(polygon, low + (band + 1) * step, false);
      const corners = polygon.map(vertex).filter((v, i, a) => v !== a[(i + 1) % a.length]);
      let best = [],
        quality = -1;
      for (let root = 0; root < corners.length; root++) {
        const ordered = [...corners.slice(root), ...corners.slice(0, root)],
          fan = [];
        let smallest = Infinity;
        for (let i = 1; i + 1 < ordered.length; i++) {
          const t = [ordered[0], ordered[i], ordered[i + 1]];
          smallest = Math.min(
            smallest,
            new Triangle(...t.map((i) => new Vector3(...positions[i]))).getArea(),
          );
          fan.push(...t);
        }
        if (fan.length && smallest > quality) {
          quality = smallest;
          best = fan;
        }
      }
      indices.push(...best);
    }
  }
  return { ...source, positions, normals, indices, baselinePositions, baselineNormals };
}
