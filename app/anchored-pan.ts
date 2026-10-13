import * as T from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// OrbitControls updates during both input events and animation frames. Convert
// each pan into a projection offset so damping, touch and mouse share one path.
// Explicit camera framing can still assign a new target before update().
export function anchorPan(
  controls: OrbitControls,
  camera: T.PerspectiveCamera,
  canvas: Pick<HTMLCanvasElement, "clientWidth" | "clientHeight">,
) {
  const update = controls.update;
  const anchor = new T.Vector3();
  const translation = new T.Vector3();
  const panned = new T.Vector3();
  const centered = new T.Vector3();

  controls.update = (deltaTime) => {
    anchor.copy(controls.target);
    const changed = update.call(controls, deltaTime);
    translation.copy(controls.target).sub(anchor);
    if (translation.lengthSq() === 0) return changed;

    camera.updateMatrixWorld();
    panned.copy(anchor).project(camera);
    camera.position.sub(translation);
    controls.target.copy(anchor);
    camera.updateMatrixWorld();
    centered.copy(anchor).project(camera);

    const view = camera.view?.enabled ? camera.view : undefined;
    const width = view?.width ?? canvas.clientWidth;
    const height = view?.height ?? canvas.clientHeight;
    if (width > 0 && height > 0) {
      const dx = (centered.x - panned.x) * width / 2;
      const dy = (panned.y - centered.y) * height / 2;
      camera.setViewOffset(
        view?.fullWidth ?? width,
        view?.fullHeight ?? height,
        (view?.offsetX ?? 0) + dx,
        (view?.offsetY ?? 0) + dy,
        width,
        height,
      );
      // The world-space camera is stationary during a pan, so OrbitControls'
      // change threshold cannot tell when projection-offset damping has ended.
      if (!changed && Math.max(Math.abs(dx), Math.abs(dy)) > 0.001) {
        controls.dispatchEvent({ type: "change" });
        return true;
      }
    }
    return changed;
  };

  return () => { controls.update = update; };
}
