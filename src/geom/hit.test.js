import test from "node:test";
import assert from "node:assert/strict";
import { hitTest, resizeCursor } from "./hit.js";

const A = { id: "a", cx: 0, cy: 0, r: 100 };
const B = { id: "b", cx: 0, cy: 0, r: 40 };
const none = new Set();

test("centre handle beats rim and body", () => {
  assert.equal(hitTest({ x: 5, y: 0 }, [A], 1, new Set(["a"])).part, "centre");
  assert.equal(hitTest({ x: 11, y: 0 }, [A], 1, none).part, "centre");
  assert.equal(hitTest({ x: 13, y: 0 }, [A], 1, none), null);
});
test("tolerances are screen px: zoom shrinks the world zone", () => {
  assert.equal(hitTest({ x: 5, y: 0 }, [A], 4, none), null); // 20px away
  assert.equal(hitTest({ x: 2, y: 0 }, [A], 4, none).part, "centre");
});
test("rim within 8px, nearest rim wins, angle reported", () => {
  const h = hitTest({ x: 0, y: 107 }, [A], 1, none);
  assert.equal(h.part, "rim");
  assert.ok(Math.abs(h.angle - Math.PI / 2) < 1e-9);
  assert.equal(hitTest({ x: 0, y: 109 }, [A], 1, none), null);
  assert.equal(hitTest({ x: 0, y: 38 }, [A, B], 1, none).c.id, "b");
});
test("rim beats interior of a selected circle", () => {
  assert.equal(hitTest({ x: 95, y: 0 }, [A], 1, new Set(["a"])).part, "rim");
});
test("interior moves only when selected; else draws", () => {
  assert.equal(hitTest({ x: 50, y: 0 }, [A], 1, none), null);
  const h = hitTest({ x: 60, y: 0 }, [A], 1, new Set(["a"]));
  assert.deepEqual([h.part, h.c.id], ["body", "a"]);
});
test("nested selected circles: smallest containing wins", () => {
  assert.equal(hitTest({ x: 20, y: 20 }, [A, B], 1, new Set(["a", "b"])).c.id, "b");
});
test("tiny circle keeps a rim", () => {
  const s = { id: "s", cx: 0, cy: 0, r: 10 };
  assert.equal(hitTest({ x: 10, y: 0 }, [s], 1, none).part, "rim");
});
test("resize cursors", () => {
  assert.equal(resizeCursor(0), "ew-resize");
  assert.equal(resizeCursor(Math.PI), "ew-resize");
  assert.equal(resizeCursor(Math.PI / 2), "ns-resize");
  assert.equal(resizeCursor(Math.PI / 4), "nwse-resize");
  assert.equal(resizeCursor(-Math.PI / 4), "nesw-resize");
});
