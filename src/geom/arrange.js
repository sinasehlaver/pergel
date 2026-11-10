// Circle arrangement -> faces bounded by exact circular arcs. Pure JS, no DOM.
// Pipeline: dedupe circles -> pairwise intersections (eps-merged vertices) -> arcs between consecutive
// vertices on each circle -> per inside-set region, chain its boundary arcs into loops -> loops with
// positive area are outer boundaries, negative ones are holes of the smallest outer that contains them.
// Coordinates are SVG (y down); "fwd" = increasing atan2 angle = SVG sweep-flag 1; the disc is on the
// side that gives a loop positive shoelace area, so region-on-that-side orientation is fwd for "inside".
// ponytail: O(n²) intersections + full rebuild on every change; fine at ≤ ~30 circles, go incremental if not.

const TAU = Math.PI * 2;
const EPS = 1e-7;
const norm = (a) => ((a % TAU) + TAU) % TAU;

export function intersect(a, b) {
  const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy);
  const tol = EPS * Math.max(1, a.r, b.r);
  if (d < tol) return []; // concentric (identical ones are deduped before this)
  if (d > a.r + b.r + tol || d < Math.abs(a.r - b.r) - tol) return [];
  const l = (a.r * a.r - b.r * b.r + d * d) / (2 * d);
  const h2 = a.r * a.r - l * l;
  const mx = a.cx + (dx * l) / d, my = a.cy + (dy * l) / d;
  if (h2 <= (tol * Math.max(1, a.r)) ** 2 * 4) return [{ x: mx, y: my }]; // tangent: one shared point
  const h = Math.sqrt(h2);
  return [{ x: mx - (dy * h) / d, y: my + (dx * h) / d }, { x: mx + (dy * h) / d, y: my - (dx * h) / d }];
}

// Signed area of one arc's contribution to a loop (Green's theorem, exact).
function arcArea(c, t1, span, dir) {
  const t2 = t1 + span;
  const v = c.r * c.cx * (Math.sin(t2) - Math.sin(t1)) - c.r * c.cy * (Math.cos(t2) - Math.cos(t1)) + c.r * c.r * span;
  return (dir * v) / 2;
}

export function maskAt(circles, x, y) {
  return circles.map((c) => (Math.hypot(x - c.cx, y - c.cy) < c.r ? "1" : "0")).join("");
}

