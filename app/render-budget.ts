// A DPR cap alone still allocates enormous multisampled buffers on 4K/5K
// displays. Bound total scene pixels while leaving CSS and text at native size.
export const MAX_SCENE_PIXELS = 4_000_000;

export function scenePixelRatio(width: number, height: number, deviceRatio: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  const ratio = Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1;
  const limit = width < 768 || height < 600 ? 1.5 : 2;
  return Math.min(ratio, limit, Math.sqrt(MAX_SCENE_PIXELS / width / height));
}
