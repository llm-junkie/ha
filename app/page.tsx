import { flushSync } from "react-dom";
import "./view-library.css";
import { assetUrl } from "./asset-url";
import { usePanelViewport } from "./use-panel-viewport";
import {
  defaultLayers,
  isModelAtlas,
  MODELS,
  MODEL_STORAGE_KEY,
  readModel,
  type ModelId,
} from "./model-catalogue";
import { registerAtlasTools } from "./agent-tools";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Focus,
  Info,
  Layers3,
  Pause,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Combobox,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import AnatomyScene from "./scene";
import SystemLayers from "./system-layers";
import ViewLibrary from "./view-library";
import PwaPanel, { pwaLabel } from "./pwa-panel";
import { prepareOffline, updateApp, usePwa } from "./pwa";
import {
  captureSavedView,
  readViewHash,
  viewModelFromHash,
  savedViewState,
  normalizeSavedView,
  type SavedView,
} from "./saved-views";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { buildSearchConcepts, matchesAnatomySearch, type SearchConcept } from "./anatomy-search";
import { partIsVisible } from "./part-visibility";
import { clearStructureOverrides } from "./structure-layers";
import { readRecentStructures, rememberStructure, recentStructuresKey } from "./recent-structures";
import {
  DEFAULT_VISIBLE,
  SYSTEMS,
  EXPLANATIONS,
  explanation,
  type Atlas,
  type Concept,
  type SceneState,
  type SystemId,
  type View,
  type CameraPose,
} from "./anatomy";
const initial: SceneState = {
  explode: 0,
  visible: DEFAULT_VISIBLE,
  selected: [],
  isolate: false,
  view: "three-quarter",
  rotate: false,
  reset: 0,
  focus: 0,
  focusContext: false,
  partVisibility: {},
  opacity: {},
  rotationSpeed: 1,
  rotationDirection: "clockwise",
};
export default function Home() {
  const pwa = usePwa();
  const [model, setModel] = useState<ModelId>(() => {
    const linked = viewModelFromHash(location.hash);
    try {
      return readModel(localStorage, location.search, linked);
    } catch {
      return readModel(undefined, location.search, linked);
    }
  });
  const aboutTitle = useRef<HTMLHeadingElement>(null);
  const searchPanel = useRef<HTMLElement>(null);
  const savedPanelAnchor = useRef<HTMLDivElement>(null);
  const updateTitle = useRef<HTMLHeadingElement>(null);
  const [aboutUpdates, setAboutUpdates] = useState(false);
  const [aboutModel, setAboutModel] = useState<ModelId>(model);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const cameraPose = useRef<CameraPose | null>(null);
  const settled = useRef(false);
  const [viewReady, setViewReady] = useState(false);
  const [viewNotice, setViewNotice] = useState("");
  const [recentByModel, setRecentByModel] = useState<Record<ModelId, string[]>>(() => {
    try {
      return {
        male: readRecentStructures(localStorage),
        female: readRecentStructures(localStorage, "female"),
      };
    } catch {
      return { male: [], female: [] };
    }
  });
  const recentIds = recentByModel[model];
  const setRecentIds = (update: string[] | ((ids: string[]) => string[])) =>
    setRecentByModel((current) => ({
      ...current,
      [model]: typeof update === "function" ? update(current[model]) : update,
    }));
  useEffect(() => {
    try {
      localStorage.setItem(recentStructuresKey(model), JSON.stringify(recentIds));
    } catch {
      /* Browsing still works when storage is unavailable. */
    }
  }, [recentIds, model]);
  const [atlas, setAtlas] = useState<Atlas | null>(null),
    [state, setState] = useState(initial),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(""),
    [panel, setPanel] = useState<"layers" | "search" | "saved" | null>(null),
    [details, setDetails] = useState(false),
    [about, setAbout] = useState(false),
    [query, setQuery] = useState(""),
    [chosen, setChosen] = useState<SearchConcept | null>(null);
  const openAbout = (updates = false) => {
    setAboutModel(model);
    setAboutUpdates(updates);
    setDetails(false);
    setPanel(null);
    setAbout(true);
  };
  useEffect(() => {
    if (progress === 100) prepareOffline();
  }, [progress]);
  useEffect(() => {
    const abort = new AbortController();
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, model);
    } catch {
      /* Optional preference. */
    }
    setProgress(0);
    setError("");
    setAtlas(null);
    setChosen(null);
    setDetails(false);
    setPanel(null);
    setQuery("");
    setViewReady(false);
    settled.current = false;
    cameraPose.current = null;
    setState({ ...initial, visible: defaultLayers(model) });
    fetch(assetUrl(MODELS[model].manifest), { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error("The anatomy catalogue could not be loaded.");
        return r.json();
      })
      .then((data: unknown) => {
        if (abort.signal.aborted) return;
        if (!isModelAtlas(data, model))
          throw new Error("The catalogue does not match the selected anatomy model.");
        setState((current) => ({ ...current, visible: defaultLayers(model, data) }));
        setAtlas(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted && e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [model]);
  const changeModel = (next: ModelId, keepView = false) => {
    if (next === model) return;
    setAtlas(null);
    setModel(next);
    const url = new URL(location.href);
    url.searchParams.set("model", next);
    if (!keepView && url.hash.startsWith("#view=")) url.hash = "";
    history.replaceState(null, "", url);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setPanel("search");
        setDetails(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (panel !== "search") return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (
        searchPanel.current?.contains(event.target) ||
        event.target.closest('[aria-label="Search anatomy"]')
      )
        return;
      setPanel(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [panel]);
  usePanelViewport(searchPanel, panel === "search");
  const parts = useMemo(() => new Map(atlas?.parts.map((p) => [p.id, p])), [atlas]);
  const concepts = useMemo(() => (atlas ? buildSearchConcepts(atlas) : []), [atlas]);
  const recent = useMemo(
    () =>
      recentIds.flatMap((id) => {
        const concept = concepts.find((concept) => concept.id === id),
          part = parts.get(id);
        return concept
          ? [concept]
          : part
            ? [{ id: part.id, name: part.name, elements: [part.id] }]
            : [];
      }),
    [recentIds, concepts, parts],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        SYSTEMS.map((s) => [s.id, atlas?.parts.filter((p) => p.system === s.id).length ?? 0]),
      ),
    [atlas],
  );
  const activeSystems = SYSTEMS.filter((s) => counts[s.id] > 0);
  const organSystems = activeSystems
    .filter((s) =>
      [
        "cardiac",
        "respiratory",
        "digestive",
        "urinary",
        "endocrine",
        "reproductive",
        "mammary",
      ].includes(s.id),
    )
    .map((s) => s.id);
  const selectedParts = state.selected.map((id) => parts.get(id)).filter((p) => !!p),
    selected = selectedParts[0],
    system = SYSTEMS.find((s) => s.id === selected?.system);
  const visibleCount = atlas?.parts.filter((part) => partIsVisible(part, state)).length ?? 0;
  const results = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (term)
      return concepts
        .filter((concept) => matchesAnatomySearch(concept, term))
        .sort((a, b) => a.name.length - b.name.length)
        .slice(0, 80);
    const common = [
      "heart",
      "brain",
      "liver",
      "stomach",
      "spleen",
      "pancreas",
      "urinary bladder",
      "trachea",
    ].flatMap((name) => concepts.find((concept) => concept.name.toLowerCase() === name) ?? []);
    return [...new Map([...recent, ...common].map((concept) => [concept.id, concept])).values()];
  }, [concepts, query, recent]);
  const choose = (concept: SearchConcept) => {
    setChosen(concept);
    setRecentIds((ids) => rememberStructure(ids, concept.id));
    setState((current) => ({
      ...current,
      selected: concept.elements,
      isolate: false,
      rotate: false,
      focus: 0,
      focusContext: false,
      partVisibility: clearStructureOverrides(current.partVisibility, concept.elements),
    }));
    setDetails(true);
    setPanel(null);
  };
  useEffect(() => {
    if (!atlas) return;
    return registerAtlasTools(atlas, (c) => flushSync(() => choose(c)));
  }, [atlas]);
  const choosePart = (id: string) => {
    const part = parts.get(id);
    if (part) choose({ id: part.id, name: part.name, elements: [id] });
  };
  const setLayers = (visible: SystemId[]) => {
    setDetails(false);
    setState((current) => ({
      ...current,
      selected: [],
      isolate: false,
      focus: 0,
      focusContext: false,
      partVisibility: {},
      visible,
    }));
  };
  const toggle = (id: SystemId) => {
    setDetails(false);
    setState((current) => ({
      ...current,
      selected: [],
      isolate: false,
      focus: 0,
      focusContext: false,
      visible: current.visible.includes(id)
        ? current.visible.filter((existing) => existing !== id)
        : [...current.visible, id],
      partVisibility: clearStructureOverrides(
        current.partVisibility,
        atlas?.parts.filter((part) => part.system === id).map((part) => part.id) ?? [],
      ),
    }));
  };
  const toggleStructure = (ids: string[], visible: boolean) => {
    setDetails(false);
    setState((current) => ({
      ...current,
      selected: [],
      isolate: false,
      focus: 0,
      focusContext: false,
      partVisibility: {
        ...current.partVisibility,
        ...Object.fromEntries(ids.map((id) => [id, visible])),
      },
    }));
  };
  const returnOverall = () => {
    setChosen(null);
    setDetails(false);
    setState((current) => ({
      ...current,
      selected: [],
      isolate: false,
      focus: 0,
      focusContext: false,
      explode: 0,
      rotate: false,
      view: "three-quarter",
      reset: current.reset + 1,
    }));
  };
  const reset = () => {
    setState((s) => ({
      ...initial,
      visible: defaultLayers(model, atlas ?? undefined),
      reset: s.reset + 1,
    }));
    setChosen(null);
    setDetails(false);
    setPanel(null);
  };
  const openPanel = (next: "layers" | "search") => {
    setDetails(false);
    setPanel((p) => (p === next ? null : next));
  };
  const restoreView = (value: SavedView) => {
    if (!atlas) return;
    const view = normalizeSavedView(value, atlas);
    if (!view) return;
    const matching = concepts.find(
      (concept) =>
        concept.id === view.concept &&
        concept.elements.length === view.selected.length &&
        concept.elements.every((id) => view.selected.includes(id)),
    );
    const first = parts.get(view.selected[0]);
    setChosen(
      matching ??
        (first
          ? {
              id: first.id,
              name: view.selected.length === 1 ? first.name : "Selected structures",
              elements: view.selected,
            }
          : null),
    );
    setDetails(view.inspectorOpen);
    setPanel(null);
    setState((current) => savedViewState(view, current.reset + 1));
  };
  useEffect(() => {
    if (!atlas) return;
    const loadLink = () => {
      const linked = viewModelFromHash(location.hash);
      if (linked && linked !== model) {
        changeModel(linked, true);
        return;
      }
      const view = readViewHash(location.hash, atlas);
      if (view) {
        restoreView(view);
        setViewNotice("Shared view opened.");
      } else if (location.hash.startsWith("#view="))
        setViewNotice("This view link could not be opened. You can explore the atlas normally.");
    };
    loadLink();
    window.addEventListener("hashchange", loadLink);
    return () => window.removeEventListener("hashchange", loadLink);
  }, [atlas, model]);
  useEffect(() => {
    if (!viewNotice) return;
    const timeout = window.setTimeout(() => setViewNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [viewNotice]);
  const getView = () => {
    if (!cameraPose.current || !settled.current) return null;
    setState((current) => ({ ...current, rotate: false }));
    return captureSavedView(
      { ...state, inspectorOpen: details && selectedParts.length > 0 },
      cameraPose.current,
      chosen?.id,
      model,
    );
  };
  return (
    <main className="studio">
      {atlas && (
        <AnatomyScene
          atlas={atlas}
          state={{ ...state, inspectorOpen: details && selectedParts.length > 0 }}
          onSelect={choosePart}
          onProgress={(n) => {
            setProgress(n);
            if (n === 100) setError("");
          }}
          onError={setError}
          onCameraChange={(pose, ready) => {
            cameraPose.current = pose;
            if (settled.current !== ready) {
              settled.current = ready;
              setViewReady(ready);
            }
          }}
        />
      )}
      <div className="vignette" />
      {viewNotice && (
        <div className="view-notice glass" role="status">
          {viewNotice}
        </div>
      )}
      <header className="identity">
        <h1>
          Human Atlas + <span className="edition">3D</span>
        </h1>
        <div className="identity-meta">
          {atlas ? atlas.parts.length.toLocaleString() : MODELS[model].pieces.toLocaleString()}{" "}
          modeled pieces
          <span className="identity-source">
            {" "}<span>·</span> {MODELS[model].source}
          </span>
        </div>
      </header>
      <fieldset className="model-switch">
        <legend className="sr-only">Anatomy model</legend>
        <label className="model-option">
          <input
            className="sr-only"
            type="radio"
            name="anatomy-model"
            value="male"
            checked={model === "male"}
            onChange={() => changeModel("male")}
          />
          <span className="model-option-label">Male</span>
        </label>
        <label className="model-option">
          <input
            className="sr-only"
            type="radio"
            name="anatomy-model"
            value="female"
            checked={model === "female"}
            onChange={() => changeModel("female")}
          />
          <span className="model-option-label">
            Female{" "}
            <span className="model-status" title="Experimental">
              (Exp)
            </span>
          </span>
        </label>
      </fieldset>
      <div ref={savedPanelAnchor} className="explorer-panel-anchor" aria-hidden="true" />
      <nav className="top-actions" aria-label="Explorer panels">
        <Button
          variant="ghost"
          className={panel === "search" ? "active" : ""}
          onClick={() => openPanel("search")}
          aria-label="Search anatomy"
        >
          <Search size={18} />
          <span>Find a structure</span>
          <kbd>/</kbd>
        </Button>
        {atlas && (
          <ViewLibrary
            key={model}
            atlas={atlas}
            open={panel === "saved"}
            onOpenChange={(open) => {
              if (open) setDetails(false);
              setPanel((current) => open ? "saved" : current === "saved" ? null : current);
            }}
            panelAnchor={savedPanelAnchor}
            ready={viewReady && !error}
            defaultName={chosen?.name ?? "My anatomy view"}
            getView={getView}
            onRestore={restoreView}
          />
        )}
        <Button
          variant="ghost"
          className="icon-button"
          aria-label="About this atlas"
          onClick={() => openAbout()}
        >
          <Info size={18} />
        </Button>
      </nav>
      <section
        className={`layers-panel glass ${panel === "layers" ? "mobile-open" : ""}`}
        aria-label="Anatomical layers"
      >
        <div className="panel-heading">
          <span>Systems</span>
          <Button
            variant="ghost"
            className="mobile-only icon-button"
            onClick={() => setPanel(null)}
            aria-label="Close systems"
          >
            <X size={18} />
          </Button>
          <Badge variant="secondary" className="desktop-only small-number">
            {activeSystems.length}
          </Badge>
        </div>
        <div className="layer-presets">
          <Button
            variant="ghost"
            aria-pressed={activeSystems.every((x) => state.visible.includes(x.id))}
            onClick={() => setLayers(activeSystems.map((system) => system.id))}
          >
            All
          </Button>
          <Button
            variant="ghost"
            aria-pressed={state.visible.length === 1 && state.visible[0] === "skeletal"}
            onClick={() => setLayers(["skeletal"])}
          >
            Skeleton
          </Button>
          <Button
            variant="ghost"
            aria-pressed={
              state.visible.length === organSystems.length &&
              organSystems.every((id) => state.visible.includes(id))
            }
            onClick={() => setLayers(organSystems)}
          >
            Organs
          </Button>
        </div>
        {atlas && (
          <SystemLayers
            atlas={atlas}
            state={state}
            onOnly={(id) => setLayers([id])}
            onToggle={toggle}
            onStructureToggle={toggleStructure}
            onInspect={choose}
            onOpacity={(id, opacity) =>
              setState((current) => ({
                ...current,
                opacity: { ...current.opacity, [id]: opacity },
              }))
            }
          />
        )}
        <div className="opacity-help">
          <span>Expand a system to adjust opacity.</span>
          {Object.keys(state.opacity ?? {}).length > 0 && (
            <Button
              variant="ghost"
              onClick={() => setState((current) => ({ ...current, opacity: {} }))}
            >
              Reset opacity
            </Button>
          )}
        </div>
        <div className="panel-foot">
          <span>{visibleCount.toLocaleString()} pieces visible</span>
          <Button variant="ghost" onClick={() => setLayers([])}>
            Hide all
          </Button>
        </div>
      </section>
      {panel === "search" && (
        <section
          ref={searchPanel}
          className="search-panel glass"
          aria-label="Find anatomy"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setPanel(null);
            }
          }}
        >
          <div className="panel-heading">
            <span>Find a structure</span>
            <Button
              variant="ghost"
              className="icon-button"
              onClick={() => setPanel(null)}
              aria-label="Close search"
            >
              <X size={18} />
            </Button>
          </div>
          <Combobox<SearchConcept>
            items={results}
            value={null}
            onValueChange={(value) => {
              if (value) choose(value);
            }}
            inputValue={query}
            onInputValueChange={setQuery}
            itemToStringLabel={(c) => c.name}
            filter={null}
            inline
            open
            onOpenChange={(open) => {
              if (!open) setPanel(null);
            }}
          >
            <ComboboxInput
              autoFocus
              placeholder="Heart, femur, quads, hamstrings…"
              aria-label="Search named anatomical structures"
              showTrigger={false}
            />
            <div className="anatomy-search-results">
              <ComboboxEmpty className="anatomy-search-empty">
                No structures match your search.
              </ComboboxEmpty>
              <div className="search-history-heading">
                <span>
                  {query
                    ? "Matching structures"
                    : recent.length
                      ? "Recent & common structures"
                      : "Common structures"}
                </span>
                {recent.length > 0 && (
                  <Button variant="ghost" onClick={() => setRecentIds([])}>
                    Clear recent
                  </Button>
                )}
              </div>
              <ComboboxList aria-label="Anatomical structures">
                {(c: SearchConcept) => (
                  <ComboboxItem key={c.id} value={c}>
                    <span className="search-result-name">
                      {c.name}
                      {!query && recentIds.includes(c.id) && (
                        <small className="recent-tag">Recent</small>
                      )}
                    </span>
                    <span className="small-number">
                      {c.elements.length} {c.elements.length === 1 ? "piece" : "pieces"}
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </div>
          </Combobox>
          <p className="search-note">
            {query
              ? "Showing up to 80 matches. Refine your search to find smaller structures."
              : "Start with a major organ, or search every named structure."}
          </p>
        </section>
      )}
      <nav className="view-controls glass" aria-label="Camera controls">
        {(["three-quarter", "front", "side", "back"] as View[]).map((view, index) => (
          <Button
            variant="ghost"
            key={view}
            className={state.view === view ? "active" : ""}
            aria-pressed={state.view === view}
            disabled={state.explode > 0.8 && view !== "front"}
            onClick={() =>
              setState((current) => ({
                ...current,
                view,
                reset: current.reset + 1,
                rotate: false,
                focus: 0,
                focusContext: false,
              }))
            }
            title={view + " view"}
            aria-label={view + " view"}
          >
            <span>{["¾", "F", "S", "B"][index]}</span>
          </Button>
        ))}
        <i />
        <Button
          variant="ghost"
          disabled={state.explode >= 0.4}
          aria-label={state.rotate ? "Pause rotation" : "Rotate body"}
          title="Auto rotate"
          className={state.rotate ? "active" : ""}
          onClick={() => setState((current) => ({ ...current, rotate: !current.rotate }))}
        >
          {state.rotate ? (
            <Pause size={17} />
          ) : state.rotationDirection === "counterclockwise" ? (
            <RotateCcw size={18} />
          ) : (
            <RotateCw size={18} />
          )}
        </Button>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                disabled={state.explode >= 0.4}
                aria-label="Rotation settings"
                title="Rotation settings"
              />
            }
          >
            <Settings2 size={17} />
          </PopoverTrigger>
          <PopoverContent className="rotation-settings" side="left" align="end" sideOffset={10}>
            <div className="rotation-heading">
              <strong>Rotation speed</strong>
              <output>{Math.round((state.rotationSpeed ?? 1) * 10)}%</output>
            </div>
            <Slider
              aria-label="Rotation speed"
              min={1}
              max={100}
              step={1}
              value={[(state.rotationSpeed ?? 1) * 10]}
              onValueChange={(value) =>
                setState((current) => ({
                  ...current,
                  rotationSpeed: (Array.isArray(value) ? value[0] : value) / 10,
                }))
              }
            />
            <div className="rotation-speed-labels">
              <span>1%</span>
              <Button
                variant="ghost"
                onClick={() => setState((current) => ({ ...current, rotationSpeed: 1 }))}
              >
                Standard · 10%
              </Button>
              <span>100%</span>
            </div>
            <fieldset className="rotation-options">
              <legend>Direction</legend>
              {(["clockwise", "counterclockwise"] as const).map((direction) => (
                <label key={direction}>
                  <input
                    type="radio"
                    name="rotation-direction"
                    value={direction}
                    checked={(state.rotationDirection ?? "clockwise") === direction}
                    onChange={() =>
                      setState((current) => ({ ...current, rotationDirection: direction }))
                    }
                  />
                  {direction === "clockwise" ? "Clockwise" : "Counterclockwise"}
                </label>
              ))}
            </fieldset>
          </PopoverContent>
        </Popover>
        <Button variant="ghost" aria-label="Reset view and layers" title="Reset" onClick={reset}>
          <RotateCcw size={17} />
        </Button>
      </nav>
      <div className="bottom-dock glass">
        <Button
          variant="ghost"
          className="mobile-only dock-layers"
          onClick={() => openPanel("layers")}
          aria-label="Open system layers"
        >
          <Layers3 size={20} />
          <span>Systems</span>
        </Button>
        <div className="explode-control">
          <div className="explode-label">
            <label id="explode-label">Explode anatomy</label>
            <output>
              {Math.round(state.explode * 100)}
              <span>%</span>
            </output>
          </div>
          <Slider
            aria-labelledby="explode-label"
            min={0}
            max={100}
            step={1}
            value={[state.explode * 100]}
            onValueChange={(v) =>
              setState((s) => ({
                ...s,
                explode: (Array.isArray(v) ? v[0] : v) / 100,
                view: (Array.isArray(v) ? v[0] : v) > 80 ? "front" : s.view,
                rotate: false,
                focus: 0,
                focusContext: false,
              }))
            }
          />
          <div className="slider-endpoints">
            <span>Assembled</span>
            <span>Every piece</span>
          </div>
        </div>
        <Button
          variant="ghost"
          className="dock-reset"
          onClick={reset}
          aria-label="Assemble and reset"
        >
          <RotateCcw size={18} />
          <span>Reset</span>
        </Button>
      </div>
      <footer className="studio-footer">
        <span>
          {state.explode > 0.8 ? "Drag to pan" : "Drag to orbit"} <b>·</b> Pinch to zoom <b>·</b>{" "}
          Tap to inspect
        </span>
        <div className="pwa-footer-actions">
          {pwa.support === "available" && (
            <Button
              variant="ghost"
              disabled={pwa.checking || pwa.updating}
              aria-busy={pwa.checking || pwa.updating}
              title="Check for updates and reload when a new version is ready"
              onClick={() => {
                openAbout(true);
                void updateApp();
              }}
            >
              <RefreshCw size={12} aria-hidden="true" /> <span>Update</span>
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => openAbout()}
          >
            {pwaLabel(pwa) && <span className="pwa-footer-status">{pwaLabel(pwa)}</span>}
            <span>App & credits</span> <ArrowUpRight size={12} />
          </Button>
        </div>
      </footer>
      {progress < 100 && !error && (
        <div className="loading glass" role="status">
          <Activity size={18} />
          <div>
            <strong>Preparing the anatomy</strong>
            <span>
              {progress}% · Loading{" "}
              {atlas?.parts.length.toLocaleString() ?? MODELS[model].pieces.toLocaleString()} pieces
            </span>
            <div className="loading-track">
              <i style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="loading glass error" role="alert">
          <p>{error}</p>
          <Button variant="ghost" onClick={() => location.reload()}>
            Reload viewer
          </Button>
        </div>
      )}
      <Sheet
        open={details && selectedParts.length > 0}
        modal={false}
        disablePointerDismissal
        onOpenChange={setDetails}
      >
        <SheetContent
          initialFocus={detailTitle}
          className={`detail-sheet glass ${state.isolate ? "is-isolated" : ""}`}
          showCloseButton={true}
        >
          <div className="detail-header">
            <div className="detail-accent" style={{ background: system?.color }} />
            <div className="eyebrow">{system?.name ?? "ANATOMY"}</div>
            <SheetTitle ref={detailTitle} tabIndex={-1} className="structure-title">
              {chosen?.name}
            </SheetTitle>
          </div>
          <div className="detail-scroll" key={`${chosen?.id}-${state.isolate}`}>
            <SheetDescription className="structure-description">
              {chosen?.searchGroup?.description ??
                (chosen && selected ? explanation(chosen.name, selected.system) : "")}
            </SheetDescription>
            {chosen && !chosen.searchGroup && !EXPLANATIONS[chosen.name.toLowerCase()] && (
              <span className="context-note">
                System overview · structure identified from source anatomy
              </span>
            )}
            <div className="structure-meta">
              <span>
                {chosen?.searchGroup ? "Explorer group" : "Atlas reference"}
                <strong>{chosen?.id}</strong>
              </span>
              <span>
                Selected pieces<strong>{state.selected.length.toLocaleString()}</strong>
              </span>
            </div>
            {selectedParts.length > 1 && (
              <div className="member-list">
                <h3>Included structures</h3>
                {selectedParts.slice(0, 50).map((p) => (
                  <Button variant="ghost" key={p.id} onClick={() => choosePart(p.id)}>
                    <span>{p.name}</span>
                    <ChevronRight size={14} />
                  </Button>
                ))}
                {selectedParts.length > 50 && (
                  <p>And {selectedParts.length - 50} more modeled pieces.</p>
                )}
              </div>
            )}
            <a
              className="source-link"
              href={
                selected?.id.startsWith("VH_F_")
                  ? "https://doi.org/10.48539/HBM352.BTSQ.586"
                  : "https://lifesciencedb.jp/bp3d/"
              }
              target="_blank"
              rel="noreferrer"
            >
              View anatomical source <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="detail-actions">
            <div className="detail-focus-actions">
              <Button
                variant="outline"
                className="locate-action"
                aria-label={state.isolate ? "Locate structure in body" : "Locate structure"}
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    isolate: false,
                    explode: 0,
                    focusContext: current.isolate || !!(current.focusContext && current.focus),
                    focus: (current.focus ?? 0) + 1,
                    rotate: false,
                  }))
                }
              >
                <Focus size={16} />
                Locate
              </Button>
              <Button
                className={"primary-action " + (state.isolate ? "active" : "")}
                aria-label={state.isolate ? "Show surrounding anatomy" : "Isolate structure"}
                onClick={() =>
                  setState((current) => ({
                    ...current,
                    isolate: !current.isolate,
                    explode: 0,
                    focus: (current.focus ?? 0) + 1,
                    focusContext: false,
                    rotate: false,
                  }))
                }
              >
                {state.isolate ? "Surroundings" : "Isolate"}
                <ChevronRight size={16} />
              </Button>
            </div>
            <Button variant="ghost" className="secondary-action" onClick={returnOverall}>
              Return to overall view
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={about} onOpenChange={setAbout}>
        <SheetContent
          className="about-sheet glass"
          initialFocus={
            aboutUpdates
              ? () => {
                  updateTitle.current?.parentElement?.scrollIntoView({ block: "nearest" });
                  return updateTitle.current;
                }
              : aboutTitle
          }
        >
          <PwaPanel
            state={pwa}
            loaded={progress === 100}
            titleRef={aboutTitle}
            updateTitleRef={updateTitle}
          />
          <SheetTitle className="eyebrow">SOURCE & SCOPE</SheetTitle>
          <fieldset className="about-model-switch">
            <legend className="sr-only">Model information</legend>
            <label className="model-option">
              <input
                className="sr-only"
                type="radio"
                name="about-anatomy-model"
                value="male"
                checked={aboutModel === "male"}
                onChange={() => setAboutModel("male")}
              />
              <span className="model-option-label">Male</span>
            </label>
            <label className="model-option">
              <input
                className="sr-only"
                type="radio"
                name="about-anatomy-model"
                value="female"
                checked={aboutModel === "female"}
                onChange={() => setAboutModel("female")}
              />
              <span className="model-option-label">
                Female <span className="model-status" title="Experimental">(Exp)</span>
              </span>
            </label>
          </fieldset>
          <SheetDescription>
            {aboutModel === "female"
              ? "Explore the experimental female study model from BodyParts3D and HRA."
              : "Explore the adult male reference anatomy from BodyParts3D."}
          </SheetDescription>
          <div className="about-copy">
            <p>
              <strong>{aboutModel === "female" ? "Female · Experimental" : "Male · BodyParts3D"}</strong>
              <br />
              {aboutModel === "female"
                ? "2,245 individual meshes and 4,248 named concepts. The model combines adapted BodyParts3D anatomy with female HRA pelvis, reproductive organs, breast tissue, and knee ligaments."
                : "2,234 individual meshes and 3,432 named concepts from an adult male reference anatomy."}
            </p>
            {aboutModel === "female" && (
              <p>
                Proportions and organ placement are estimated and await independent anatomical
                review. Female external skin, genital surfaces, and validated urethra/pelvic-floor
                replacements are incomplete. The uterosacral ligament registration restores the
                source assembly's pelvic relationship; it does not validate the original attachment
                anatomy.
              </p>
            )}
            <p>
              This reference does not contain every human structure or variation. Named concepts can
              contain multiple pieces; each source mesh is rendered once.
            </p>
            <p>
              Colors and system groupings are designed for exploration. The geometry is simplified
              for the web, and short explanations provide general educational context. This is an
              anatomical reference, not a diagnostic or surgical tool.
            </p>
            <h3>Source</h3>
            <p>
              BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0
              International.
              {aboutModel === "female" &&
                " HRA / HuBMAP female organ geometry by Kristen Browne and Heidi Schlehlein (2023), CC BY 4.0; adapted by Human Atlas Enhanced and imported through Anatolume."}
            </p>
            {aboutModel === "female" && (
              <a href="https://doi.org/10.48539/HBM352.BTSQ.586" target="_blank" rel="noreferrer">
                Female reference organ dataset <ArrowUpRight size={14} />
              </a>
            )}
            <a
              href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html"
              target="_blank"
              rel="noreferrer"
            >
              Dataset license <ArrowUpRight size={14} />
            </a>
            <a
              href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html"
              target="_blank"
              rel="noreferrer"
            >
              Original geometry & metadata <ArrowUpRight size={14} />
            </a>
            <a
              href="https://academic.oup.com/nar/article/37/suppl_1/D782/1000752"
              target="_blank"
              rel="noreferrer"
            >
              Read the source publication <ArrowUpRight size={14} />
            </a>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
