import test from "node:test";
import assert from "node:assert/strict";
import { arrange, resolveFills } from "./arrange.js";
import { samplePath, stroke, paintStroke } from "./paint.js";

const venn = arrange([{ id: "a", cx: -50, cy: 0, r: 80 }, { id: "b", cx: 50, cy: 0, r: 80 }, { id: "c", cx: 0, cy: -90, r: 80 }]);
const row = [{ x: -130, y: 0 }, { x: 130, y: 0 }];

test("samplePath leaves no gap longer than step", () => {
  const s = samplePath(row, 2);
  for (let i = 1; i < s.length; i++) assert.ok(Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y) <= 2.0001);
});
test("a fast two-point drag still crosses every face on the line", () => {
  assert.ok(stroke(venn, row).size >= 3);
});
test("paint then same-start stroke erases", () => {
  const p = paintStroke(venn, [], row, "#ff0000");
  assert.equal(p.action, "paint");
  assert.equal(resolveFills(venn, p.fills).size, p.count);
  const e = paintStroke(venn, p.fills, row, "#ff0000");
  assert.equal(e.action, "erase");
  assert.equal(e.fills.length, 0);
});
test("different ink repaints; shift always erases; empty path no-op", () => {
  const p = paintStroke(venn, [], row, "#ff0000");
  const r = paintStroke(venn, p.fills, row, "#00ff00");
  assert.equal(r.action, "paint");
  assert.ok(r.fills.every((f) => f.color === "#00ff00"));
  assert.equal(paintStroke(venn, p.fills, row, "#00ff00", true).fills.length, 0);
  const none = paintStroke(venn, p.fills, [{ x: 900, y: 900 }], "#fff");
  assert.equal(none.fills, p.fills);
});
