import type { Part, SceneState, SystemId } from "./anatomy.ts";

export function layerOpacity(state: Pick<SceneState, "opacity">, system: SystemId): number {
  const value = state.opacity?.[system];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0.05, Math.min(1, value))
    : system === "integumentary"
      ? 0.1
      : 1;
}

export function partOpacity(part: Part, state: SceneState): number {
  return state.selected.includes(part.id) ? 1 : layerOpacity(state, part.system);
}
