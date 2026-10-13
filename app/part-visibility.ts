import type { Part, SceneState } from "./anatomy.ts";

export function partIsEnabled(
  part: Part,
  state: SceneState,
  visible?: ReadonlySet<string>,
): boolean {
  if (state.partVisibility?.[part.id] === false) return false;
  return state.partVisibility?.[part.id] === true ||
    (visible ? visible.has(part.system) : state.visible.includes(part.system));
}

export function partIsVisible(
  part: Part,
  state: SceneState,
  lookups?: { visible: ReadonlySet<string>; selected: ReadonlySet<string> },
): boolean {
  const selected = lookups ? lookups.selected.has(part.id) : state.selected.includes(part.id);
  // Inspection temporarily reveals a hidden piece without changing layer choices.
  if (selected) return true;
  if (state.isolate) return false;
  return partIsEnabled(part, state, lookups?.visible);
}
