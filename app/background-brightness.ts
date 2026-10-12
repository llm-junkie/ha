import { Color, MathUtils } from "three";

export function snapBackgroundBrightness(value: number, snap = true) {
  const bounded = MathUtils.clamp(value, -100, 100);
  return snap && Math.abs(bounded) <= 6 ? 0 : bounded;
}

export function backgroundColor(base: string, brightness: number) {
  // Scale linear light so the brighter end retains the gray's color and detail.
  return `#${new Color(base).multiplyScalar(1 + MathUtils.clamp(brightness, -100, 100) / 100).getHexString()}`;
}

export function backgroundForeground(background: string) {
  const color = new Color(background);
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return luminance > Math.sqrt(0.05 * 1.05) - 0.05 ? "#000000" : "#ffffff";
}
