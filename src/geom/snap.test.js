import { test } from "node:test";
import assert from "node:assert/strict";
import { snapCircle, snapPoint, slivers, PHI } from "./snap.js";
import { arrange } from "./arrange.js";

const C = (id, cx, cy, r) => ({ id, cx, cy, r });
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const kinds = (res) => res.hits.map((h) => h.kind);
const only = (...on) => Object.fromEntries(["phi", "tangent", "concentric", "vertex", "centre", "align", "sliver"].map((k) => [k, on.includes(k)]));
const A = C("a", 0, 0, 50);

test("phi: radius snaps to base·φ^k with a labelled ghost circle", () => {
  const res = snapCircle({ cx: 1000, cy: 300, r: 106 }, [A], { mode: "resize", tol: 3, base: 40, kinds: only("phi") });
  near(res.circle.r, 40 * PHI ** 2);
  const h = res.hits.find((x) => x.kind === "phi");
  assert.equal(h.label, "φ²");
  assert.equal(h.guide.type, "circle");
  near(h.guide.r, 40 * PHI ** 2);
});

test("phi: radius in golden ratio to a neighbour", () => {
  const res = snapCircle({ cx: 1000, cy: 300, r: 81 }, [A], { mode: "resize", tol: 2, kinds: only("phi") }); // 50·φ = 80.9
  near(res.circle.r, 50 * PHI);
  assert.equal(res.hits[0].label, "φ·a");
});

test("tangent: resize external, move external, move internal", () => {
  let res = snapCircle({ cx: 120, cy: 13, r: 69 }, [A], { mode: "resize", tol: 2, kinds: only("tangent") });
  near(res.circle.r, Math.hypot(120, 13) - 50);
  assert.deepEqual(kinds(res), ["tangent"]);
  assert.equal(res.hits[0].guide.type, "point");

  res = snapCircle({ cx: 79.5, cy: 0, r: 30 }, [A], { mode: "move", tol: 2, kinds: only("tangent") });
  near(res.circle.cx, 80);
  assert.equal(res.hits[0].label, "tangent to a");

  res = snapCircle({ cx: 29, cy: 0, r: 20 }, [A], { mode: "move", tol: 2, kinds: only("tangent") });
  near(res.circle.cx, 30); // 50 - 20: internally tangent
});

test("concentric: near-concentric centre jumps onto the other centre", () => {
  const res = snapCircle({ cx: 1.2, cy: -0.8, r: 20 }, [A], { mode: "move", tol: 3, kinds: only("concentric") });
  assert.deepEqual([res.circle.cx, res.circle.cy], [0, 0]);
  assert.deepEqual(kinds(res), ["concentric"]);
  assert.equal(res.hits[0].guide.type, "circle");
});

test("vertex: circle is pulled through an existing intersection (triple point)", () => {
  const cs = [A, C("b", 60, 0, 50)]; // vertices (30, ±40)
  const res = snapCircle({ cx: 40.8, cy: 40, r: 10 }, cs, { mode: "move", tol: 2, kinds: only("vertex") });
  near(Math.hypot(res.circle.cx - 30, res.circle.cy - 40), 10);
  assert.equal(res.hits[0].kind, "vertex");
  assert.deepEqual(res.hits[0].guide, { type: "point", x: 30, y: 40 });
  const arr = arrange([...cs, { id: "c", ...res.circle }]);
  assert.equal(arr.verts.length, 4); // 2 + 2 more, one of them shared at (30,40); a miss would give 6
});

test("centre: snapPoint onto centre, vertex, and by alignment", () => {
  const cs = [A, C("b", 60, 0, 50)];
  let p = snapPoint({ x: 0.8, y: -1 }, cs, { tol: 2, kinds: only("centre") });
  assert.deepEqual([p.x, p.y], [0, 0]);
  p = snapPoint({ x: 31, y: 39 }, cs, { tol: 3, kinds: only("centre") });
  assert.deepEqual([p.x, p.y], [30, 40]);
  assert.ok(p.hits.every((h) => h.kind === "centre"));
  p = snapPoint({ x: 61, y: 23 }, cs, { tol: 2, kinds: only("align") });
  near(p.x, 60); near(p.y, 23);
  assert.equal(p.hits[0].guide.type, "line");
  p = snapPoint({ x: 60.9, y: -0.4 }, cs, { tol: 2, kinds: only("align") }); // h + v alignment pair -> exactly b's centre
  near(p.x, 60); near(p.y, 0);
  p = snapPoint({ x: 0.8, y: -1 }, cs, { tol: 2, kinds: only() });
  assert.deepEqual([p.x, p.y, p.hits.length], [0.8, -1, 0]);
});

