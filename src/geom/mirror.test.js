import test from "node:test";
import assert from "node:assert/strict";
import { reflectCircle, reflectPoint, syncTwins, setMirror, syncDoc, paintMirrored, dropLinks } from "./mirror.js";
import { arrange } from "./arrange.js";
import { sanitize } from "./doc.js";

const V = { axis: "v", x: 100, y: 0 };
const B = { axis: "both", x: 0, y: 0 };

test("reflect point and circle; twice is identity", () => {
  assert.deepEqual(reflectPoint({ x: 70, y: 5 }, V), { x: 130, y: 5 });
  const c = { id: "a", cx: 70, cy: 5, r: 9 };
  assert.deepEqual(reflectCircle(reflectCircle(c, V, "v"), V, "v"), c);
});

test("off-axis circle gets one exact twin; on-axis none", () => {
  const out = syncTwins([{ id: "a", cx: 60.123, cy: 1, r: 10 }, { id: "b", cx: 100, cy: 4, r: 5 }], V);
  assert.equal(out.length, 3);
  const t = out.find((c) => c.mirrorOf === "a");
  assert.equal(t.cx, 2 * 100 - 60.123);
  assert.ok(!out.some((c) => c.mirrorOf === "b"));
});

test("both axes: 3 twins; on one axis: 1; at centre: 0", () => {
  assert.equal(syncTwins([{ id: "a", cx: 10, cy: 20, r: 3 }], B).length, 4);
  assert.equal(syncTwins([{ id: "a", cx: 0, cy: 20, r: 3 }], B).length, 2);
  assert.equal(syncTwins([{ id: "a", cx: 0, cy: 0, r: 3 }], B).length, 1);
});

test("sync is idempotent; moving the original moves the twin", () => {
  const s1 = syncTwins([{ id: "a", cx: 60, cy: 1, r: 10 }], V);
  assert.deepEqual(syncTwins(s1, V, s1), s1);
  const s2 = syncTwins(s1.map((c) => (c.id === "a" ? { ...c, cx: 50 } : c)), V, s1);
  assert.equal(s2.find((c) => c.mirrorOf).cx, 150);
});

test("moving a twin moves the original (twin of a twin is itself)", () => {
  const s1 = syncTwins([{ id: "a", cx: 60, cy: 1, r: 10 }], V);
  const s2 = syncTwins(s1.map((c) => (c.mirrorOf ? { ...c, cx: 170, r: 12 } : c)), V, s1);
  const a = s2.find((c) => c.id === "a"), t = s2.find((c) => c.mirrorOf);
  assert.equal(a.cx, 30); assert.equal(a.r, 12); assert.equal(t.cx, 170);
  assert.equal(s2.length, 2);
});

test("deleting either side deletes both", () => {
  const s1 = syncTwins([{ id: "a", cx: 60, cy: 1, r: 10 }], V);
  assert.equal(syncTwins(s1.filter((c) => c.id !== "a"), V, s1).length, 0);
  assert.equal(syncTwins(s1.filter((c) => !c.mirrorOf), V, s1).length, 0);
});

test("dragging onto the axis drops the twin", () => {
  const s1 = syncTwins([{ id: "a", cx: 60, cy: 1, r: 10 }], V);
  const s2 = syncTwins(s1.map((c) => (c.id === "a" ? { ...c, cx: 100 } : c)), V, s1);
  assert.equal(s2.length, 1);
});

test("toggle off keeps circles, drops links; toggle on twins existing", () => {
  const on = setMirror({ id: "l", circles: [{ id: "a", cx: 60, cy: 1, r: 10 }], fills: [] }, V);
  assert.equal(on.circles.length, 2);
  const off = setMirror(on, null);
  assert.equal(off.circles.length, 2);
  assert.ok(!off.mirror && off.circles.every((c) => !c.mirrorOf && !c.mirrorAx));
  assert.deepEqual(dropLinks(on.circles), off.circles);
});

test("syncDoc only touches changed mirrored layers", () => {
  const l = { id: "l", name: "x", visible: true, locked: false, circles: [], fills: [], mirror: V };
  const d0 = { layers: [l] };
  const d1 = { layers: [{ ...l, circles: [{ id: "a", cx: 1, cy: 1, r: 4 }] }] };
  assert.equal(syncDoc(d1, d1).layers, d1.layers);
  assert.equal(syncDoc(d1, d0).layers[0].circles.length, 2);
});

test("ink mirrors: stroke in the left face also inks the right face", () => {
  const circles = syncTwins([{ id: "a", cx: 60, cy: 0, r: 20 }], V);
  const arr = arrange(circles);
  const r = paintMirrored(arr, [], [{ x: 60, y: 0 }], "#ff0000", false, V);
  assert.equal(r.fills.length, 2);
  assert.ok(r.fills.some((f) => f.x === 140));
  assert.equal(paintMirrored(arr, r.fills, [{ x: 140, y: 0 }], "#ff0000", false, V).fills.length, 0);
});

test("sanitize keeps valid mirror + links, drops bad ones", () => {
  const l = setMirror({ id: "l1", name: "n", visible: true, locked: false, circles: [{ id: "a", cx: 60, cy: 1, r: 10 }], fills: [] }, V);
  const d = sanitize({ layers: [l] });
  assert.deepEqual(d.layers[0].mirror, V);
  assert.equal(d.layers[0].circles[1].mirrorOf, "a");
  const bad = sanitize({ layers: [{ ...l, mirror: { axis: "z", x: 1, y: 1 }, circles: [...l.circles, { id: "q", cx: 1, cy: 1, r: 2, mirrorOf: "nope", mirrorAx: "v" }, { id: "w", cx: 1, cy: 1, r: 2, mirrorOf: "a", mirrorAx: "bad" }] }] });
  assert.ok(!("mirror" in bad.layers[0]));
  assert.ok(bad.layers[0].circles.every((c) => !c.mirrorOf));
  assert.equal(sanitize({ layers: [{ ...l, mirror: { axis: "h", x: NaN, y: 3 } }] }).layers[0].mirror.x, 0);
});
