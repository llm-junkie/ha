import { useEffect, type RefObject } from "react";
import { searchViewportState } from "./search-viewport";

/** Position a card, or its popover anchor, within the visible viewport. */
export function usePanelViewport(
  position: RefObject<HTMLElement | null>,
  open: boolean,
  content: RefObject<HTMLElement | null> = position,
) {
  useEffect(() => {
    const element = position.current;
    const viewport = window.visualViewport;
    if (!open || !element || !viewport) return;
    const orientation = window.matchMedia("(orientation: portrait)");
    let fullHeight = Math.max(window.innerHeight, viewport.height);
    const update = () => {
      fullHeight = Math.max(fullHeight, window.innerHeight, viewport.height);
      const layout = searchViewportState(
        viewport,
        fullHeight,
        document.activeElement instanceof HTMLInputElement &&
          !!content.current?.contains(document.activeElement),
      );
      element.style.setProperty("--search-visible-top", `${layout.offsetTop}px`);
      element.style.setProperty("--search-visible-height", `${layout.height}px`);
      element.toggleAttribute("data-keyboard-open", layout.keyboardOpen);
    };
    const rotated = () => {
      fullHeight = Math.max(window.innerHeight, viewport.height);
      update();
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    orientation.addEventListener("change", rotated);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      orientation.removeEventListener("change", rotated);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      element.style.removeProperty("--search-visible-top");
      element.style.removeProperty("--search-visible-height");
      element.removeAttribute("data-keyboard-open");
    };
  }, [position, open, content]);
}
