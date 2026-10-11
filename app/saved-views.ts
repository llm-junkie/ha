import {
  SYSTEMS,
  type Atlas,
  type CameraPose,
  type SceneState,
  type SystemId,
  type View,
} from "./anatomy.ts";
import type { ModelId } from "./model-catalogue.ts";

export const SAVED_VIEWS_KEY = "human-atlas:saved-views:v1";
export const savedViewsKey = (model: ModelId = "male") =>
  model === "male" ? SAVED_VIEWS_KEY : `${SAVED_VIEWS_KEY}:female`;
export const MAX_SAVED_VIEWS = 20;
const MAX_PAYLOAD = 100_000;
const views: View[] = ["three-quarter", "front", "back", "side"];
const systems = new Set(SYSTEMS.map((system) => system.id));
type RecordValue = Record<string, unknown>;
export interface SavedView {
  version: 1;
  model?: ModelId;
  visible: SystemId[];
  selected: string[];
  concept?: string;
  isolate: boolean;
  inspectorOpen: boolean;
  explode: number;
  view: View;
  partVisibility: Record<string, boolean>;
  opacity: Partial<Record<SystemId, number>>;
  focusContext: boolean;
  rotationSpeed: number;
  rotationDirection: "clockwise" | "counterclockwise";
  camera: CameraPose;
}
export interface Bookmark {
  id: string;
  name: string;
  view: SavedView;
}
const record = (value: unknown): value is RecordValue =>
  !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
const vector = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100);

// Links and storage are untrusted. Only current atlas IDs and bounded camera values survive.
export function normalizeSavedView(
  value: unknown,
  atlas: Pick<Atlas, "parts" | "sex">,
): SavedView | null {
  if (!record(value) || value.version !== 1 || !record(value.camera)) return null;
  const model = value.model ?? "male";
  if ((model !== "male" && model !== "female") || model !== (atlas.sex ?? "male")) return null;
  const camera = value.camera;
  if (!vector(camera.position) || !vector(camera.target)) return null;
  const distance = Math.hypot(...camera.position.map((n, i) => n - (camera.target as number[])[i]));
  if (distance < 0.07 || distance > 100) return null;
  const ids = new Set(atlas.parts.map((part) => part.id));
  const selected = Array.isArray(value.selected)
    ? [
        ...new Set(
          value.selected.filter((id): id is string => typeof id === "string" && ids.has(id)),
        ),
      ]
    : [];
  const visible = Array.isArray(value.visible)
    ? [
        ...new Set(
          value.visible.filter(
            (id): id is SystemId => typeof id === "string" && systems.has(id as SystemId),
          ),
        ),
      ]
    : [];
  const partVisibility: Record<string, boolean> = {};
  if (record(value.partVisibility))
    for (const [id, shown] of Object.entries(value.partVisibility)) {
      if (ids.has(id) && typeof shown === "boolean") partVisibility[id] = shown;
    }
  const opacity: Partial<Record<SystemId, number>> = {};
  if (record(value.opacity))
    for (const [id, alpha] of Object.entries(value.opacity)) {
      if (systems.has(id as SystemId) && typeof alpha === "number" && Number.isFinite(alpha))
        opacity[id as SystemId] = number(alpha, 0.05, 1, 1);
    }
  return {
    version: 1,
    model,
    visible,
    selected,
    concept:
      typeof value.concept === "string" && value.concept.length <= 120 ? value.concept : undefined,
    isolate: value.isolate === true && selected.length > 0,
    inspectorOpen: value.inspectorOpen === true && selected.length > 0,
    explode: number(value.explode, 0, 1, 0),
    view: views.includes(value.view as View) ? (value.view as View) : "three-quarter",
    partVisibility,
    opacity,
    focusContext: value.focusContext === true,
    rotationSpeed: number(value.rotationSpeed, 0.1, 10, 1),
    rotationDirection:
      value.rotationDirection === "counterclockwise" ? "counterclockwise" : "clockwise",
    camera: {
      position: [...camera.position],
      target: [...camera.target],
      ...(Array.isArray(camera.viewport) &&
      camera.viewport.length === 2 &&
      camera.viewport.every(
        (n) => typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 20000,
      )
        ? { viewport: [...camera.viewport] as [number, number] }
        : {}),
      offset:
        Array.isArray(camera.offset) && camera.offset.length === 2
          ? [number(camera.offset[0], -1, 1, 0), number(camera.offset[1], -1, 1, 0)]
          : [0, 0],
    },
  };
}

