import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { SYSTEMS } from "../app/anatomy.ts";
import { selectionHighlightColor } from "../app/anatomy-material.ts";

const hsl = (color) => color.getHSL({ h: 0, s: 0, l: 0 }, T.SRGBColorSpace);
// Three.js uses approximate sRGB conversions; tolerate their small round-trip error.
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-5,
  `expected ${expected}, got ${actual}`);

test("selection doubles saturation and darkens each system by 25% while preserving its hue", () => {
  for (const system of SYSTEMS) {
    const original = new T.Color(system.color);
    const before = original.clone();
    const selected = selectionHighlightColor(original);
    const base = hsl(original);
    const highlight = hsl(selected);
    close(highlight.h, base.h);
    close(highlight.l, base.l * 0.75);
    close(highlight.s, Math.min(1, base.s * 2));
    assert(original.equals(before), `${system.name}: the original material color was mutated`);
    assert(selectionHighlightColor(original).equals(selected), "reselection must not accumulate color changes");
  }
});

test("selection darkens white and gray pieces without adding a tint", () => {
  for (const [original, expected] of [["#000000", "000000"], ["#777777", "595959"], ["#ffffff", "bfbfbf"]]) {
    const result = selectionHighlightColor(new T.Color(original));
    assert.equal(result.getHexString(), expected);
    close(hsl(result).s, 0);
  }
});

test("selection clamps vivid colors without shifting hue", () => {
  for (const hue of [0, 0.15, 0.35, 0.6, 0.85]) {
    const color = new T.Color().setHSL(hue, 0.9, 0.5, T.SRGBColorSpace);
    const result = selectionHighlightColor(color);
    const selected = hsl(result);
    close(selected.s, 1);
    close(selected.h, hue);
    close(selected.l, 0.375);
    assert(result.toArray().every((channel) => channel >= 0 && channel <= 1));
  }
});
