import * as T from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface WheelZoomOptions {
  camera: T.PerspectiveCamera;
  controls: Pick<
    OrbitControls,
    "enabled" | "enableZoom" | "zoomSpeed" | "minDistance" | "maxDistance" | "target"
  >;
  canvas: Pick<HTMLCanvasElement, "getBoundingClientRect">;
  ready: () => boolean;
  onZoom: () => void;
}

// Capture replaces OrbitControls' wheel handler; touch and pinch remain intact.
// Keep the orbit pivot fixed so off-center scrolling cannot pan the model.
export function createWheelZoom({
  camera,
  controls,
  canvas,
  ready,
  onZoom,
}: WheelZoomOptions) {
  const offset = new T.Vector3();
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
    offset.copy(camera.position).sub(controls.target).multiplyScalar(factor);
    camera.position.copy(controls.target).add(offset);
    camera.updateMatrixWorld();
    onZoom();
  };
}