test("align: equal radius and edge flush", () => {
  let res = snapCircle({ cx: 300, cy: 300, r: 49.2 }, [A], { mode: "resize", tol: 1, kinds: only("align") });
  near(res.circle.r, 50);
  assert.equal(res.hits[0].label, "radius = a");
  res = snapCircle({ cx: 300, cy: 300, r: 20 }, [C("e", 280, 100, 50)], { mode: "move", tol: 1, kinds: only("align") }); // left edge of e at x=230 -> cx=250 (not near)
  assert.deepEqual([res.circle.cx, res.circle.cy], [300, 300]);
  res = snapCircle({ cx: 250.6, cy: 300, r: 20 }, [C("e", 280, 100, 50)], { mode: "move", tol: 1, kinds: only("align") });
  near(res.circle.cx, 250);
  assert.equal(res.hits[0].label, "left edge = e");
});

test("combination: phi radius + tangent slides the centre along the line to the neighbour", () => {
  const cs = [C("a", 0, 0, 100)];
  const rp = 40 * PHI ** 2; // 104.72
  const res = snapCircle({ cx: 100 + rp + 1.5, cy: 0, r: 105.5 }, cs, { mode: "resize", tol: 2, base: 40, kinds: only("phi", "tangent") });
  near(res.circle.r, rp);
  near(Math.hypot(res.circle.cx, res.circle.cy), 100 + rp);
  assert.ok(kinds(res).includes("phi") && kinds(res).includes("tangent"));
  assert.match(res.label, /φ² · tangent to a/);
});

test("create: centre snaps (concentric) through snapPoint, then the radius", () => {
  const res = snapCircle({ cx: 1, cy: -1.5, r: 40 }, [A], { mode: "create", tol: 3 });
  assert.deepEqual([res.circle.cx, res.circle.cy, res.circle.r], [0, 0, 40]);
  assert.ok(kinds(res).includes("concentric"));
});

test("no sliver after snap: a near-tangent drag ends exactly tangent", () => {
  const drag = { cx: 79.3, cy: 0, r: 30 }; // overlaps 0.7: a lens 0.7 thick
  const lens = (c) => slivers([A, { id: "m", ...c }], { minWidth: 2 });
  assert.equal(lens(drag).length, 1);
  const res = snapCircle({ id: "m", ...drag }, [A, C("m", 0, 0, 1)], { mode: "move", tol: 3 }); // stale self in others is ignored by id
  near(Math.hypot(res.circle.cx, res.circle.cy), 80);
  assert.equal(lens(res.circle).length, 0);
  assert.equal(arrange([A, { id: "m", ...res.circle }]).faces.length, 2);
});

test("sliver pass reaches a little past tol, and only when enabled", () => {
  const drag = { cx: 76.1, cy: 7, r: 30 }; // d = 76.4: overlap 3.6 > tol 3, still a thin lens
  const on = snapCircle(drag, [A], { mode: "move", tol: 3 });
  assert.equal(on.hits[0].kind, "sliver");
  near(Math.hypot(on.circle.cx, on.circle.cy), 80);
  const off = snapCircle(drag, [A], { mode: "move", tol: 3, kinds: { sliver: false } });
  assert.deepEqual(off.circle, drag);
  assert.deepEqual(off.hits, []);
});

test("disabled kinds do not fire", () => {
  const res = snapCircle({ cx: 79.5, cy: 7, r: 30 }, [A], { mode: "move", tol: 3, kinds: { tangent: false } });
  assert.ok(!kinds(res).includes("tangent"));
  assert.ok(!kinds(res).includes("sliver"));
  assert.equal(res.circle.cx, 79.5);
  const r2 = snapCircle({ cx: 1000, cy: 300, r: 106 }, [A], { mode: "resize", tol: 3, base: 40, kinds: { phi: false } });
  assert.ok(!kinds(r2).includes("phi"));
});

test("outside tol: input returned unchanged, no hits", () => {
  const inp = { cx: 90, cy: 13, r: 30 };
  const res = snapCircle(inp, [A], { mode: "move", tol: 3 });
  assert.deepEqual(res.circle, inp);
  assert.deepEqual(res.hits, []);
  const r2 = snapCircle({ cx: 300, cy: 300, r: 20 }, [A], { mode: "resize", tol: 0 });
  assert.deepEqual(r2.circle, { cx: 300, cy: 300, r: 20 });
});

test("slivers(): lens + vertex-triangle found, healthy arrangements and lone small discs are not", () => {
  assert.equal(slivers([A, C("b", 60, 0, 50)], { minArea: 5, minWidth: 2 }).length, 0);
  assert.equal(slivers([C("t", 0, 0, 0.3)], { minArea: 5, minWidth: 2 }).length, 0);
  const s = slivers([A, C("b", 79, 0, 30)], { minWidth: 2 });
  assert.equal(s.length, 1);
  assert.deepEqual([...s[0].ids].sort(), ["a", "b"]);
  assert.ok(s[0].x > 48 && s[0].x < 51);
  // three circles missing a common point by 0.4: a tiny triangle between the arcs
  const tri = slivers([A, C("b", 60, 0, 50), C("c", 40.4, 40, 10)], { minWidth: 1.5, minArea: 3 });
  assert.ok(tri.some((f) => f.ids.length === 3 || f.area < 3));
});
