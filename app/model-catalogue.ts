import { DEFAULT_VISIBLE, type Atlas, type Part, type SystemId } from "./anatomy.ts";

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
    pieces: 2455,
    concepts: 4461,
  },
} as const;

export function anatomicalSources(parts: readonly Pick<Part, "id">[]) {
  const sources = {
    z: {
      name: "Z-Anatomy",
      url: "https://github.com/LluisV/Z-Anatomy/tree/6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX",
    },
    hra: { name: "HRA", url: "https://doi.org/10.48539/HBM352.BTSQ.586" },
    bp: {
      name: "BodyParts3D",
      url: "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
    },
  };
  const keys = new Set(
    parts.map((p) => (p.id.startsWith("ZA_N") ? "z" : p.id.startsWith("VH_F_") ? "hra" : "bp")),
  );
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
  if (!value || typeof value !== "object") return false;
  const atlas = value as Atlas;
  return (
    atlas.sex === model &&
    Array.isArray(atlas.parts) &&
    atlas.parts.length > 0 &&
    Array.isArray(atlas.concepts) &&
    atlas.concepts.length > 0 &&
    Array.isArray(atlas.chunks) &&
    atlas.chunks.length > 0
  );
}
