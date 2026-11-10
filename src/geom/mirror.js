// Mirror symmetry, pure. A layer's mirror is {axis:"v"|"h"|"both", x, y}: "v" = vertical line x=mirror.x (flips x),
// "h" = horizontal line y=mirror.y (flips y). Twins are real circles with mirrorOf = original id and mirrorAx = "v"|"h"|"vh".
import { paintStroke, stroke, strokeAction, applyStroke } from "./paint.js";

export const AXES = ["v", "h", "both"];
const EPS = 1e-6;
const kindsFor = (m) => (m.axis === "v" ? ["v"] : m.axis === "h" ? ["h"] : ["v", "h", "vh"]);
const LETTER = { v: "v", h: "h", vh: "x" };
const same = (a, b) => Math.abs(a.cx - b.cx) < EPS && Math.abs(a.cy - b.cy) < EPS;

export function reflectPoint(p, m, ax = m.axis === "both" ? "vh" : m.axis) {
  return { x: ax.includes("v") ? 2 * m.x - p.x : p.x, y: ax.includes("h") ? 2 * m.y - p.y : p.y };
}
export function reflectCircle(c, m, ax) {
  const q = reflectPoint({ x: c.cx, y: c.cy }, m, ax);
  return { ...c, cx: q.x, cy: q.y };
}
export const twinId = (id, ax) => `${id.slice(0, 28)}-m${LETTER[ax]}`;
export const isTwin = (c) => !!c.mirrorOf;
export const dropLinks = (circles) => circles.map(({ mirrorOf, mirrorAx, ...c }) => c);

// Bring circles in line with the mirror. prev = the circles before this edit (tells which side changed).
// Edited twin -> its original follows; deleted twin or original -> both go; on-axis circle -> no twin on that axis.
export function syncTwins(circles, mirror, prev = []) {
  if (!mirror) return circles;
  const byId = new Map(circles.map((c) => [c.id, c]));
  const prevById = new Map(prev.map((c) => [c.id, c]));
  const changed = (c) => { const p = prevById.get(c.id); return !!p && (p.cx !== c.cx || p.cy !== c.cy || p.r !== c.r); };
  const gone = new Set();
  for (const p of prev) if (p.mirrorOf && !byId.has(p.id) && byId.has(p.mirrorOf)) gone.add(p.mirrorOf);
  const origs = new Map(); // id -> circle (non-twins, edits applied)
  for (const c of circles) if (!c.mirrorOf && !gone.has(c.id)) origs.set(c.id, c);
  for (const t of circles) {
    const o = origs.get(t.mirrorOf);
    if (!o || !changed(t) || changed(o) || !kindsFor(mirror).includes(t.mirrorAx)) continue;
    const back = reflectCircle(t, mirror, t.mirrorAx);
    origs.set(o.id, { id: o.id, cx: back.cx, cy: back.cy, r: back.r });
  }
  const out = [];
  for (const c of circles) {
    const o = origs.get(c.id);
    if (!o) continue;
    out.push(o);
    const made = [];
    for (const ax of kindsFor(mirror)) {
      const q = reflectCircle(o, mirror, ax);
      if (same(q, o) || made.some((m) => same(m, q))) continue;
      made.push(q);
      out.push({ id: twinId(o.id, ax), cx: q.cx, cy: q.cy, r: q.r, mirrorOf: o.id, mirrorAx: ax });
    }
  }
  // twins of originals whose own record came without a twin id collide only by ids; last wins
  return out;
}

// Set a layer's mirror (null = off: circles stay, links drop).
export function setMirror(layer, mirror) {
  if (!mirror) { const { mirror: _, ...rest } = layer; return { ...rest, circles: dropLinks(layer.circles) }; }
  return { ...layer, mirror, circles: syncTwins(layer.circles, mirror, layer.circles) };
}

// Apply syncTwins to every mirrored layer whose circles or mirror changed between two docs.
export function syncDoc(doc, prevDoc) {
  let any = false;
  const layers = doc.layers.map((l) => {
    if (!l.mirror) return l;
    const p = prevDoc?.layers.find((x) => x.id === l.id);
    if (p && p.circles === l.circles && p.mirror === l.mirror) return l;
    const circles = syncTwins(l.circles, l.mirror, p && p.mirror === l.mirror ? p.circles : []);
    any = true;
    return { ...l, circles };
  });
  return any ? { ...doc, layers } : doc;
}

// Reflected copies of a pointer path (one per twin kind)
export const mirrorPaths = (pts, m) => kindsFor(m).map((ax) => pts.map((p) => reflectPoint(p, m, ax)));

// Ink stroke that also inks the faces under the reflected path. Action follows the first face of the original stroke.
export function paintMirrored(arr, fills, pts, color, shift, mirror) {
  const r = paintStroke(arr, fills, pts, color, shift);
  if (!mirror || !r.action) return r;
  let out = r.fills, count = r.count;
  for (const rp of mirrorPaths(pts, mirror)) {
    const hits = stroke(arr, rp);
    if (!hits.size) continue;
    out = applyStroke(arr, out, hits, r.action, color);
    count += hits.size;
  }
  return { fills: out, action: r.action, count };
}
