import { test } from "node:test";
import assert from "node:assert/strict";
import { arrange, faceAt, mergeLoops, loopsToPath, inkPaths, resolveFills } from "./arrange.js";
import { exportSVG, sanitize, fitFrame } from "./doc.js";

const C = (id, cx, cy, r) => ({ id, cx, cy, r });
const PHI = (1 + Math.sqrt(5)) / 2;
const onlyArcs = (d) => /^(M[-\d. ]+(A[-\d. ]+)+Z)+$/.test(d);
const subpaths = (d) => (d.match(/M/g) ?? []).length;

// Invariants that hold for any arrangement: each disc's area is exactly the sum of the faces inside it,
// and Euler's formula fixes the bounded face count (V - E + F = 1 + K, F counting the outside).
function invariants(cs) {
  const arr = arrange(cs);
  arr.circles.forEach((c, k) => {
    const sum = arr.faces.filter((f) => f.mask[k] === "1").reduce((s, f) => s + f.area, 0);
    assert.ok(Math.abs(sum - Math.PI * c.r * c.r) < 1e-6 * c.r * c.r, `disc ${c.id}: ${sum} vs ${Math.PI * c.r * c.r}`);
  });
  const parent = arr.verts.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  let loose = 0;
  for (const e of arr.edges) if (e.s === null) loose++; else parent[find(e.s)] = find(e.e);
  const K = new Set(arr.verts.map((_, i) => find(i))).size + loose;
  assert.equal(arr.faces.length, arr.edges.length - (arr.verts.length + loose) + K, "Euler");
  for (const f of arr.faces) assert.ok(f.area > 0);
  return arr;
}

test("isolated circle: one face, a closed two-arc path", () => {
  const arr = invariants([C("a", 0, 0, 10)]);
  assert.equal(arr.faces.length, 1);
  const d = loopsToPath(arr, mergeLoops(arr, arr.faces));
  assert.ok(onlyArcs(d), d);
  assert.equal((d.match(/A/g) ?? []).length, 2);
});

test("two overlapping circles: 3 faces; lens is found under the pointer", () => {
  const arr = invariants([C("a", -5, 0, 10), C("b", 5, 0, 10)]);
  assert.equal(arr.faces.length, 3);
  assert.deepEqual(faceAt(arr, 0, 0).ids, ["a", "b"]);
  assert.deepEqual(faceAt(arr, -12, 0).ids, ["a"]);
  assert.equal(faceAt(arr, 0, 50), null); // the outside is never a face
});

test("three-circle Venn: 7 bounded faces (8 with the outside)", () => {
  const r = 10, cs = [0, 1, 2].map((k) => C(`c${k}`, 6 * Math.cos((k * 2 * Math.PI) / 3), 6 * Math.sin((k * 2 * Math.PI) / 3), r));
  const arr = invariants(cs);
  assert.equal(arr.faces.length, 7);
  assert.equal(new Set(arr.faces.map((f) => f.mask)).size, 7);
});

test("tangent pairs share one vertex", () => {
  const out = invariants([C("a", 0, 0, 5), C("b", 10, 0, 5)]);
  assert.equal(out.verts.length, 1);
  assert.equal(out.faces.length, 2);
  const inn = invariants([C("a", 0, 0, 10), C("b", 5, 0, 5)]);
  assert.equal(inn.verts.length, 1);
  assert.equal(inn.faces.length, 2); // inner disc + crescent
});

test("nested circles: the ring is one face with a hole (two subpaths)", () => {
  const arr = invariants([C("a", 0, 0, 10), C("b", 1, 1, 4)]);
  assert.equal(arr.faces.length, 2);
  const ring = faceAt(arr, -8, 0);
  assert.deepEqual(ring.ids, ["a"]);
  assert.equal(ring.loops.length, 2);
  assert.equal(subpaths(loopsToPath(arr, mergeLoops(arr, [ring]))), 2);
  assert.ok(Math.abs(ring.area - Math.PI * (100 - 16)) < 1e-6);
});

test("identical circles are deduped", () => {
  const arr = invariants([C("a", 0, 0, 10), C("b", 0, 0, 10)]);
  assert.equal(arr.circles.length, 1);
  assert.equal(arr.faces.length, 1);
});

