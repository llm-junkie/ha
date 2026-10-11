import type { Part, SceneState } from "./anatomy.ts";

export function partIsVisible(
  part: Part,
  state: SceneState,
  lookups?: { visible: ReadonlySet<string>; selected: ReadonlySet<string> },
): boolean {
  if (state.partVisibility?.[part.id] === false) return false;
  const selected = lookups ? lookups.selected.has(part.id) : state.selected.includes(part.id);
  if (selected) return true;
  if (state.isolate) return false;
  return (
    state.partVisibility?.[part.id] === true ||
    (lookups ? lookups.visible.has(part.system) : state.visible.includes(part.system))
  );
}
