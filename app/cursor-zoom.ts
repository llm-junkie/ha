import * as T from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Atlas, SceneState } from "./anatomy.ts";
import { partIsVisible } from "./part-visibility.ts";

interface CursorZoomOptions {
  camera: T.PerspectiveCamera;
  controls: Pick<
    OrbitControls,
    "enabled" | "enableZoom" | "zoomSpeed" | "minDistance" | "maxDistance" | "target"
  >;
  canvas: Pick<HTMLCanvasElement, "getBoundingClientRect">;
  atlas: Pick<Atlas, "parts">;
  pickers: (T.Mesh | undefined)[];
  bounds: T.Box3[];
  renderedVisibility: Float32Array;
  state: () => SceneState;
  ready: () => boolean;
  onZoom: () => void;
}

// Capture replaces OrbitControls' wheel handler; touch and pinch remain intact.
// A real visible surface anchors the zoom, with the target plane as a fallback.
export function createCursorZoom({
  camera,
  controls,
  canvas,
  atlas,
  pickers,
  bounds,
  renderedVisibility,
  state,
  ready,
  onZoom,
}: CursorZoomOptions) {
  const plane = new T.Plane(),
    direction = new T.Vector3(),
    anchor = new T.Vector3(),
    projection = new T.Vector3();
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2(),
    worldBox = new T.Box3(),
    hitPoint = new T.Vector3();
  return (event: WheelEvent) => {
    if (!controls.enabled || !controls.enableZoom) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (
      !ready() ||
      !Number.isFinite(event.deltaY) ||
      event.deltaY === 0 ||
      !Number.isFinite(event.clientX) ||
      !Number.isFinite(event.clientY)
    )
      return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
    const delta = T.MathUtils.clamp(event.deltaY * unit * (event.ctrlKey ? 2.5 : 1), -300, 300);
    const distance = camera.position.distanceTo(controls.target);
    if (!Number.isFinite(distance) || distance <= 0) return;
    const nextDistance = T.MathUtils.clamp(
      distance * Math.exp(delta * 0.0018 * controls.zoomSpeed),
      controls.minDistance,
      controls.maxDistance,
    );
    const factor = nextDistance / distance;
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < 1e-10) return;
    camera.updateMatrixWorld();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const current = state(),
      lookups = { visible: new Set(current.visible), selected: new Set(current.selected) };
    const visible = atlas.parts.map(
      (part, index) =>
        !!pickers[index] &&
        renderedVisibility[index * 4 + 3] > 0.5 &&
        partIsVisible(part, current, lookups),
    );
    const hasSolid = atlas.parts.some(
      (part, index) => visible[index] && part.system !== "integumentary",
    );
    let nearest = Infinity,
      found = false;
    pickers.forEach((mesh, index) => {
      if (!mesh || !visible[index] || (hasSolid && atlas.parts[index].system === "integumentary"))
        return;
      worldBox.copy(bounds[index]).translate(mesh.position);
      if (!raycaster.ray.intersectBox(worldBox, hitPoint)) return;
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (!hit || hit.distance >= nearest) return;
      projection.copy(hit.point).project(camera);
      if (projection.z < -1 || projection.z > 1) return;
      nearest = hit.distance;
      anchor.copy(hit.point);
      found = true;
    });
    if (!found) {
      camera.getWorldDirection(direction);
      plane.setFromNormalAndCoplanarPoint(direction, controls.target);
      if (!raycaster.ray.intersectPlane(plane, anchor)) return;
    }
    camera.position.sub(anchor).multiplyScalar(factor).add(anchor);
    controls.target.sub(anchor).multiplyScalar(factor).add(anchor);
    camera.updateMatrixWorld();
    onZoom();
  };
}
