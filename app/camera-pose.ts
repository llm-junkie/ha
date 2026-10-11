import * as T from "three";
import type { CameraPose } from "./anatomy.ts";

export function captureCameraPose(
  camera: T.PerspectiveCamera,
  target: T.Vector3,
  width: number,
  height: number,
): CameraPose {
  return {
    position: camera.position.toArray() as CameraPose["position"],
    target: target.toArray() as CameraPose["target"],
    offset: camera.view?.enabled
      ? [camera.view.offsetX / width, camera.view.offsetY / height]
      : [0, 0],
    viewport: [width, height],
  };
}

export function restoreCameraPose(
  camera: T.PerspectiveCamera,
  target: T.Vector3,
  pose: CameraPose,
  width: number,
  height: number,
) {
  target.fromArray(pose.target);
  camera.position.fromArray(pose.position);
  // A narrower screen needs more distance to keep the shared anatomy in view.
  if (pose.viewport) {
    const scale = Math.max(1, pose.viewport[0] / pose.viewport[1] / (width / height));
    const direction = camera.position.clone().sub(target);
    direction.setLength(Math.min(100, direction.length() * scale));
    camera.position.copy(target).add(direction);
  }
  camera.setViewOffset(
    width,
    height,
    pose.offset[0] * width,
    pose.offset[1] * height,
    width,
    height,
  );
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
