import assert from 'node:assert/strict';
import test from 'node:test';
import { searchViewportState } from '../app/search-viewport.ts';

test('a keyboard-only viewport resize uses the remaining height and Safari viewport pan', () => {
  const visible = searchViewportState({ height: 460, offsetTop: 42, scale: 1 }, 844, true);
  assert.deepEqual(visible, { height: 460, offsetTop: 42, keyboardOpen: true });
});

test('a keyboard that also resizes the page is detected from the height before focus', () => {
  assert.equal(searchViewportState({ height: 340, offsetTop: 0, scale: 1 }, 568, true).keyboardOpen, true);
});

test('closing the keyboard restores normal placement even if the input remains focused', () => {
  assert.equal(searchViewportState({ height: 844, offsetTop: 0, scale: 1 }, 844, true).keyboardOpen, false);
});

test('pinch zoom, browser toolbar changes, and unfocused inputs do not open keyboard layout', () => {
  assert.equal(searchViewportState({ height: 422, offsetTop: 100, scale: 2 }, 844, true).keyboardOpen, false);
  assert.equal(searchViewportState({ height: 790, offsetTop: 0, scale: 1 }, 844, true).keyboardOpen, false);
  assert.equal(searchViewportState({ height: 460, offsetTop: 0, scale: 1 }, 844, false).keyboardOpen, false);
});
