export const RECENT_STRUCTURES_KEY = "human-atlas:recent-structures";

export function rememberStructure(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter((existing) => existing !== id)].slice(0, 6);
}

export function readRecentStructures(storage: Pick<Storage, "getItem"> | undefined): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(RECENT_STRUCTURES_KEY) ?? "[]");
    return Array.isArray(value)
      ? [
          ...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0)),
        ].slice(0, 6)
      : [];
  } catch {
    return [];
  }
}