export function captureSavedView(
  state: SceneState,
  camera: CameraPose,
  concept?: string,
  model: ModelId = "male",
): SavedView {
  return {
    version: 1,
    model,
    visible: [...state.visible],
    selected: [...state.selected],
    concept,
    isolate: state.isolate,
    inspectorOpen: !!state.inspectorOpen,
    explode: state.explode,
    view: state.view,
    partVisibility: { ...state.partVisibility },
    opacity: { ...state.opacity },
    focusContext: !!state.focusContext,
    rotationSpeed: state.rotationSpeed ?? 1,
    rotationDirection: state.rotationDirection ?? "clockwise",
    camera: {
      position: [...camera.position],
      target: [...camera.target],
      offset: [...camera.offset],
      ...(camera.viewport ? { viewport: [...camera.viewport] as [number, number] } : {}),
    },
  };
}

export function savedViewState(view: SavedView, reset: number): SceneState {
  const { version: _version, model: _model, concept: _concept, ...state } = view;
  return { ...state, rotate: false, reset, focus: view.focusContext ? 1 : 0 };
}

export function viewHash(view: SavedView): string {
  const bytes = new TextEncoder().encode(JSON.stringify(view));
  return (
    "#view=" +
    btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  );
}

export function viewModelFromHash(hash: string): ModelId | undefined {
  if (!hash.startsWith("#view=") || hash.length > MAX_PAYLOAD) return undefined;
  try {
    const text = atob(hash.slice(6).replace(/-/g, "+").replace(/_/g, "/"));
    const value: unknown = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(text, (char) => char.charCodeAt(0))),
    );
    if (!record(value) || value.version !== 1) return undefined;
    return value.model === "female"
      ? "female"
      : value.model === undefined || value.model === "male"
        ? "male"
        : undefined;
  } catch {
    return undefined;
  }
}

export function readViewHash(hash: string, atlas: Pick<Atlas, "parts" | "sex">): SavedView | null {
  if (!hash.startsWith("#view=") || hash.length > MAX_PAYLOAD) return null;
  try {
    const text = atob(hash.slice(6).replace(/-/g, "+").replace(/_/g, "/"));
    return normalizeSavedView(
      JSON.parse(new TextDecoder().decode(Uint8Array.from(text, (char) => char.charCodeAt(0)))),
      atlas,
    );
  } catch {
    return null;
  }
}

export function shareViewUrl(url: string, view: SavedView): string {
  const target = new URL(url);
  target.searchParams.set("model", view.model ?? "male");
  target.hash = viewHash(view);
  return target.href;
}

export function readBookmarks(
  storage: Pick<Storage, "getItem"> | undefined,
  atlas: Pick<Atlas, "parts" | "sex">,
): Bookmark[] {
  try {
    const raw = storage?.getItem(savedViewsKey(atlas.sex));
    if (!raw || raw.length > MAX_PAYLOAD * MAX_SAVED_VIEWS) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.slice(0, MAX_SAVED_VIEWS).flatMap((item) => {
      if (
        !record(item) ||
        typeof item.id !== "string" ||
        !item.id ||
        item.id.length > 100 ||
        seen.has(item.id) ||
        typeof item.name !== "string" ||
        !item.name.trim()
      )
        return [];
      const view = normalizeSavedView(item.view, atlas);
      if (!view) return [];
      seen.add(item.id);
      return [{ id: item.id, name: item.name.trim().slice(0, 80), view }];
    });
  } catch {
    return [];
  }
}

export function writeBookmarks(
  storage: Pick<Storage, "setItem"> | undefined,
  bookmarks: Bookmark[],
  model: ModelId = "male",
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(savedViewsKey(model), JSON.stringify(bookmarks.slice(0, MAX_SAVED_VIEWS)));
    return true;
  } catch {
    return false;
  }
}
