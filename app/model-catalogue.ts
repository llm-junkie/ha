import { DEFAULT_VISIBLE, type Atlas, type SystemId } from "./anatomy.ts";

export type ModelId = "male" | "female";
export const MODEL_STORAGE_KEY = "human-atlas:model";
export const MODELS = {
  male: { manifest: "/models/atlas.json", label: "Male", source: "BodyParts3D", pieces: 2234 },
  female: {
    manifest: "/models/atlas-female.json",
    label: "Female · Experimental",
    source: "BodyParts3D + HRA",
    pieces: 2245,
  },
} as const;

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