function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function arrange(input) {
  // 1. dedupe identical circles (keep the first id)
  const circles = [];
  for (const c of input) {
    if (!(c.r > 0)) continue;
    const tol = EPS * Math.max(1, c.r);
    if (!circles.some((k) => Math.abs(k.cx - c.cx) < tol && Math.abs(k.cy - c.cy) < tol && Math.abs(k.r - c.r) < tol)) circles.push(c);
  }
  // 2. vertices, merged across pairs (3 circles through one point = one vertex)
  const verts = [];
  const onCircle = circles.map(() => new Set());
  const vid = (p) => {
    let i = verts.findIndex((v) => Math.hypot(v.x - p.x, v.y - p.y) < 1e-6 * Math.max(1, Math.abs(p.x), Math.abs(p.y)));
    if (i < 0) { i = verts.length; verts.push(p); }
    return i;
  };
  for (let i = 0; i < circles.length; i++)
    for (let j = i + 1; j < circles.length; j++)
      for (const p of intersect(circles[i], circles[j])) { const v = vid(p); onCircle[i].add(v); onCircle[j].add(v); }

  // 3. arcs: consecutive vertices on each circle, fwd. A circle with no vertex is one full arc from angle 0.
  const edges = [];
  circles.forEach((c, ci) => {
    const vs = [...onCircle[ci]].map((v) => ({ v, t: norm(Math.atan2(verts[v].y - c.cy, verts[v].x - c.cx)) })).sort((a, b) => a.t - b.t);
    if (!vs.length) { edges.push({ ci, s: null, e: null, t1: 0, span: TAU }); return; }
    vs.forEach((a, k) => {
      const b = vs[(k + 1) % vs.length];
      const span = vs.length === 1 ? TAU : norm(b.t - a.t) || TAU;
      edges.push({ ci, s: a.v, e: b.v, t1: a.t, span });
    });
  });
  // side masks: the other circles containing the arc midpoint (it can't lie on another circle), plus/minus this one
  for (const ed of edges) {
    const c = circles[ed.ci], tm = ed.t1 + ed.span / 2;
    const bits = maskAt(circles, c.cx + c.r * Math.cos(tm), c.cy + c.r * Math.sin(tm)).split("");
    bits[ed.ci] = "1"; ed.inMask = bits.join("");
    bits[ed.ci] = "0"; ed.outMask = bits.join("");
  }

  // 4. per region (inside-set), chain its oriented boundary arcs into closed loops
  const regions = new Map();
  const push = (m, he) => (regions.get(m) ?? regions.set(m, []).get(m)).push(he);
  edges.forEach((ed, i) => { push(ed.inMask, { i, dir: 1 }); push(ed.outMask, { i, dir: -1 }); });

  const ctx = { circles, verts, edges };
  const faces = [];
  for (const [mask, hes] of regions) {
    const loops = chain(ctx, hes).map((l) => loopInfo(ctx, l));
    const outers = loops.filter((l) => l.area > 0).map((l) => ({ ...l, holes: [] }));
    for (const h of loops.filter((l) => l.area <= 0)) {
      const host = outers.filter((o) => pointInPoly(o.poly, h.probe[0], h.probe[1])).sort((a, b) => a.area - b.area)[0];
      if (host) host.holes.push(h); // no host = a hole of the unbounded outside, which is never a face
    }
    for (const o of outers) {
      faces.push({
        id: faces.length,
        mask,
        ids: circles.filter((_, k) => mask[k] === "1").map((c) => c.id),
        loops: [o, ...o.holes],
        area: o.area + o.holes.reduce((s, h) => s + h.area, 0),
        hes: [o, ...o.holes].flatMap((l) => l.hes),
      });
    }
  }
  return { circles, verts, edges, faces };
}

// Face walk: at each vertex take the outgoing arc that is first clockwise from the way we came in
// (region on the left in math orientation). Directions are short secants, not tangents, so arcs that
// are tangent at the vertex still sort by curvature. Without this, two faces touching at a tangency
// point get glued into one figure-8.
function chain({ circles, edges }, hes) {
  const from = (he) => (he.dir > 0 ? edges[he.i].s : edges[he.i].e);
  const to = (he) => (he.dir > 0 ? edges[he.i].e : edges[he.i].s);
  // secant angle from the arc's start (atEnd=false) or end vertex to a point a little way along it
  const sec = (he, atEnd) => {
    const ed = edges[he.i], c = circles[ed.ci], dt = Math.min(ed.span / 2, 1e-3);
    const startT = he.dir > 0 ? ed.t1 : ed.t1 + ed.span;
    const t0 = atEnd ? startT + he.dir * ed.span : startT;
    const t = t0 + (atEnd ? -he.dir : he.dir) * dt;
    return Math.atan2(Math.sin(t) - Math.sin(t0), Math.cos(t) - Math.cos(t0));
  };
  const left = new Set(hes);
  const loops = [];
  for (const start of hes) {
    if (!left.has(start)) continue;
    left.delete(start);
    const loop = [start];
    let cur = start;
    while (from(start) !== null) {
      const v = to(cur), aIn = sec(cur, true);
      const cands = [...left, start].filter((h) => from(h) === v);
      if (!cands.length) break; // open chain: only from numerical noise; render what we have
      const nxt = cands.reduce((best, h) => (turn(aIn, sec(h, false)) < turn(aIn, sec(best, false)) ? h : best));
      if (nxt === start) break;
      left.delete(nxt); loop.push(nxt); cur = nxt;
    }
    loops.push(loop);
  }
  return loops;
}
const turn = (aIn, aOut) => norm(aIn - aOut) || TAU;