test("a ring of circles encloses a bounded face that is inside none of them", () => {
  const cs = [0, 1, 2, 3, 4, 5].map((k) => C(`c${k}`, 10 * Math.cos((k * Math.PI) / 3), 10 * Math.sin((k * Math.PI) / 3), 6));
  const arr = invariants(cs);
  const hole = faceAt(arr, 0, 0);
  assert.ok(hole);
  assert.deepEqual(hole.ids, []);
});

test("one inside-set split into two faces; the stored point picks the right one", () => {
  const arr = invariants([C("a", -1, 0, 1.5), C("b", 1, 0, 1.5), C("c", 0, 0, 0.6)]);
  const twins = arr.faces.filter((f) => f.ids.join() === "a,b");
  assert.equal(twins.length, 2);
  const top = faceAt(arr, 0, -0.9), bottom = faceAt(arr, 0, 0.9);
  assert.notEqual(top.id, bottom.id);
  const got = resolveFills(arr, [{ ids: ["a", "b"], x: 0, y: 0.9, color: "#000" }]);
  assert.deepEqual([...got.keys()], [bottom.id]);
});

test("fills follow their inside-set when circles move", () => {
  const fills = [{ ids: ["a", "b"], x: 0, y: 0, color: "#123" }];
  const moved = arrange([C("a", 20, 0, 10), C("b", 30, 0, 10)]);
  const [fid] = resolveFills(moved, fills).keys();
  assert.deepEqual(moved.faces[fid].ids, ["a", "b"]);
});

test("same-colour neighbours merge: lens + left crescent = the whole disc", () => {
  const arr = invariants([C("a", -5, 0, 10), C("b", 5, 0, 10)]);
  const [p] = inkPaths(arr, [{ ids: ["a"], x: -12, y: 0, color: "#000" }, { ids: ["a", "b"], x: 0, y: 0, color: "#000" }]);
  assert.ok(onlyArcs(p.d), p.d);
  assert.equal(subpaths(p.d), 1);
  assert.equal((p.d.match(/A/g) ?? []).length, 2); // the lens's inner arc dropped out
  const two = inkPaths(arr, [{ ids: ["a"], x: -12, y: 0, color: "#000" }, { ids: ["a", "b"], x: 0, y: 0, color: "#fff" }]);
  assert.equal(two.length, 2);
});

test("φ construction: golden-ladder circles, tangent chain; merged outline is arcs only", () => {
  const base = 10, cs = [];
  let x = 0;
  for (let k = 0; k < 5; k++) { const r = base * PHI ** k; cs.push(C(`p${k}`, x + r, 0, r)); x += 2 * r; } // externally tangent row
  cs.push(C("big", 30, 10, base * PHI ** 4), C("eye", 25, -5, base * PHI));
  const arr = invariants(cs);
  assert.equal(arr.faces.length, 11);
  // "eye" covers the p0/p1 tangency, so eye-minus-both is two faces touching at that point, not one figure-8
  assert.equal(arr.faces.filter((f) => f.ids.join() === "big,eye").length, 2);
  const d = loopsToPath(arr, mergeLoops(arr, arr.faces));
  assert.ok(onlyArcs(d) && !/[CQLHV]/.test(d), d);
});

test("random arrangements keep the invariants", () => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 40; t++) invariants(Array.from({ length: 2 + (t % 7) }, (_, k) => C(`r${k}`, rnd() * 100, rnd() * 100, 5 + rnd() * 40)));
});

const L = (id, circles, fills = [], extra = {}) => ({ id, name: id, visible: true, locked: false, circles, fills, ...extra });
const inkF = { ids: ["a", "b"], x: 0, y: 0, color: "#e8705a" };

test("export: mark has only M/A/Z paths, sheet adds hairline circles", () => {
  const doc = sanitize({ circles: [C("a", -5, 0, 10), C("b", 5, 0, 10)], fills: [inkF] });
  const mark = exportSVG(doc);
  assert.match(mark, /<path fill="#e8705a" fill-rule="evenodd" d="M[^"]*A/);
  assert.doesNotMatch(mark, /<circle|[CQ]\d|<rect/);
  const sheet = exportSVG(doc, { sheet: true });
  assert.equal((sheet.match(/<circle /g) ?? []).length, 2);
});

