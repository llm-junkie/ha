import type { Atlas, Concept, SystemId } from "./anatomy.ts";

// The source data has system membership and concept IDs, but no reliable
// parent/child organ tree. List its actual structures without inventing one.
export function systemStructures(atlas: Atlas | null): Map<SystemId, Concept[]> {
  const systems = new Map<SystemId, Map<string, Concept>>();
  const concepts = new Map(atlas?.concepts.map((c) => [c.id, c]));
  for (const part of atlas?.parts ?? []) {
    let structures = systems.get(part.system);
    if (!structures) systems.set(part.system, (structures = new Map()));
    const id = part.conceptId || part.id;
    let structure = structures.get(id);
    if (!structure)
      structures.set(
        id,
        (structure = { id, name: concepts.get(id)?.name ?? part.name, elements: [] }),
      );
    if (!structure.elements.includes(part.id)) structure.elements.push(part.id);
  }
  return new Map([...systems].map(([id, structures]) => [id, [...structures.values()]]));
}

export function clearStructureOverrides(
  overrides: Readonly<Record<string, boolean>> | undefined,
  ids: readonly string[],
) {
  const next = { ...overrides };
  for (const id of ids) delete next[id];
  return next;
}
