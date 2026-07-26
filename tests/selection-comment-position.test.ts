import test from "node:test";
import assert from "node:assert/strict";
import {
  getSelectionAnchorRect,
  positionSelectionCommentButton,
  type SelectionRectangle,
} from "../src/selection-comment-position";

function rectangle(left: number, top: number, width: number, height: number): SelectionRectangle {
  return { left, right: left + width, top, bottom: top + height, width, height };
}

const viewport = rectangle(0, 0, 1200, 800);
const editor = rectangle(200, 80, 800, 640);

test("selection comment button is positioned at the right side of visible text", () => {
  assert.deepEqual(
    positionSelectionCommentButton(rectangle(420, 300, 160, 20), editor, viewport),
    { left: 587, top: 295 },
  );
});

test("selection comment button stays hidden when a stale selection scrolls above the editor", () => {
  assert.equal(positionSelectionCommentButton(rectangle(420, -40, 160, 20), editor, viewport), null);
});

test("selection comment button stays hidden when a stale selection scrolls below the editor", () => {
  assert.equal(positionSelectionCommentButton(rectangle(420, 760, 160, 20), editor, viewport), null);
});

test("selection comment button remains inside the editor near the right edge", () => {
  assert.deepEqual(
    positionSelectionCommentButton(rectangle(970, 300, 24, 20), editor, viewport),
    { left: 966, top: 295 },
  );
});

test("multi-line selections use the final non-empty text rectangle", () => {
  assert.deepEqual(getSelectionAnchorRect([
    rectangle(300, 240, 400, 20),
    rectangle(300, 264, 180, 20),
    rectangle(0, 0, 0, 0),
  ]), rectangle(300, 264, 180, 20));
});
