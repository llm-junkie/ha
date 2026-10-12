import test from "node:test";
import assert from "node:assert/strict";
import { backgroundColor, backgroundForeground, snapBackgroundBrightness } from "../app/background-brightness.ts";

const luminance = (hex) => {
  const channels = hex.match(/[a-f\d]{2}/gi).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

test("the full brightness range keeps floating text readable and retains the default midpoint", () => {
  const base = "#b5c0c4";
  assert.equal(backgroundColor(base, 0), base);
  assert.equal(backgroundColor(base, -100), "#000000");
  assert.equal(backgroundColor(base, -200), backgroundColor(base, -100));
  assert.equal(backgroundColor(base, 200), backgroundColor(base, 100));
  let previous = -1;
  for (let value = -100; value <= 100; value++) {
    const background = backgroundColor(base, value);
    const surface = luminance(background), text = luminance(backgroundForeground(background));
    assert(surface >= previous, `brightness must increase at ${value}`);
    assert((Math.max(surface, text) + 0.05) / (Math.min(surface, text) + 0.05) >= 4.5,
      `text contrast must remain readable at ${value}`);
    previous = surface;
  }
});

test("the center magnet restores the default without trapping keyboard adjustment", () => {
  for (const value of [-6, -2, 0, 2, 6]) assert.equal(snapBackgroundBrightness(value), 0);
  assert.equal(snapBackgroundBrightness(-7), -7);
  assert.equal(snapBackgroundBrightness(7), 7);
  assert.equal(snapBackgroundBrightness(1, false), 1);
  assert.equal(snapBackgroundBrightness(-1, false), -1);
  assert.equal(snapBackgroundBrightness(-200), -100);
  assert.equal(snapBackgroundBrightness(200), 100);
});
