import { DEFAULT_VISIBLE, SYSTEMS, type Atlas, type Part, type SystemId } from "./anatomy.ts";

export type ModelId = "male" | "female";
export const MODEL_STORAGE_KEY = "human-atlas:model";
export const MODELS = {
  male: {
    manifest: "/models/atlas.json",
    label: "Male",
    source: "BodyParts3D + Z-Anatomy",
    pieces: 2444,
    concepts: 3645,
  },
  female: {
    manifest: "/models/atlas-female.json",
    label: "Female · Experimental",
    source: "BodyParts3D + HRA + Z-Anatomy",
    pieces: 2456,
    concepts: 4462,
  },
} as const;

export function anatomicalSources(parts: readonly Pick<Part, "id">[]) {
  const sources = {
    z: {
      name: "Z-Anatomy",
      url: "https://github.com/LluisV/Z-Anatomy/tree/6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX",
    },
    hra: { name: "HRA", url: "https://doi.org/10.48539/HBM352.BTSQ.586" },
    skin: {
      name: "HRA",
      url: "https://github.com/hubmapconsortium/ccf-releases/blob/b036a91aaf7234f462b1249d4a5f4fb0e982f412/v1.3/models/3d-vh-f-skin.glb",
    },
    bp: {
      name: "BodyParts3D",
      url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
    },
  };
  const keys = new Set(
    parts.map((p) => (p.id.startsWith("ZA_N") ? "z" : p.id === "VH_F_skin" ? "skin" : p.id.startsWith("VH_F_") ? "hra" : "bp")),
  );
  if (parts.some((p) => p.id === "VH_F_skin")) keys.add("bp");
  return [...keys].map((key) => sources[key]);
}

export function readModel(
  storage?: Pick<Storage, "getItem">,
  query = "",
  linked?: ModelId,
): ModelId {
  if (linked) return linked;
  const requested = new URLSearchParams(query).get("model");
  if (requested === "male" || requested === "female") return requested;
  try {
    return storage?.getItem(MODEL_STORAGE_KEY) === "female" ? "female" : "male";
  } catch {
    return "male";
  }
}

export function defaultLayers(model: ModelId, atlas?: Atlas): SystemId[] {
  const available = atlas && new Set(atlas.parts.map((part) => part.system));
  return DEFAULT_VISIBLE.filter(
    (id) => (!available || available.has(id)) && (id !== "mammary" || model === "female"),
  );
}

export function isModelAtlas(value: unknown, model: ModelId): value is Atlas {
  if (!record(value) || value.sex !== model || !text(value.version)) return false;
  const { parts, concepts, chunks } = value;
  if (!Array.isArray(parts) || !parts.length ||
      !Array.isArray(concepts) || !concepts.length ||
      !Array.isArray(chunks) || !chunks.length) return false;

  // Validate before rendering: a truncated catalogue must show a recoverable
  // loading error, rather than crashing React or constructing invalid buffers.
  for (const chunk of chunks) {
    if (!record(chunk) || !modelPath(chunk.url, false) || !positiveInteger(chunk.bytes) ||
        (chunk.gzip !== undefined && (!modelPath(chunk.gzip, true) || !positiveInteger(chunk.gzipBytes))))
      return false;
  }
  const ids = new Set<string>();
  const systems = new Set<string>(SYSTEMS.map((system) => system.id));
  let triangles = 0;
  for (const part of parts) {
    if (!record(part) || !text(part.id) || ids.has(part.id) || !text(part.name) ||
        !text(part.conceptId) || typeof part.system !== "string" || !systems.has(part.system) ||
        !integer(part.chunk) || part.chunk >= chunks.length ||
        !positiveInteger(part.vertexCount) || !positiveInteger(part.indexCount) || part.indexCount % 3 !== 0)
      return false;
    const bytes = chunks[part.chunk].bytes as number;
    if (!bufferRange(part.positions, part.vertexCount * 3, 4, bytes) ||
        !bufferRange(part.normals, part.vertexCount * 3, 2, bytes) ||
        !bufferRange(part.indices, part.indexCount, 4, bytes)) return false;
    if (!Array.isArray(part.bounds) || part.bounds.length !== 2 || !part.bounds.every(vector)) return false;
    const [min, max] = part.bounds as [number[], number[]];
    if (min.some((coordinate, axis) => coordinate > max[axis])) return false;
    ids.add(part.id);
    triangles += part.indexCount / 3;
  }
  const conceptIds = new Set<string>();
  for (const concept of concepts) {
    if (!record(concept) || !text(concept.id) || conceptIds.has(concept.id) || !text(concept.name) ||
        !Array.isArray(concept.elements) || !concept.elements.length ||
        !concept.elements.every((id) => typeof id === "string" && ids.has(id))) return false;
    conceptIds.add(concept.id);
  }
  return value.triangles === triangles;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const positiveInteger = (value: unknown): value is number => integer(value) && value > 0;
const vector = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n));
const modelPath = (value: unknown, gzip: boolean) =>
  typeof value === "string" && (gzip ? /^\/models\/[\w-]+\.bin\.gz$/ : /^\/models\/[\w-]+\.bin$/).test(value);
const bufferRange = (offset: unknown, count: number, stride: number, bytes: number) =>
  integer(offset) && offset % stride === 0 && Number.isSafeInteger(count * stride) &&
  count * stride <= bytes && offset <= bytes - count * stride;
