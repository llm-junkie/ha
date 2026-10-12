/** Keep keyboard layout separate from pinch zoom and the full page height. */
export function searchViewportState(
  viewport: Pick<VisualViewport, "height" | "offsetTop" | "scale">,
  fullHeight: number,
  inputFocused: boolean,
) {
  return {
    height: viewport.height,
    offsetTop: viewport.offsetTop,
    keyboardOpen: inputFocused && viewport.scale <= 1.05 && fullHeight - viewport.height > 120,
  };
}
