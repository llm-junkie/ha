import { flushSync } from "react-dom";
import "./view-library.css";
import { assetUrl } from "./asset-url";
import { usePanelViewport } from "./use-panel-viewport";
import {
  anatomicalSources,
  defaultLayers,
  isModelAtlas,
  MODELS,
  MODEL_STORAGE_KEY,
  readModel,
  type ModelId,
} from "./model-catalogue";
import { registerAtlasTools } from "./agent-tools";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Focus,
  Info,
  Layers3,
  Mars,
  Pause,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Venus,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Combobox,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import AnatomyScene from "./scene";
import BrightnessControl from "./brightness-control";
import { backgroundColor, backgroundForeground } from "./background-brightness";
import SystemLayers from "./system-layers";
import ViewLibrary from "./view-library";
import PwaPanel, { pwaLabel } from "./pwa-panel";
import { prepareOffline, usePwa } from "./pwa";
import { APP_VERSION } from "./version";
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
  DEFAULT_ROTATION_SPEED,
  MIN_ROTATION_SPEED,
  MAX_ROTATION_SPEED,
  SYSTEMS,
  EXPLANATIONS,
  explanation,
  type Atlas,
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
  rotationSpeed: DEFAULT_ROTATION_SPEED,
  rotationDirection: "clockwise",
};
const mobileControlsQuery = "(max-width: 767px), (max-height: 600px) and (orientation: landscape)";
const landscapeControlsQuery = "(max-height: 600px) and (orientation: landscape)";
const systemsPinnedKey = "human-atlas:systems-pinned";
export default function Home() {
  const pwa = usePwa();
  const [brightness, setBrightness] = useState(0);
  const [defaultBackground] = useState(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
  );
  const viewerBackground = useMemo(
    () => backgroundColor(defaultBackground, brightness),
    [defaultBackground, brightness],
  );
  const footerStatus = pwaLabel(pwa);
  const dockFooterStatus =
    footerStatus === "Update available" || footerStatus === "Install app"
      ? footerStatus
      : pwa.installed ? `Version ${APP_VERSION}` : "";
  const offlineFooterStatus = !pwa.online ? "Offline" : pwa.ready ? "Offline ready" : "";
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
  const rotationControls = useRef<HTMLElement>(null);
  const rotationSettingsButton = useRef<HTMLButtonElement>(null);
  const [mobileControls, setMobileControls] = useState(() => window.matchMedia(mobileControlsQuery).matches);
  const [landscapeControls, setLandscapeControls] = useState(() => window.matchMedia(landscapeControlsQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(mobileControlsQuery);
    const landscape = window.matchMedia(landscapeControlsQuery);
    const update = () => {
      setMobileControls(media.matches);
      setLandscapeControls(landscape.matches);
    };
    update();
    media.addEventListener("change", update);
    landscape.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      landscape.removeEventListener("change", update);
    };
  }, []);
  const rotationAnchor = useMemo(() => ({
    get contextElement() { return rotationControls.current ?? undefined; },
    getBoundingClientRect: () => new DOMRect(
      landscapeControls
        ? document.documentElement.clientWidth / 2
        : rotationSettingsButton.current?.getBoundingClientRect().right ?? document.documentElement.clientWidth / 2,
      rotationControls.current?.getBoundingClientRect().bottom ?? 0,
      0,
      0,
    ),
  }), [landscapeControls]);
  const updateVersion = useRef<HTMLParagraphElement>(null);
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
    [panel, setPanel] = useState<"layers" | "search" | "saved" | "share" | null>(null),
    [details, setDetails] = useState(false),
    [about, setAbout] = useState(false),
    [query, setQuery] = useState(""),
    [chosen, setChosen] = useState<SearchConcept | null>(null);
  const [systemsPinned, setSystemsPinned] = useState(() => {
    try {
      return localStorage.getItem(systemsPinnedKey) !== "false";
    } catch {
      return true;
    }
  });
  const systemsOpen = mobileControls ? panel === "layers" : systemsPinned;
  useEffect(() => {
    try {
      localStorage.setItem(systemsPinnedKey, String(systemsPinned));
    } catch {
      /* Pinning still works when storage is unavailable. */
    }
  }, [systemsPinned]);
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
  const enabledSystemCount = activeSystems.filter((system) => state.visible.includes(system.id)).length;
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
  const inspectorOpen = details && selectedParts.length > 0;
  // Opening interface panels must not restart the camera's remaining orbit damping.
  const sceneState = useMemo(() => ({ ...state, inspectorOpen }), [state, inspectorOpen]);
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
      rotate: false,
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
    if (next !== "layers") setDetails(false);
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
    <main className="studio" style={{
      "--background": viewerBackground,
      "--scene-foreground": backgroundForeground(viewerBackground),
    } as CSSProperties}>
      {atlas && (
        <AnatomyScene
          atlas={atlas}
          backgroundColor={viewerBackground}
          state={sceneState}
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
            {" "}
            <span>·</span> {MODELS[model].source}
          </span>
        </div>
      </header>
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
              setPanel((current) => (open ? "saved" : current === "saved" ? null : current));
            }}
            shareOpen={panel === "share"}
            onShareOpenChange={(open) => {
              if (open) setDetails(false);
              setPanel((current) => (open ? "share" : current === "share" ? null : current));
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
        id="systems-panel"
        className={`layers-panel glass ${mobileControls && panel === "layers" ? "mobile-open" : ""}`}
        hidden={!systemsOpen}
        aria-label="Anatomical layers"
      >
        <div className="panel-heading">
          <span>Systems ({enabledSystemCount})</span>
          <Button
            variant="ghost"
            className="icon-button panel-close"
            onClick={() => {
              setPanel(null);
              if (!mobileControls) setSystemsPinned(false);
            }}
            aria-label="Close systems"
          >
            <X size={18} />
          </Button>
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
              className="icon-button panel-close"
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
      <div className="viewer-controls">
        <fieldset className="model-switch glass">
          <legend className="sr-only">Anatomy model</legend>
          <label className="model-option" title="Male model">
            <input
              className="sr-only"
              type="radio"
              name="anatomy-model"
              value="male"
              checked={model === "male"}
              onChange={() => changeModel("male")}
            />
            <span className="model-option-label">
              <Mars size={19} aria-hidden="true" />
              <span className="sr-only">Male</span>
            </span>
          </label>
          <label className="model-option" title="Female model (experimental)">
            <input
              className="sr-only"
              type="radio"
              name="anatomy-model"
              value="female"
              checked={model === "female"}
              onChange={() => changeModel("female")}
            />
            <span className="model-option-label">
              <Venus size={19} aria-hidden="true" />
              <span className="sr-only">Female (experimental)</span>
            </span>
          </label>
        </fieldset>
        <nav ref={rotationControls} className="view-controls glass" aria-label="Camera controls">
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
            disabled={state.explode >= 0.8}
            aria-label={state.rotate ? "Pause rotation" : "Rotate body"}
            title="Auto rotate"
            className={state.rotate ? "active" : ""}
            onClick={() => setState((current) => ({ ...current, rotate: !current.rotate }))}
          >
            {state.rotate ? <Pause size={17} /> : <Play size={18} />}
          </Button>
          <Popover>
            <PopoverTrigger
              ref={rotationSettingsButton}
              render={
                <Button
                  variant="ghost"
                  disabled={state.explode >= 0.8}
                  aria-label="Rotation settings"
                  title="Rotation settings"
                />
              }
            >
              <Settings2 size={17} />
            </PopoverTrigger>
            <PopoverContent
              className="rotation-settings"
              anchor={mobileControls ? rotationAnchor : undefined}
              positionMethod={mobileControls ? "fixed" : "absolute"}
              side={mobileControls ? "bottom" : "left"}
              align={mobileControls && landscapeControls ? "center" : "end"}
              sideOffset={10}
              collisionAvoidance={mobileControls ? { side: "shift", align: "shift", fallbackAxisSide: "none" } : undefined}
              collisionPadding={mobileControls ? 16 : undefined}
            >
              <div className="rotation-heading">
                <strong>Rotation speed</strong>
                <output>{Math.round((state.rotationSpeed ?? DEFAULT_ROTATION_SPEED) * 10)}%</output>
              </div>
              <Slider
                aria-label="Rotation speed"
                min={0}
                max={MAX_ROTATION_SPEED * 10}
                step={1}
                style={{
                  "--rotation-snap-position": `${(DEFAULT_ROTATION_SPEED / MAX_ROTATION_SPEED) * 100}%`,
                } as CSSProperties}
                value={[(state.rotationSpeed ?? DEFAULT_ROTATION_SPEED) * 10]}
                onValueChange={(value, details) => {
                  const requested = Math.max(MIN_ROTATION_SPEED * 10, Array.isArray(value) ? value[0] : value);
                  const standard = DEFAULT_ROTATION_SPEED * 10;
                  const speed = details.reason !== "keyboard" && Math.abs(requested - standard) <= 3
                    ? standard
                    : requested;
                  setState((current) => ({
                    ...current,
                    rotationSpeed: speed / 10,
                  }));
                }}
              />
              <div className="rotation-speed-labels">
                <span>0%</span>
                <Button
                  variant="ghost"
                  onClick={() => setState((current) => ({ ...current, rotationSpeed: DEFAULT_ROTATION_SPEED }))}
                >
                  Standard · {DEFAULT_ROTATION_SPEED * 10}%
                </Button>
                <span>{MAX_ROTATION_SPEED * 10}%</span>
              </div>
              <fieldset className="rotation-options">
                <legend>Direction</legend>
                <div className="rotation-direction-toggle">
                  {(["clockwise", "counterclockwise"] as const).map((direction) => (
                    <label className="model-option" key={direction}>
                      <input
                        className="sr-only"
                        type="radio"
                        name="rotation-direction"
                        value={direction}
                        checked={(state.rotationDirection ?? "clockwise") === direction}
                        onChange={() =>
                          setState((current) => ({ ...current, rotationDirection: direction }))
                        }
                      />
                      <span className="model-option-label">
                        {direction === "clockwise" ? "Clockwise" : "Counterclockwise"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </PopoverContent>
          </Popover>
          <BrightnessControl
            value={brightness}
            onChange={setBrightness}
            horizontal={mobileControls && !landscapeControls}
            anchor={rotationControls}
          />
        </nav>
      </div>
      <div className="bottom-dock glass">
        <Button
          variant="ghost"
          className="dock-layers"
          onClick={() => {
            if (mobileControls) openPanel("layers");
            else {
              setPanel(systemsPinned ? null : "layers");
              setSystemsPinned((pinned) => !pinned);
            }
          }}
          aria-label={mobileControls ? "Open system layers" : "Pin systems panel"}
          aria-pressed={mobileControls ? undefined : systemsPinned}
          aria-expanded={systemsOpen}
          aria-controls="systems-panel"
          title={mobileControls ? undefined : systemsPinned ? "Unpin systems panel" : "Pin systems panel"}
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
            onValueChange={(v, details) => {
              const requested = Array.isArray(v) ? v[0] : v;
              const snap = [45, 79].find((point) => Math.abs(requested - point) <= 3);
              const value = details.reason !== "keyboard" ? snap ?? requested : requested;
              setState((s) => ({
                ...s,
                explode: value / 100,
                view: value > 80 ? "front" : s.view,
                rotate: false,
                focus: 0,
                focusContext: false,
              }));
            }}
          />
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
          <Button variant="ghost" onClick={() => openAbout()}>
            {offlineFooterStatus && <span className="pwa-footer-status">{offlineFooterStatus}</span>}
            <span>App & credits</span> <ArrowUpRight size={12} />
          </Button>
        </div>
        {dockFooterStatus && (
          <Button
            variant="ghost"
            className="dock-pwa-status"
            onClick={() => openAbout(pwa.updateAvailable || pwa.installed)}
          >
            {dockFooterStatus}
          </Button>
        )}
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
        open={details && selectedParts.length > 0 && panel !== "layers"}
        modal={false}
        disablePointerDismissal
        onOpenChange={(open) => {
          setDetails(open);
          if (!open) {
            setChosen(null);
            setState((current) => ({
              ...current,
              selected: [],
              isolate: false,
              focus: 0,
              focusContext: false,
            }));
          }
        }}
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
          <div className="detail-body" key={chosen?.id}>
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
              {selectedParts.some((p) => p.id.startsWith("ZA_N")) && (
                <span className="context-note">Z-Anatomy · estimated registration</span>
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
              {anatomicalSources(selectedParts).map((source) => (
                <a
                  key={source.name}
                  className="source-link"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.name} source <ArrowUpRight size={14} />
                </a>
              ))}
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
                      focusContext: true,
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
                      focus: (current.focus ?? 0) + 1,
                      focusContext: current.isolate,
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
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={about} onOpenChange={setAbout}>
        <SheetContent
          className="about-sheet glass"
          initialFocus={
            aboutUpdates
              ? () => {
                  updateVersion.current?.parentElement?.scrollIntoView({ block: "nearest" });
                  return updateVersion.current;
                }
              : aboutTitle
          }
        >
          <SheetTitle ref={aboutTitle} tabIndex={-1} className="about-heading">
            <Info size={18} aria-hidden="true" />
            Information
          </SheetTitle>
          <a
            className={`${buttonVariants({ variant: "ghost", size: "icon-sm" })} about-github`}
            href="https://github.com/llm-junkie/ha"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View Human Atlas + on GitHub (opens in a new tab)"
            title="View on GitHub"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <PwaPanel
            state={pwa}
            loaded={progress === 100}
            updateVersionRef={updateVersion}
          />
          <h2 className="eyebrow">SOURCE & SCOPE</h2>
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
              <span className="model-option-label">
                <Mars size={16} aria-hidden="true" />
                Male
              </span>
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
                <Venus size={16} aria-hidden="true" />
                Female{" "}
                <span className="model-status" title="Experimental">
                  (Exp)
                </span>
              </span>
            </label>
          </fieldset>
          <SheetDescription>
            {aboutModel === "female"
              ? "Explore the experimental female study model from BodyParts3D, HRA, and Z-Anatomy."
              : "Explore the adult male reference anatomy from BodyParts3D, with nerves from Z-Anatomy."}
          </SheetDescription>
          <details className="about-details">
            <summary>
              <span>Details</span>
              <span className="about-details-rule" aria-hidden="true" />
              <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className="about-copy">
              <p>
                {aboutModel === "female"
                  ? `${MODELS.female.pieces.toLocaleString()} individual meshes and ${MODELS.female.concepts.toLocaleString()} named concepts. The model combines adapted BodyParts3D anatomy with female HRA pelvis, reproductive organs, breast tissue, knee ligaments, and fitted body skin, plus Z-Anatomy neural structures.`
                  : `${MODELS.male.pieces.toLocaleString()} individual meshes and ${MODELS.male.concepts.toLocaleString()} named concepts from BodyParts3D and Z-Anatomy.`}
              </p>
              <p>
                Z-Anatomy adds 210 meshes for spinal cord tissue, spinal roots, trunk nerves, and arm
                and leg nerves. Their placement is estimated against the reference skeleton; the
                female version follows this model's estimated body proportions.
              </p>
              {aboutModel === "female" && (
                <p>
                  Proportions and organ placement are estimated and await independent anatomical
                  review. The full-body female skin is fitted to this assembly. Detailed external
                  genital anatomy and validated urethra/pelvic-floor replacements remain incomplete.
                  The uterosacral ligament registration restores the
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
              <h3>Model licenses</h3>
              <p>
                BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0
                International.
                {aboutModel === "female" &&
                  " HRA / HuBMAP female organ geometry by Kristen Browne and Heidi Schlehlein (2023), CC BY 4.0; adapted by Human Atlas Enhanced and imported through Anatolume. Female body skin from the HuBMAP CCF 3D Reference Object Library v1.3, fitted locally under CC BY 4.0."}
                {
                  " Z-Anatomy — the open source atlas of anatomy; models by Gauthier Kervyn and contributors, distributed by Lluís Vinent Juanico's Z-Anatomy project. Adapted neural data: CC BY-SA 4.0."
                }
              </p>
              <a href="https://github.com/LluisV/Z-Anatomy" target="_blank" rel="noreferrer">
                Z-Anatomy source models <ArrowUpRight size={14} />
              </a>
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                Neural data license <ArrowUpRight size={14} />
              </a>
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
          </details>
        </SheetContent>
      </Sheet>
    </main>
  );
}
