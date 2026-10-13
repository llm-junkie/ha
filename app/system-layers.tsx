import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { SYSTEMS, type Atlas, type SceneState, type SystemId } from "./anatomy";
import { systemStructures } from "./structure-layers";
import { partIsVisible } from "./part-visibility";
import { layerOpacity } from "./layer-opacity";

interface Props {
  atlas: Atlas;
  state: SceneState;
  onOnly: (system: SystemId) => void;
  onToggle: (system: SystemId) => void;
  onStructureToggle: (ids: string[], visible: boolean) => void;
  onInspect: (concept: { id: string; name: string; elements: string[] }) => void;
  onOpacity: (system: SystemId, opacity: number) => void;
}

export default function SystemLayers({
  atlas,
  state,
  onOnly,
  onToggle,
  onStructureToggle,
  onInspect,
  onOpacity,
}: Props) {
  const groups = useMemo(() => systemStructures(atlas), [atlas]);
  const parts = useMemo(() => new Map(atlas.parts.map((part) => [part.id, part])), [atlas]);
  const [expanded, setExpanded] = useState<SystemId[]>([]);
  const [filters, setFilters] = useState<Partial<Record<SystemId, string>>>({});
  const [limits, setLimits] = useState<Partial<Record<SystemId, number>>>({});
  const systems = SYSTEMS.filter((system) => groups.has(system.id)).sort(
    (a, b) => Number(b.id === "integumentary") - Number(a.id === "integumentary"),
  );
  return (
    <div className="system-list">
      {systems.map((system) => {
        const structures = groups.get(system.id)!;
        const open = expanded.includes(system.id);
        const query = (filters[system.id] ?? "").trim().toLowerCase();
        const matches = query
          ? structures.filter((concept) =>
              `${concept.name} ${concept.id}`.toLowerCase().includes(query),
            )
          : structures;
        const limit = limits[system.id] ?? 40;
        const count = structures.reduce((sum, concept) => sum + concept.elements.length, 0);
        return (
          <div className="system-group" key={system.id}>
            <div className={`system-row ${state.visible.includes(system.id) ? "enabled" : ""}`}>
              <Button
                variant="ghost"
                className="structure-expand"
                aria-label={`Browse ${system.name.toLowerCase()} structures`}
                aria-expanded={open}
                aria-controls={`structures-${system.id}`}
                onClick={() =>
                  setExpanded((ids) =>
                    open ? ids.filter((id) => id !== system.id) : [...ids, system.id],
                  )
                }
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </Button>
              <Button
                variant="ghost"
                className="system-name"
                title={`Show only ${system.name.toLowerCase()}`}
                onClick={() => onOnly(system.id)}
              >
                <span className="system-dot" style={{ background: system.color }} />
                {system.name}
                <span className="system-count">{count}</span>
              </Button>
              <Switch
                checked={state.visible.includes(system.id)}
                onCheckedChange={() => onToggle(system.id)}
                aria-label={`Show ${system.name.toLowerCase()}`}
              />
            </div>
            {open && (
              <div className="structure-children" id={`structures-${system.id}`}>
                <div className="layer-opacity-control">
                  <div>
                    <label id={`opacity-label-${system.id}`}>Opacity</label>
                    <output>{Math.round(layerOpacity(state, system.id) * 100)}%</output>
                  </div>
                  <Slider
                    min={5}
                    max={100}
                    step={5}
                    value={[Math.round(layerOpacity(state, system.id) * 100)]}
                    aria-label={`${system.name} opacity`}
                    onValueChange={(value) =>
                      onOpacity(system.id, (Array.isArray(value) ? value[0] : value) / 100)
                    }
                  />
                </div>
                <input
                  className="structure-filter"
                  aria-label={`Filter ${system.name.toLowerCase()} structures`}
                  placeholder="Filter structures…"
                  value={filters[system.id] ?? ""}
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, [system.id]: event.target.value }));
                    setLimits((current) => ({ ...current, [system.id]: 40 }));
                  }}
                />
                {matches.slice(0, limit).map((concept) => {
                  const shown = concept.elements.filter((id) =>
                    partIsVisible(parts.get(id)!, state),
                  ).length;
                  return (
                    <div className={`structure-row ${shown ? "enabled" : ""}`} key={concept.id}>
                      <Button
                        variant="ghost"
                        className="structure-name"
                        onClick={() => onInspect(concept)}
                        title={concept.name}
                      >
                        {concept.name}
                      </Button>
                      <Switch
                        checked={shown === concept.elements.length}
                        onCheckedChange={(visible) => onStructureToggle(concept.elements, visible)}
                        aria-label={`Show ${concept.name}`}
                        title={`${shown} of ${concept.elements.length} pieces visible`}
                      />
                    </div>
                  );
                })}
                {!matches.length && <p className="structure-empty">No matching structures.</p>}
                {matches.length > limit && (
                  <Button
                    variant="ghost"
                    className="structure-more"
                    onClick={() =>
                      setLimits((current) => ({ ...current, [system.id]: limit + 40 }))
                    }
                  >
                    Show more ({matches.length - limit})
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