test("export: layers are groups in order, hidden omitted, bg rect first", () => {
  const doc = { layers: [L("l1", [C("a", -5, 0, 10), C("b", 5, 0, 10)], [inkF]), L("l2", [C("z", 0, 0, 4)], [{ ids: ["z"], x: 0, y: 0, color: "#123456" }]), L("l3", [C("y", 0, 0, 4)], [{ ids: ["y"], x: 0, y: 0, color: "#abcdef" }], { visible: false })], active: "l1", ink: "#e8705a", bg: "#ffffff" };
  const svg = exportSVG(doc);
  assert.deepEqual([...svg.matchAll(/<g id="(layer-[^"]+)"/g)].map((m) => m[1]), ["layer-l1", "layer-l2"]);
  assert.ok(svg.indexOf("<rect") < svg.indexOf("<g id"));
  assert.match(svg, /<rect [^>]*fill="#ffffff"/);
  assert.doesNotMatch(svg, /abcdef/);
  assert.doesNotMatch(exportSVG(doc, { bg: "transparent" }), /<rect/);
  assert.doesNotMatch(exportSVG(doc, { bg: '"><script>' }), /<rect|script/);
});

test("layers: each is its own construction (faces per layer)", () => {
  const l1 = [C("a", -5, 0, 10), C("b", 5, 0, 10)], l2 = [C("z", 40, 0, 10)];
  assert.equal(arrange(l1).faces.length, 3);
  assert.equal(arrange(l2).faces.length, 1);
  invariants(l1); invariants(l2);
});

test("sanitize: migrates the old flat shape into one layer", () => {
  const d = sanitize({ circles: [C("a", 0, 0, 5)], fills: [inkF], ink: "#111" });
  assert.equal(d.layers.length, 1);
  assert.equal(d.layers[0].name, "Layer 1");
  assert.deepEqual(d.layers[0].circles.map((c) => c.id), ["a"]);
  assert.equal(d.layers[0].fills.length, 1);
  assert.equal(d.active, d.layers[0].id);
  assert.equal(d.bg, "transparent");
  assert.deepEqual(sanitize(null), { base: 100, snap: sanitize({}).snap, layers: [L("l1", [], [], { name: "Layer 1" })], active: "l1", ink: "#e8705a", bg: "transparent", frame: { x: -512, y: -512, w: 1024, h: 1024 } });
});

test("sanitize: layer fields, caps, names, bg, active, unique circle ids", () => {
  const d = sanitize({
    layers: [
      L("p", [C("a", 0, 0, 5), C("b", 1, 1, 5)], [], { name: "  <b>Sky</b>" + "x".repeat(60), locked: true, visible: false }),
      L("q", [C("a", 9, 9, 5), C("c", 2, 2, 5)]), // "a" duplicates layer p's circle
      L("p", [C("n", 0, 0, 1)]), // duplicate layer id
      { id: "bad id", circles: [] }, null,
    ],
    active: "nope", bg: "#FFaa00", ink: "#fff",
  });
  assert.deepEqual(d.layers.map((l) => l.id), ["p", "q"]);
  assert.ok(d.layers[0].name.length <= 40 && !/[<>]/.test(d.layers[0].name));
  assert.equal(d.layers[0].locked, true);
  assert.equal(d.layers[0].visible, false);
  assert.deepEqual(d.layers[1].circles.map((c) => c.id), ["c"]);
  assert.equal(d.active, "q");
  assert.equal(d.bg, "#FFaa00");
  assert.equal(sanitize({ bg: "red" }).bg, "transparent");
  assert.equal(sanitize({ bg: '"/><x>' }).bg, "transparent");
  assert.equal(sanitize({ layers: [L("p", [])], active: "p" }).active, "p");
  assert.equal(sanitize({ layers: [L("p", [], [], { name: "" })] }).layers[0].name, "Layer 1");
  assert.equal(sanitize({ layers: Array.from({ length: 80 }, (_, i) => L(`l${i}`, [])) }).layers.length, 32);
  const many = sanitize({ layers: [L("a1", Array.from({ length: 150 }, (_, i) => C(`x${i}`, i, 0, 1))), L("a2", Array.from({ length: 150 }, (_, i) => C(`y${i}`, i, 0, 1)))] });
  assert.equal(many.layers.reduce((n, l) => n + l.circles.length, 0), 200);
  const f = (i) => ({ ids: ["a"], x: i, y: 0, color: "#fff" });
  const mf = sanitize({ layers: [L("a1", [], Array.from({ length: 1500 }, (_, i) => f(i))), L("a2", [], Array.from({ length: 1500 }, (_, i) => f(i)))] });
  assert.equal(mf.layers.reduce((n, l) => n + l.fills.length, 0), 2000);
});

test("sanitize: drops malformed circles/fills and non-hex colours (no markup reaches the SVG)", () => {
  const d = sanitize({
    circles: [C("a", 0, 0, 5), C("b", 0, 0, -1), C("<x>", 0, 0, 5), { id: "c", cx: "1", cy: 0, r: 2 }, C("d", Infinity, 0, 2)],
    fills: [{ ids: ["a"], x: 0, y: 0, color: "#fff" }, { ids: ["a"], x: 0, y: 0, color: '"/><script>' }, { ids: "a", x: 0, y: 0, color: "#fff" }],
    ink: "red",
    extra: 1,
  });
  assert.deepEqual(d.layers[0].circles.map((c) => c.id), ["a"]);
  assert.equal(d.layers[0].fills.length, 1);
  assert.equal(d.ink, "#e8705a");
  assert.equal(sanitize({ circles: Array.from({ length: 500 }, (_, i) => C(`c${i}`, i, 0, 1)) }).layers[0].circles.length, 200);
});

test("sanitize: base radius and snap settings are validated", () => {
  const d0 = sanitize({});
  assert.equal(d0.base, 100);
  assert.equal(d0.snap.on, true);
  assert.ok(Object.values(d0.snap.kinds).every((v) => v === true) && "phi" in d0.snap.kinds && "sliver" in d0.snap.kinds);
  for (const bad of [0, -5, NaN, Infinity, "9", 1e9, null]) assert.equal(sanitize({ base: bad }).base, 100);
  assert.equal(sanitize({ base: 64.5 }).base, 64.5);
  const d = sanitize({ snap: { on: false, kinds: { phi: false, tangent: "x", bogus: false } } });
  assert.equal(d.snap.on, false);
  assert.equal(d.snap.kinds.phi, false);
  assert.equal(d.snap.kinds.tangent, true);
  assert.equal("bogus" in d.snap.kinds, false);
  assert.equal(sanitize({ snap: "x" }).snap.on, true);
});

test("sanitize: frame is validated, old docs get one fitted to the drawing", () => {
  assert.deepEqual(sanitize({ frame: { x: -10, y: 5, w: 420, h: 640 } }).frame, { x: -10, y: 5, w: 420, h: 640 });
  for (const bad of [null, "x", { x: 0, y: 0, w: 0, h: 5 }, { x: 0, y: 0, w: 9000, h: 5 }, { x: NaN, y: 0, w: 5, h: 5 }, { x: 0, y: 0, w: 5 }, { x: 1e9, y: 0, w: 5, h: 5 }])
    assert.deepEqual(sanitize({ frame: bad }).frame, { x: -512, y: -512, w: 1024, h: 1024 });
  const f = sanitize({ circles: [C("a", 0, 0, 100)] }).frame;
  assert.deepEqual(f, fitFrame([C("a", 0, 0, 100)]));
  assert.ok(f.w >= 200 && f.x <= -100 && f.x + f.w >= 100);
});

test("export: viewBox and size are exactly the frame (mark and sheet)", () => {
  const doc = sanitize({ circles: [C("a", -5, 0, 10), C("b", 5, 0, 10)], fills: [inkF], frame: { x: -210, y: -320, w: 420, h: 640 } });
  for (const sheet of [false, true]) assert.match(exportSVG(doc, { sheet }), /width="420" height="640" viewBox="-210 -320 420 640"/);
});
