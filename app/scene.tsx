import { createAnatomyMaterial } from "./anatomy-material";
import { updateDrawBatches, type DrawBatch } from "./draw-batches";
import { useEffect, useRef } from "react";
import * as T from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createExplosionLayout } from "./explosion-layout";
import { decodeModelResponse } from "./model-download";
import { assetUrl } from "./asset-url";
import { PointerTap } from "./pointer-tap";
import { partIsVisible } from "./part-visibility";
import { createCursorZoom } from "./cursor-zoom";
import { createFrameScheduler } from "./frame-scheduler";
import { SYSTEMS, type Atlas, type SceneState } from "./anatomy";
interface Props {
  atlas: Atlas;
  state: SceneState;
  onSelect: (id: string) => void;
  onProgress: (n: number) => void;
  onError: (s: string) => void;
}
export default function AnatomyScene({ atlas, state, onSelect, onProgress, onError }: Props) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(state),
    select = useRef(onSelect),
    wake = useRef<() => void>(() => {});
  useEffect(() => {
    wake.current();
  }, [state]);
  latest.current = state;
  select.current = onSelect;
  useEffect(() => {
    const el = host.current!;
    let disposed = false,
      dirty = true,
      ready = false,
      lastView = "",
      lastReset = -1,
      lastSelectionFrame = "",
      layoutKey = "",
      amount = 0;
    let lastState: SceneState | null = null;
    let animate: (time: number) => void = () => {};
    let lastTime = 0;
    const frames = createFrameScheduler((time) => animate(time));
    const requestFrame = frames.request;
    wake.current = requestFrame;
    const abort = new AbortController();
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      frames.dispose();
      wake.current = () => {};
      onError(
        "This browser could not start the 3D viewer. Please try a browser with WebGL 2 enabled.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 768 ? 1.5 : 2));
    renderer.setClearColor("#f2f3f3");
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive human anatomy. Drag to orbit, pinch or scroll to zoom, and tap a structure to inspect it.",
    );
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(34, 1, 0.005, 100),
      controls = new OrbitControls(camera, renderer.domElement);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cameraTransition: {
      start: number;
      position: T.Vector3;
      target: T.Vector3;
      destination: T.Vector3;
      center: T.Vector3;
      offset: T.Vector2;
      destinationOffset: T.Vector2;
      orbit?: boolean;
    } | null = null;
    let surroundingView: { position: T.Vector3; target: T.Vector3; aspect: number } | null = null;
    camera.position.set(1.4, 1.05, 3.6);
    controls.target.set(0, 0.85, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.minDistance = 0.07;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.96;
    controls.addEventListener("change", () => {
      dirty = true;
      requestFrame();
    });
    controls.addEventListener("start", () => {
      // A drag, pinch or wheel gesture takes over from the guided movement.
      cameraTransition = null;
      requestFrame();
    });
    controls.addEventListener("end", () => {
      requestFrame();
    });
    const pmrem = new T.PMREMGenerator(renderer),
      room = new RoomEnvironment(),
      env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    room.dispose();
    pmrem.dispose();
    scene.add(new T.HemisphereLight(0xffffff, 0xa7acb2, 1.05));
    const key = new T.DirectionalLight(0xfffaf4, 2.3);
    key.position.set(-2, 4, 3);
    scene.add(key);
    const rim = new T.DirectionalLight(0xe9f0ff, 1.8);
    rim.position.set(2, 2, -3);
    scene.add(rim);
    const ground = new T.Mesh(
      new T.CircleGeometry(30, 96),
      new T.MeshStandardMaterial({ color: 0xd5d9dc, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.019;
    scene.add(ground);
    const platform = new T.Mesh(
      new T.CylinderGeometry(0.68, 0.7, 0.028, 100),
      new T.MeshStandardMaterial({ color: 0xeeeeec, metalness: 0.12, roughness: 0.67 }),
    );
    platform.position.y = -0.016;
    scene.add(platform);
    const ring = new T.Mesh(
      new T.RingGeometry(0.63, 0.632, 128),
      new T.MeshBasicMaterial({
        color: 0x8c969f,
        transparent: true,
        opacity: 0.4,
        side: T.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    scene.add(ring);
    const innerRing = new T.Mesh(
      new T.RingGeometry(0.55, 0.551, 128),
      new T.MeshBasicMaterial({
        color: 0xa4aeb8,
        transparent: true,
        opacity: 0.16,
        side: T.DoubleSide,
      }),
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.001;
    scene.add(innerRing);
    const width = T.MathUtils.ceilPowerOfTwo(atlas.parts.length),
      data = new Float32Array(width * 4),
      partTexture = new T.DataTexture(data, width, 1, T.RGBAFormat, T.FloatType);
    partTexture.needsUpdate = true;
    const selectedData = new Uint8Array(width * 4),
      selectionTexture = new T.DataTexture(selectedData, width, 1);
    selectionTexture.needsUpdate = true;
    const materials: T.Material[] = [],
      geometries: T.BufferGeometry[] = [],
      pickers: (T.Mesh | undefined)[] = [],
      centers = atlas.parts.map((p) =>
        new T.Vector3()
          .fromArray(p.bounds[0])
          .add(new T.Vector3().fromArray(p.bounds[1]))
          .multiplyScalar(0.5),
      );
    const offsets: T.Vector3[] = [],
      bounds = atlas.parts.map(
        (p) =>
          new T.Box3(
            new T.Vector3().fromArray(p.bounds[0]),
            new T.Vector3().fromArray(p.bounds[1]),
          ),
      );
    const contextHighlight = new T.Group();
    const contextHighlightMaterial = new T.MeshBasicMaterial({
      color: "#6bd5bf",
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      depthFunc: T.GreaterDepth,
    });
    materials.push(contextHighlightMaterial);
    scene.add(contextHighlight);
    let contextHighlightKey = "";
    const availableSystems = SYSTEMS.filter((system) =>
      atlas.parts.some((part) => part.system === system.id),
    );
    const directions = new Map(
      availableSystems.map((system, group) => {
        const angle = (group / availableSystems.length) * Math.PI * 2;
        return [system.id, { x: Math.sin(angle) * 0.48, z: Math.cos(angle) * 0.48 }];
      }),
    );
    const spread = atlas.parts.map((part) => directions.get(part.system)!);
    let activeParts: number[] = [],
      selectedIndices: number[] = [],
      hasSolidParts = false,
      selectedKey = "";
    let packingWidth = 1,
      packingHeight = 1;
    const markerPositions = new Float32Array(atlas.parts.length * 3),
      markerGeometry = new T.BufferGeometry();
    markerGeometry.setAttribute("position", new T.BufferAttribute(markerPositions, 3));
    const markerMaterial = new T.PointsMaterial({
      color: 0x64748b,
      size: 5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
    });
    markerMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (distance(gl_PointCoord, vec2(0.5)) > 0.5) discard;",
      );
    };
    const markers = new T.Points(markerGeometry, markerMaterial);
    markers.frustumCulled = false;
    markers.renderOrder = 10;
    markers.visible = false;
    scene.add(markers);
    const hover = document.createElement("div");
    hover.className = "part-hover";
    hover.setAttribute("role", "tooltip");
    hover.hidden = true;
    el.appendChild(hover);
    type Target = {
      index: number;
      x: number;
      y: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
    };
    let targets: Target[] = [];
    let targetsDirty = true;
    let refreshTargets = () => {};
    const projected = new T.Vector3();
    const findTarget = (x: number, y: number, radius: number) => {
      if (targetsDirty) refreshTargets();
      let best = -1,
        score = Infinity;
      for (const t of targets) {
        const dx = Math.max(t.left - x, 0, x - t.right),
          dy = Math.max(t.top - y, 0, y - t.bottom),
          distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        const candidate = distance + Math.hypot(t.x - x, t.y - y) * 0.025;
        if (candidate < score) {
          score = candidate;
          best = t.index;
        }
      }
      return best;
    };
    const mats = new Map(
      SYSTEMS.map((system) => {
        const material = createAnatomyMaterial(system.id, partTexture, selectionTexture, width);
        materials.push(material);
        return [system.id, material];
      }),
    );
    const batches: DrawBatch[] = [];
    const partVisibility = new Uint8Array(atlas.parts.length);
    let loaded = 0;
    const loadChunk = async (ci: number) => {
      const chunk = atlas.chunks[ci],
        compressed = !!chunk.gzip && typeof DecompressionStream !== "undefined";
      const response = await fetch(assetUrl(compressed ? chunk.gzip! : chunk.url), {
        signal: abort.signal,
      });
      const buffer = await decodeModelResponse(response, chunk.bytes, compressed);
      if (disposed) return;
      const groups = new Map<string, { geometry: T.BufferGeometry; part: number }[]>();
      atlas.parts.forEach((p, i) => {
        if (p.chunk !== ci) return;
        const g = new T.BufferGeometry();
        g.setAttribute(
          "position",
          new T.BufferAttribute(new Float32Array(buffer, p.positions, p.vertexCount * 3), 3),
        );
        // GPU normalized signed-short normals keep the complete atlas compact in memory.
        g.setAttribute(
          "normal",
          new T.BufferAttribute(new Int16Array(buffer, p.normals, p.vertexCount * 3), 3, true),
        );
        g.setIndex(new T.BufferAttribute(new Uint32Array(buffer, p.indices, p.indexCount), 1));
        g.boundingBox = bounds[i].clone();
        g.computeBoundingSphere();
        const pick = new T.Mesh(g);
        pick.matrixAutoUpdate = false;
        pickers[i] = pick;
        geometries.push(g);
        g.setAttribute(
          "partIndex",
          new T.BufferAttribute(new Float32Array(p.vertexCount).fill(i), 1),
        );
        const list = groups.get(p.system) ?? [];
        list.push({ geometry: g, part: i });
        groups.set(p.system, list);
      });
      groups.forEach((gs, system) => {
        const geometry = mergeGeometries(
          gs.map((entry) => entry.geometry),
          false,
        );
        if (!geometry) throw new Error("Could not assemble anatomy geometry.");
        geometries.push(geometry);
        const mesh = new T.Mesh(geometry, mats.get(system as never));
        mesh.frustumCulled = false;
        // Start hidden until the current state is applied, including when a
        // user switches systems while chunks are still arriving.
        mesh.visible = false;
        const index = geometry.getIndex()!;
        const source = new Uint32Array(index.array);
        const drawIndex = new T.BufferAttribute(new Uint32Array(source.length), 1);
        drawIndex.setUsage(T.DynamicDrawUsage);
        geometry.setIndex(drawIndex);
        geometry.setDrawRange(0, 0);
        let start = 0;
        const spans = gs.map((entry) => {
          const count = atlas.parts[entry.part].indexCount;
          const span = { part: entry.part, start, count, visible: 0 };
          start += count;
          return span;
        });
        batches.push({ mesh, source, index: drawIndex, spans });
        scene.add(mesh);
      });
      lastState = null;
      loaded++;
      onProgress(Math.round((loaded / atlas.chunks.length) * 100));
      dirty = true;
      requestFrame();
    };
    (async () => {
      try {
        let cursor = 0;
        await Promise.all(
          Array.from({ length: 3 }, async () => {
            while (cursor < atlas.chunks.length) {
              const i = cursor++;
              await loadChunk(i);
            }
          }),
        );
        if (!disposed) {
          ready = true;
          dirty = true;
          requestFrame();
        }
      } catch (e) {
        if (!disposed) onError(e instanceof Error ? e.message : "Could not load the anatomy.");
      }
    })();
    const viewDirection = (view: string) =>
      (view === "front"
        ? new T.Vector3(0, 0.02, 1)
        : view === "back"
          ? new T.Vector3(0, 0.02, -1)
          : view === "side"
            ? new T.Vector3(1, 0.02, 0)
            : new T.Vector3(0.35, 0.06, 1)
      ).normalize();
    const fit = (view: string, extent = 0, transitionTime?: number) => {
      controls.maxDistance = 40;
      const mobile = el.clientWidth < 768;
      const normalDistance = mobile
        ? Math.max(
            4.5,
            (1.8 * el.clientHeight) /
              Math.max(160, el.clientHeight - 350) /
              (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2))),
          )
        : 4;
      const reservedHeight = mobile ? 350 : 270;
      const availableAspect = Math.max(
        0.35,
        (el.clientWidth - (mobile ? 40 : 340)) / Math.max(160, el.clientHeight - reservedHeight),
      );
      const atlasDistance =
        (Math.max(packingHeight, packingWidth / availableAspect) /
          (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)))) *
        (el.clientHeight / Math.max(160, el.clientHeight - reservedHeight)) *
        1.08;
      const distance = T.MathUtils.lerp(normalDistance, Math.max(0.2, atlasDistance), extent);
      if (extent > 0.8) view = "front";
      const direction = viewDirection(view);
      const center = new T.Vector3(
        extent > 0.1 && !mobile ? -packingWidth * 0.12 : 0,
        extent > 0.1 || mobile ? 0.85 : 0.68,
        0,
      );
      const destination = center.clone().addScaledVector(direction, distance);
      controls.autoRotate = false;
      controls.enableDamping = false;
      controls.update();
      if (transitionTime !== undefined && !reducedMotion.matches) {
        cameraTransition = {
          start: transitionTime,
          position: camera.position.clone(),
          target: controls.target.clone(),
          destination,
          center,
          offset: new T.Vector2(
            camera.view?.enabled ? camera.view.offsetX : 0,
            camera.view?.enabled ? camera.view.offsetY : 0,
          ),
          destinationOffset: new T.Vector2(),
          orbit: true,
        };
        dirty = true;
        return;
      }
      cameraTransition = null;
      camera.clearViewOffset();
      controls.target.copy(center);
      camera.position.copy(destination);
      controls.update();
      dirty = true;
    };
    const resize = () => {
      layoutKey = "";
      lastSelectionFrame = "";
      lastState = null;
      renderer.setPixelRatio(
        Math.min(devicePixelRatio, el.clientWidth < 768 || el.clientHeight < 600 ? 1.5 : 2),
      );
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      fit(latest.current.view, amount);
      requestFrame();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const raycaster = new T.Raycaster(),
      pointer = new T.Vector2(),
      tap = new PointerTap(),
      worldBox = new T.Box3(),
      hitPoint = new T.Vector3();
    const isolationBounds = new T.Box3();
    const down = (e: PointerEvent) => {
      hover.hidden = true;
      tap.down(e.pointerId, e.clientX, e.clientY, e.pointerType === "touch" ? 12 : 5);
    };
    const move = (e: PointerEvent) => {
      tap.move(e.pointerId, e.clientX, e.clientY);
      if (e.buttons || amount < 0.5 || e.pointerType === "touch") {
        hover.hidden = true;
        return;
      }
      const rect = el.getBoundingClientRect(),
        x = e.clientX - rect.left,
        y = e.clientY - rect.top,
        index = findTarget(x, y, 12);
      hover.hidden = index < 0;
      renderer.domElement.style.cursor = index < 0 ? "grab" : "pointer";
      if (index >= 0) {
        hover.textContent = atlas.parts[index].name;
        hover.style.left = `${Math.max(8, Math.min(x + 14, el.clientWidth - 260))}px`;
        hover.style.top = `${Math.max(8, Math.min(y + 18, el.clientHeight - 55))}px`;
      }
    };
    const cancel = (e: PointerEvent) => tap.cancel(e.pointerId);
    const up = (e: PointerEvent) => {
      const validTap = tap.up(e.pointerId, e.clientX, e.clientY);
      if (!validTap || !ready) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      let nearest = Infinity,
        found = -1;
      activeParts.forEach((i) => {
        const mesh = pickers[i];
        if (
          !mesh ||
          data[i * 4 + 3] < 0.5 ||
          (hasSolidParts && atlas.parts[i].system === "integumentary")
        )
          return;
        worldBox.copy(bounds[i]).translate(mesh.position);
        if (!raycaster.ray.intersectBox(worldBox, hitPoint)) return;
        const hits = raycaster.intersectObject(mesh, false);
        if (hits[0] && hits[0].distance < nearest) {
          nearest = hits[0].distance;
          found = i;
        }
      });
      if (found < 0 && amount > 0.45)
        found = findTarget(
          e.clientX - rect.left,
          e.clientY - rect.top,
          e.pointerType === "touch" ? 24 : 16,
        );
      if (found >= 0) {
        hover.hidden = true;
        select.current(atlas.parts[found].id);
      }
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", cancel);
    const wheel = createCursorZoom({
      camera,
      controls,
      canvas: renderer.domElement,
      atlas,
      pickers,
      bounds,
      renderedVisibility: data,
      state: () => latest.current,
      ready: () => ready,
      onZoom: () => {
        cameraTransition = null;
        hover.hidden = true;
        dirty = true;
        requestFrame();
      },
    });
    renderer.domElement.addEventListener("wheel", wheel, { passive: false, capture: true });
    let lastExtent = -1;
    animate = (time) => {
      if (disposed) return;
      const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 1 / 60,
        s = latest.current;
      lastTime = time;
      const changed =
        lastState?.visible !== s.visible ||
        lastState?.selected !== s.selected ||
        lastState?.isolate !== s.isolate ||
        lastState?.partVisibility !== s.partVisibility;
      if (changed) {
        if (s.isolate && !lastState?.isolate) {
          surroundingView = {
            position: camera.position.clone(),
            target: controls.target.clone(),
            aspect: camera.aspect,
          };
        }
        cameraTransition = null;
      }
      const moving = Math.abs(amount - s.explode) > 0.0001;
      if (moving) {
        amount = T.MathUtils.damp(amount, s.explode, 8, dt);
        if (Math.abs(amount - s.explode) <= 0.0001) amount = s.explode;
        dirty = true;
      }
      if (changed) {
        selectedKey = s.selected.join(",");
        const visible = new Set(s.visible),
          selection = new Set(s.selected);
        activeParts = [];
        selectedIndices = [];
        hasSolidParts = false;
        atlas.parts.forEach((p, i) => {
          const selected = selection.has(p.id);
          if (selected) selectedIndices.push(i);
          const shown = partIsVisible(p, s, { visible, selected: selection });
          partVisibility[i] = shown ? 1 : 0;
          data[i * 4 + 3] = shown ? 1 : 0;
          selectedData[i * 4] = selected ? 255 : 0;
          if (shown) {
            activeParts.push(i);
            if (p.system !== "integumentary") hasSolidParts = true;
          }
        });
        const visibleParts = atlas.parts.filter((p) =>
          partIsVisible(p, s, { visible, selected: selection }),
        );
        const nextLayoutKey =
          visibleParts.map((p) => p.id).join(",") + ":" + camera.aspect.toFixed(3);
        if (nextLayoutKey !== layoutKey) {
          const layout = createExplosionLayout(visibleParts, camera.aspect);
          packingWidth = layout.width;
          packingHeight = layout.height;
          atlas.parts.forEach((p, i) => {
            const cell = layout.cells.get(p.id);
            offsets[i] = cell ? new T.Vector3(cell.x, cell.y + 0.85, 0) : centers[i].clone();
          });
          layoutKey = nextLayoutKey;
          if (amount > 0.05 && !s.isolate) fit(s.view, Math.max(0, (amount - 0.3) / 0.7));
        }
        updateDrawBatches(batches, partVisibility);
        selectionTexture.needsUpdate = true;
      }

      if (changed || moving || lastExtent < 0) {
        let markerCount = 0;
        activeParts.forEach((i) => {
          const c = centers[i],
            destination = offsets[i];
          let dx = 0,
            dy = 0,
            dz = 0;
          if (amount <= 0.45) {
            const t = amount / 0.45;
            dx = spread[i].x * t;
            dy = (c.y - 0.85) * t * 0.28;
            dz = spread[i].z * t;
          } else {
            const t = (amount - 0.45) / 0.55;
            dx = T.MathUtils.lerp(spread[i].x, destination.x - c.x, t);
            dy = T.MathUtils.lerp((c.y - 0.85) * 0.28, destination.y - c.y, t);
            dz = T.MathUtils.lerp(spread[i].z, -c.z, t);
          }
          data[i * 4] = dx;
          data[i * 4 + 1] = dy;
          data[i * 4 + 2] = dz;
          markerPositions[markerCount * 3] = c.x + dx;
          markerPositions[markerCount * 3 + 1] = c.y + dy;
          markerPositions[markerCount * 3 + 2] = c.z + dz;
          markerCount++;
          const mesh = pickers[i];
          if (mesh) {
            mesh.position.set(dx, dy, dz);
            mesh.updateMatrix();
            mesh.updateMatrixWorld(true);
          }
        });
        // Visibility and selection buffers stay cached throughout the animation.
        markerGeometry.setDrawRange(0, markerCount);
        partTexture.needsUpdate = true;
        markerGeometry.attributes.position.needsUpdate = true;
        lastState = s;
        lastExtent = amount;
        dirty = true;
      }
      const viewRequested = lastView !== "" && (s.view !== lastView || s.reset !== lastReset);
      if (s.view !== lastView || s.reset !== lastReset) {
        if (!s.isolate || !s.selected.length)
          fit(s.view, amount, viewRequested && !moving ? time : undefined);
        lastView = s.view;
        lastReset = s.reset;
      }
      if (moving && !s.isolate)
        fit(amount > 0.5 ? "front" : s.view, Math.max(0, (amount - 0.3) / 0.7));
      const selectionFrameKey =
        s.selected.length && (s.isolate || s.focus)
          ? [
              selectedKey,
              s.isolate,
              s.view,
              s.focus,
              s.focusContext,
              s.reset,
              s.inspectorOpen,
              camera.aspect,
            ].join(":")
          : "";
      if (selectionFrameKey !== lastSelectionFrame || (selectionFrameKey && moving)) {
        if (selectionFrameKey) {
          const box = isolationBounds.makeEmpty();
          selectedIndices.forEach((i) => {
            box.union(
              worldBox
                .copy(bounds[i])
                .translate(hitPoint.set(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])),
            );
          });
          if (!box.isEmpty()) {
            let center = box.getCenter(new T.Vector3());
            const size = box.getSize(new T.Vector3());
            const w = el.clientWidth,
              h = el.clientHeight;
            const sceneRect = el.getBoundingClientRect();
            const mobile = w < 768,
              landscape = w > h && h <= 600;
            let left = mobile ? 20 : w > 1100 ? 285 : 25,
              right = w - 20,
              top = mobile ? 175 : 110,
              bottom = h - 170;
            if (landscape) {
              const dock = document.querySelector(".bottom-dock")?.getBoundingClientRect();
              if (dock) bottom = dock.top - sceneRect.top - 16;
            }
            if (s.inspectorOpen) {
              const sheet = document.querySelector(".detail-sheet")?.getBoundingClientRect();
              if (
                sheet &&
                sheet.left < sceneRect.right &&
                sheet.right > sceneRect.left &&
                sheet.top < sceneRect.bottom &&
                sheet.bottom > sceneRect.top
              ) {
                if (mobile && !landscape) {
                  top =
                    (document.querySelector(".identity")?.getBoundingClientRect().bottom ?? 94) -
                    sceneRect.top +
                    16;
                  bottom = Math.max(top + 40, sheet.top - sceneRect.top - 16);
                } else {
                  right = Math.max(left + 150, sheet.left - sceneRect.left - 16);
                }
              }
            }
            const availableWidth = Math.max(150, right - left),
              availableHeight = Math.max(40, bottom - top);
            const destinationOffset = new T.Vector2(
              w / 2 - (left + right) / 2,
              h / 2 - (top + bottom) / 2,
            );
            let direction = s.isolate
              ? viewDirection(s.view)
              : camera.position.clone().sub(controls.target).normalize();
            // Fit the bounds in the chosen camera orientation, including their
            // depth, so a long structure also fits when viewed from the side.
            const horizontal = new T.Vector3().crossVectors(camera.up, direction).normalize();
            const vertical = new T.Vector3().crossVectors(direction, horizontal).normalize();
            const projectedSize = (axis: T.Vector3) =>
              Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y + Math.abs(axis.z) * size.z;
            let distance = Math.max(
              0.07,
              (Math.max(
                (projectedSize(vertical) * h) / availableHeight,
                (projectedSize(horizontal) * w) / availableWidth / camera.aspect,
              ) /
                (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)))) *
                (s.isolate ? 1.35 : 1.7) +
                projectedSize(direction) / 2,
            );
            if (s.focusContext && s.focus && !s.isolate) {
              // Restore context instead of zooming back into the isolated organ.
              center = surroundingView?.target.clone() ?? new T.Vector3(0, 0.85, 0);
              direction = surroundingView
                ? surroundingView.position.clone().sub(surroundingView.target).normalize()
                : new T.Vector3(0.35, 0.06, 1).normalize();
              distance = Math.max(
                distance * 2,
                1.6,
                surroundingView
                  ? surroundingView.position.distanceTo(surroundingView.target) *
                      Math.max(1, surroundingView.aspect / camera.aspect)
                  : 3.6,
              );
            }
            controls.maxDistance = Math.max(40, distance * 2);
            const destination = center.clone().addScaledVector(direction, distance);
            const offset = new T.Vector2(
              camera.view?.enabled ? camera.view.offsetX : 0,
              camera.view?.enabled ? camera.view.offsetY : 0,
            );
            const alreadyCentered =
              camera.position.distanceTo(destination) <= distance * 0.001 &&
              controls.target.distanceTo(center) <= distance * 0.001 &&
              offset.distanceTo(destinationOffset) <= 0.5;
            if (
              (s.focus || viewRequested) &&
              !moving &&
              !reducedMotion.matches &&
              !alreadyCentered
            ) {
              // Clear orbit inertia before capturing a new journey. Repeated
              // locate clicks start from the current pose, not the previous origin.
              controls.enableDamping = false;
              controls.autoRotate = false;
              controls.update();
              controls.enableDamping = true;
              cameraTransition = {
                start: time,
                position: camera.position.clone(),
                target: controls.target.clone(),
                destination,
                center,
                offset,
                destinationOffset,
                orbit: viewRequested,
              };
            } else {
              cameraTransition = null;
              controls.autoRotate = false;
              controls.enableDamping = false;
              controls.update();
              camera.setViewOffset(w, h, destinationOffset.x, destinationOffset.y, w, h);
              controls.target.copy(center);
              camera.position.copy(destination);
              controls.update();
            }
            dirty = true;
          }
        } else if (lastSelectionFrame) {
          fit(s.view, amount, viewRequested && !moving ? time : undefined);
        }
        lastSelectionFrame = selectionFrameKey;
      }
      controls.enableRotate = amount < 0.8;
      controls.mouseButtons.LEFT = amount < 0.8 ? T.MOUSE.ROTATE : T.MOUSE.PAN;
      controls.touches.ONE = amount < 0.8 ? T.TOUCH.ROTATE : T.TOUCH.PAN;
      ground.visible =
        platform.visible =
        ring.visible =
        innerRing.visible =
          amount < 0.5 && !s.isolate;
      markers.visible = amount > 0.75;
      const highlightKey = ready && s.focusContext && s.focus && !s.isolate ? selectedKey : "";
      if (highlightKey !== contextHighlightKey) {
        contextHighlight.clear();
        if (highlightKey)
          selectedIndices.forEach((i) => {
            if (!pickers[i]) return;
            // Only occluded surfaces get this overlay; exposed surfaces retain
            // their normal selection shading. Shared geometry stays cached.
            const mesh = new T.Mesh(pickers[i]!.geometry, contextHighlightMaterial);
            mesh.userData.part = i;
            mesh.renderOrder = 20;
            contextHighlight.add(mesh);
          });
        contextHighlightKey = highlightKey;
        dirty = true;
      }
      contextHighlight.children.forEach((mesh) => {
        const i = mesh.userData.part as number;
        mesh.position.set(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      });
      controls.autoRotate = s.rotate && amount < 0.4;
      controls.autoRotateSpeed =
        0.65 *
        T.MathUtils.clamp(s.rotationSpeed ?? 1, 0.1, 10) *
        (s.rotationDirection === "counterclockwise" ? -1 : 1);
      if (cameraTransition) {
        const journey = cameraTransition;
        const progress = reducedMotion.matches
          ? 1
          : T.MathUtils.clamp((time - journey.start) / 650, 0, 1);
        // Smoothstep eases both ends, including the inspector's framing offset.
        const eased = progress * progress * (3 - 2 * progress);
        controls.target.lerpVectors(journey.target, journey.center, eased);
        if (journey.orbit) {
          // Follow the shortest arc around the structure; a straight line from
          // front to back would pass through its center.
          const from = new T.Spherical().setFromVector3(
            journey.position.clone().sub(journey.target),
          );
          const to = new T.Spherical().setFromVector3(
            journey.destination.clone().sub(journey.center),
          );
          const angle = Math.atan2(
            Math.sin(to.theta - from.theta),
            Math.cos(to.theta - from.theta),
          );
          const pose = new T.Spherical(
            T.MathUtils.lerp(from.radius, to.radius, eased),
            T.MathUtils.lerp(from.phi, to.phi, eased),
            from.theta + angle * eased,
          );
          camera.position.setFromSpherical(pose).add(controls.target);
        } else {
          camera.position.lerpVectors(journey.position, journey.destination, eased);
        }
        camera.setViewOffset(
          el.clientWidth,
          el.clientHeight,
          T.MathUtils.lerp(journey.offset.x, journey.destinationOffset.x, eased),
          T.MathUtils.lerp(journey.offset.y, journey.destinationOffset.y, eased),
          el.clientWidth,
          el.clientHeight,
        );
        controls.enableDamping = false;
        controls.autoRotate = false;
        dirty = true;
        if (progress === 1) {
          cameraTransition = null;
        }
      }
      // Time-based orbiting keeps the slider's linear speed consistent across
      // displays and rendering loads rather than depending on frame count.
      controls.update(dt);
      controls.enableDamping = true;
      if (controls.autoRotate) dirty = true;
      if (dirty) {
        renderer.render(scene, camera);
        targetsDirty = true;
        dirty = false;
      }
      if (moving || controls.autoRotate || cameraTransition) requestFrame();
      if (!frames.pending) lastTime = 0;
    };
    refreshTargets = () => {
      targetsDirty = false;
      const screenWidth = el.clientWidth,
        screenHeight = el.clientHeight;
      targets = [];
      if (amount > 0.45) {
        activeParts.forEach((i) => {
          const p = atlas.parts[i];
          if (data[i * 4 + 3] < 0.5 || (hasSolidParts && p.system === "integumentary")) return;
          let left = Infinity,
            right = -Infinity,
            top = Infinity,
            bottom = -Infinity;
          for (let corner = 0; corner < 8; corner++) {
            projected
              .set(
                p.bounds[corner & 1 ? 1 : 0][0] + data[i * 4],
                p.bounds[corner & 2 ? 1 : 0][1] + data[i * 4 + 1],
                p.bounds[corner & 4 ? 1 : 0][2] + data[i * 4 + 2],
              )
              .project(camera);
            const x = ((projected.x + 1) * screenWidth) / 2,
              y = ((1 - projected.y) * screenHeight) / 2;
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
          projected
            .copy(centers[i])
            .add(hitPoint.set(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]))
            .project(camera);
          if (projected.z < -1 || projected.z > 1) return;
          targets.push({
            index: i,
            x: ((projected.x + 1) * screenWidth) / 2,
            y: ((1 - projected.y) * screenHeight) / 2,
            left,
            right,
            top,
            bottom,
          });
        });
      }
    };
    const visibilityChanged = () => {
      lastTime = 0;
      if (document.hidden) {
        frames.pause();
      } else {
        dirty = true;
        requestFrame();
      }
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    requestFrame();
    const contextLost = (e: Event) => {
      e.preventDefault();
      onError("The 3D session was paused by your device. Reload to continue.");
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    return () => {
      disposed = true;
      abort.abort();
      frames.dispose();
      document.removeEventListener("visibilitychange", visibilityChanged);
      wake.current = () => {};
      observer.disconnect();
      renderer.domElement.removeEventListener("wheel", wheel, true);
      controls.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      scene.traverse((o) => {
        if (o instanceof T.Mesh && !geometries.includes(o.geometry)) {
          o.geometry.dispose();
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.filter((m) => !materials.includes(m)).forEach((m) => m.dispose());
        }
      });
      env.dispose();
      partTexture.dispose();
      selectionTexture.dispose();
      markerGeometry.dispose();
      markerMaterial.dispose();
      hover.remove();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [atlas]);
  return <div className="scene" ref={host} />;
}