function loopInfo({ circles, edges }, hes) {
  let area = 0;
  const poly = [];
  for (const he of hes) {
    const ed = edges[he.i], c = circles[ed.ci];
    area += arcArea(c, ed.t1, ed.span, he.dir);
    const n = Math.max(2, Math.ceil((ed.span / TAU) * 160));
    for (let k = 0; k < n; k++) {
      const f = he.dir > 0 ? k / n : 1 - k / n;
      const t = ed.t1 + ed.span * f;
      poly.push([c.cx + c.r * Math.cos(t), c.cy + c.r * Math.sin(t)]);
    }
  }
  const e0 = edges[hes[0].i], c0 = circles[e0.ci], tm = e0.t1 + e0.span / 2;
  return { hes, area, poly, probe: [c0.cx + c0.r * Math.cos(tm), c0.cy + c0.r * Math.sin(tm)] };
}

export function faceAt(arr, x, y) {
  const mask = maskAt(arr.circles, x, y);
  return arr.faces.find((f) => f.mask === mask && contains(f, x, y)) ?? null;
}

export function contains(f, x, y) {
  return pointInPoly(f.loops[0].poly, x, y) && !f.loops.slice(1).some((h) => pointInPoly(h.poly, x, y));
}

// Union of faces -> loops of only the arcs that separate it from the rest (shared arcs drop out).
export function mergeLoops(arr, faces) {
  const own = new Set(faces.flatMap((f) => f.hes.map((h) => `${h.i}:${h.dir}`)));
  const hes = faces.flatMap((f) => f.hes).filter((h) => !own.has(`${h.i}:${-h.dir}`));
  return chain(arr, hes);
}

const fmt = (n) => String(Math.round(n * 1000) / 1000 + 0);

// Loops -> SVG path data of only M / A / Z. Full circles are two half arcs (one A can't close on itself).
export function loopsToPath({ circles, edges }, loops) {
  let d = "";
  for (const loop of loops) {
    loop.forEach((he, k) => {
      const ed = edges[he.i], c = circles[ed.ci];
      const pt = (t) => `${fmt(c.cx + c.r * Math.cos(t))} ${fmt(c.cy + c.r * Math.sin(t))}`;
      const [a, b] = he.dir > 0 ? [ed.t1, ed.t1 + ed.span] : [ed.t1 + ed.span, ed.t1];
      const sweep = he.dir > 0 ? 1 : 0, r = fmt(c.r);
      if (k === 0) d += `M${pt(a)}`;
      if (ed.span > Math.PI * 1.5) {
        const m = (a + b) / 2, large = ed.span / 2 > Math.PI ? 1 : 0;
        d += `A${r} ${r} 0 ${large} ${sweep} ${pt(m)}A${r} ${r} 0 ${large} ${sweep} ${pt(b)}`;
      } else d += `A${r} ${r} 0 ${ed.span > Math.PI ? 1 : 0} ${sweep} ${pt(b)}`;
    });
    d += "Z";
  }
  return d;
}

// Persisted fills ({ids, x, y, color}) -> faces. A fill follows its inside-set, so it survives moves;
// several faces can share one inside-set, so the stored point picks among them; if the set no longer
// exists (a circle crossed it or was deleted) the face under the point takes it.
export function resolveFills(arr, fills) {
  const out = new Map(); // face id -> color
  for (const fl of fills) {
    const key = [...fl.ids].sort().join(",");
    const cands = arr.faces.filter((f) => [...f.ids].sort().join(",") === key);
    let f = cands.find((c) => contains(c, fl.x, fl.y));
    if (!f && cands.length) f = cands.sort((a, b) => dist(a, fl) - dist(b, fl))[0];
    if (!f) f = faceAt(arr, fl.x, fl.y);
    if (f) out.set(f.id, fl.color);
  }
  return out;
}
const dist = (f, p) => { const pts = f.loops[0].poly; let sx = 0, sy = 0; for (const [x, y] of pts) { sx += x; sy += y; } return Math.hypot(sx / pts.length - p.x, sy / pts.length - p.y); };

// colour -> one merged path per colour, in first-fill order
export function inkPaths(arr, fills) {
  const byColor = new Map();
  for (const [fid, color] of resolveFills(arr, fills)) (byColor.get(color) ?? byColor.set(color, []).get(color)).push(arr.faces[fid]);
  return [...byColor].map(([color, fs]) => ({ color, d: loopsToPath(arr, mergeLoops(arr, fs)), faces: fs.map((f) => f.id) }));
}
