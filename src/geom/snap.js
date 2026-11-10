// Snapping engine: pure closed-form constraint solving, no DOM. World units; the caller passes tol = screen px / zoom.
// Every snap is a *locus* the circle's centre must lie on (tangent = circle round the neighbour, concentric = a point,
// through-vertex = circle round the vertex, alignment = a line) or a *radius source* (phi ladder, equal radius).
// Candidates = identity + projection onto each near locus + intersection of each near pair (+ a free radius, then a locus).
// Each candidate is scored by the constraints it actually satisfies (detect), most first, then smallest displacement.
// ponytail: O(n²) vertices + near-locus pairs; fine at ≤ 30 circles.
import { arrange, intersect } from "./arrange.js";

export const PHI = (1 + Math.sqrt(5)) / 2;
export const KINDS = ["phi", "tangent", "concentric", "vertex", "centre", "align", "sliver"];
const ALL = Object.fromEntries(KINDS.map((k) => [k, true]));
const WEIGHT = { align: 0.5 }; // weak hints must not outvote the constraints that prevent slivers
const SNAP = "\u0000snap";
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶" };
const phiLabel = (k) => (k === 1 ? "φ" : "φ" + String(k).replace(/./g, (ch) => SUP[ch]));
const MAXK = 6;

// ---- geometry of loci: {t:"p",x,y} | {t:"c",x,y,r} | {t:"l",nx,ny,k} (nx·x+ny·y=k, unit normal)
const P = (x, y) => ({ t: "p", x, y });
const Ci = (x, y, r) => ({ t: "c", x, y, r });
const Li = (nx, ny, k) => ({ t: "l", nx, ny, k });
function dist(g, x, y) {
  if (g.t === "p") return Math.hypot(x - g.x, y - g.y);
  if (g.t === "c") return Math.abs(Math.hypot(x - g.x, y - g.y) - g.r);
  return Math.abs(g.nx * x + g.ny * y - g.k);
}
function project(g, x, y) {
  if (g.t === "p") return { x: g.x, y: g.y };
  if (g.t === "c") {
    const dx = x - g.x, dy = y - g.y, d = Math.hypot(dx, dy) || 1;
    return dx || dy ? { x: g.x + (dx / d) * g.r, y: g.y + (dy / d) * g.r } : { x: g.x + g.r, y: g.y };
  }
  const e = g.nx * x + g.ny * y - g.k;
  return { x: x - e * g.nx, y: y - e * g.ny };
}
function inter(a, b) {
  if (a.t === "p" || b.t === "p") return [];
  if (a.t === "c" && b.t === "c") return intersect({ cx: a.x, cy: a.y, r: a.r }, { cx: b.x, cy: b.y, r: b.r });
  if (a.t === "l" && b.t === "l") {
    const det = a.nx * b.ny - a.ny * b.nx;
    if (Math.abs(det) < 1e-9) return [];
    return [{ x: (a.k * b.ny - a.ny * b.k) / det, y: (a.nx * b.k - a.k * b.nx) / det }];
  }
  const [l, c] = a.t === "l" ? [a, b] : [b, a];
  const d = l.nx * c.x + l.ny * c.y - l.k, h2 = c.r * c.r - d * d;
  if (h2 < 0) return [];
  const fx = c.x - d * l.nx, fy = c.y - d * l.ny, h = Math.sqrt(h2);
  return [{ x: fx - l.ny * h, y: fy + l.nx * h }, { x: fx + l.ny * h, y: fy - l.nx * h }];
}

// ---- environment: others (with ids) + their pairwise intersection vertices
function mkEnv(others, selfId) {
  const os = others.map((o, i) => ({ cx: o.cx, cy: o.cy, r: o.r, id: o.id ?? `#${i}` })).filter((o) => selfId == null || o.id !== selfId);
  const verts = [];
  for (let i = 0; i < os.length; i++)
    for (let j = i + 1; j < os.length; j++)
      for (const p of intersect(os[i], os[j])) {
        const v = verts.find((u) => Math.hypot(u.x - p.x, u.y - p.y) < 1e-6 * Math.max(1, Math.abs(p.x), Math.abs(p.y)));
        if (v) { for (const id of [os[i].id, os[j].id]) if (!v.ids.includes(id)) v.ids.push(id); }
        else verts.push({ x: p.x, y: p.y, ids: [os[i].id, os[j].id] });
      }
  return { os, verts };
}

// ---- guides
const circleGuide = (o) => () => ({ type: "circle", cx: o.cx, cy: o.cy, r: o.r });
const pointGuide = (x, y) => () => ({ type: "point", x, y });
function alignGuide(axis, val, o) {
  return (f) => {
    const r1 = f.r ?? 0;
    if (axis === "x") return { type: "line", x1: val, y1: Math.min(f.cy - r1, o.cy - o.r), x2: val, y2: Math.max(f.cy + r1, o.cy + o.r) };
    return { type: "line", x1: Math.min(f.cx - r1, o.cx - o.r), y1: val, x2: Math.max(f.cx + r1, o.cx + o.r), y2: val };
  };
}
function contactGuide(o) {
  return (f) => {
    const dx = f.cx - o.cx, dy = f.cy - o.cy, d = Math.hypot(dx, dy) || 1;
    const sgn = f.r > o.r && d < f.r ? -1 : 1; // f contains o: contact lies the other way
    return { type: "point", x: o.cx + sgn * (dx / d) * o.r, y: o.cy + sgn * (dy / d) * o.r };
  };
}

// ---- loci for the centre of a circle of radius rho (rho = null: a bare point, from snapPoint)
function lociFor(rho, env, K) {
  const out = [];
  const add = (kind, label, ids, g, guide) => out.push({ kind, label, ids, g, guide });
  for (const o of env.os) {
    const nm = o.id;
    if (rho != null) {
      if (K.tangent) {
        add("tangent", `tangent to ${nm}`, [nm], Ci(o.cx, o.cy, rho + o.r), contactGuide(o));
        if (Math.abs(rho - o.r) > 1e-9) add("tangent", `tangent to ${nm}`, [nm], Ci(o.cx, o.cy, Math.abs(rho - o.r)), contactGuide(o));
      }
      if (K.concentric) add("concentric", `concentric with ${nm}`, [nm], P(o.cx, o.cy), circleGuide(o));
    } else if (K.centre) add("centre", `on centre of ${nm}`, [nm], P(o.cx, o.cy), pointGuide(o.cx, o.cy));
    if (K.centre) add("centre", `on rim of ${nm}`, [nm], Ci(o.cx, o.cy, o.r), circleGuide(o));
    if (K.align) {
      add("align", `aligned with ${nm}`, [nm], Li(1, 0, o.cx), alignGuide("x", o.cx, o));
      add("align", `aligned with ${nm}`, [nm], Li(0, 1, o.cy), alignGuide("y", o.cy, o));
      if (rho != null && Math.abs(rho - o.r) > 1e-9) {
        add("align", `left edge = ${nm}`, [nm], Li(1, 0, o.cx - o.r + rho), alignGuide("x", o.cx - o.r, o));
        add("align", `right edge = ${nm}`, [nm], Li(1, 0, o.cx + o.r - rho), alignGuide("x", o.cx + o.r, o));
        add("align", `top edge = ${nm}`, [nm], Li(0, 1, o.cy - o.r + rho), alignGuide("y", o.cy - o.r, o));
        add("align", `bottom edge = ${nm}`, [nm], Li(0, 1, o.cy + o.r - rho), alignGuide("y", o.cy + o.r, o));
      }
    }
  }
  for (const v of env.verts) {
    if (rho != null && K.vertex) add("vertex", `through vertex of ${v.ids.join("·")}`, v.ids, Ci(v.x, v.y, rho), pointGuide(v.x, v.y));
    if (K.centre) add("centre", `on vertex of ${v.ids.join("·")}`, v.ids, P(v.x, v.y), pointGuide(v.x, v.y));
  }
  return out;
}

// ---- radius sources for a circle whose centre is (cx,cy). free = independent of the centre (phi ladder, equal radius)
function radiusSources(cx, cy, env, K, base) {
  const out = [];
  const add = (r, kind, label, ids, free, guide) => { if (r > 1e-6) out.push({ r, kind, label, ids, free, guide }); };
  if (K.phi) {
    if (base > 0) for (let k = -MAXK; k <= MAXK; k++) add(base * PHI ** k, "phi", phiLabel(k), [], true, (f) => ({ type: "circle", cx: f.cx, cy: f.cy, r: f.r }));
    for (const o of env.os)
      for (const k of [-2, -1, 1, 2]) {
        const lab = k === 1 ? `φ·${o.id}` : k === -1 ? `${o.id}/φ` : k === 2 ? `φ²·${o.id}` : `${o.id}/φ²`;
        add(o.r * PHI ** k, "phi", lab, [o.id], true, (f) => ({ type: "circle", cx: f.cx, cy: f.cy, r: f.r }));
      }
  }
  if (K.align) for (const o of env.os) add(o.r, "align", `radius = ${o.id}`, [o.id], true, circleGuide(o));
  for (const o of env.os) {
    const d = Math.hypot(cx - o.cx, cy - o.cy);
    if (K.tangent) {
      add(d - o.r, "tangent", `tangent to ${o.id}`, [o.id], false, contactGuide(o));
      add(d + o.r, "tangent", `tangent to ${o.id}`, [o.id], false, contactGuide(o));
      add(o.r - d, "tangent", `tangent to ${o.id}`, [o.id], false, contactGuide(o));
    }
  }
  if (K.vertex) for (const v of env.verts) add(Math.hypot(cx - v.x, cy - v.y), "vertex", `through vertex of ${v.ids.join("·")}`, v.ids, false, pointGuide(v.x, v.y));
  return out;
}

function detect(f, ctx, rho) {
  const E = 1e-6 * Math.max(1, f.r ?? 0);
  const hits = [];
  if (rho != null && ctx.mode !== "move") // radius hits first: the label reads "φ² · tangent to c3"
    for (const s of radiusSources(f.cx, f.cy, ctx.env, ctx.K, ctx.base))
      if (s.free && Math.abs(s.r - f.r) < E) hits.push({ kind: s.kind, label: s.label, with: s.ids, guide: s.guide(f) });
  for (const L of lociFor(rho, ctx.env, ctx.K)) if (dist(L.g, f.cx, f.cy) < E) hits.push({ kind: L.kind, label: L.label, with: L.ids, guide: L.guide(f) });
  return hits;
}
const score = (hits) => hits.reduce((s, h) => s + (WEIGHT[h.kind] ?? 1), 0);

// all candidate {cx,cy,r} within tolX of cur
function candidates(cur, ctx, tolX) {
  const out = [];
  const near = (rho) => lociFor(rho, ctx.env, ctx.K).filter((L) => dist(L.g, cur.cx, cur.cy) <= tolX);
  const proj = (L, r) => { const p = project(L.g, cur.cx, cur.cy); out.push({ cx: p.x, cy: p.y, r }); };
  if (ctx.mode === "move") {
    const ls = near(cur.r);
    for (const L of ls) proj(L, cur.r);
    for (let i = 0; i < ls.length; i++)
      for (let j = i + 1; j < ls.length; j++)
        for (const p of inter(ls[i].g, ls[j].g)) if (Math.hypot(p.x - cur.cx, p.y - cur.cy) <= tolX) out.push({ cx: p.x, cy: p.y, r: cur.r });
  } else {
    for (const s of radiusSources(cur.cx, cur.cy, ctx.env, ctx.K, ctx.base)) {
      if (Math.abs(s.r - cur.r) > tolX) continue;
      out.push({ cx: cur.cx, cy: cur.cy, r: s.r });
      if (s.free) for (const L of near(s.r)) proj(L, s.r); // phi radius + tangent: slide the centre along the line to the neighbour
    }
  }
  return out;
}
const disp = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) + Math.abs(a.r - b.r);

function pickBest(cands, cur, ctx, rho) {
  let best = null;
  for (const f of cands) {
    const hits = detect(f, ctx, rho(f));
    const s = score(hits), d = disp(f, cur);
    if (!best || s > best.s + 1e-9 || (Math.abs(s - best.s) <= 1e-9 && d < best.d)) best = { f, hits, s, d };
  }
  return best;
}

// ---- slivers
// Tiny faces of the arrangement: area < minArea or "width" (4·area/perimeter; ≈ the thickness of a lens) < minWidth.
// A whole untouched disc is never a sliver, however small: that is the user's size choice, not an intersection.
export function slivers(circles, { minArea = 1, minWidth = 1 } = {}) {
  const arr = arrange(circles);
  const out = [];
  for (const f of arr.faces) {
    if (f.ids.length === 1) {
      const c = arr.circles.find((k) => k.id === f.ids[0]);
      if (c && Math.abs(f.area - Math.PI * c.r * c.r) < 1e-6 * c.r * c.r) continue;
    }
    const perim = f.hes.reduce((s, he) => { const e = arr.edges[he.i]; return s + arr.circles[e.ci].r * e.span; }, 0);
    const width = perim > 0 ? (4 * f.area) / perim : 0;
    if (f.area < minArea || width < minWidth) {
      const poly = f.loops[0].poly;
      out.push({ ids: f.ids, area: f.area, width, x: poly.reduce((s, p) => s + p[0], 0) / poly.length, y: poly.reduce((s, p) => s + p[1], 0) / poly.length });
    }
  }
  return out;
}

// ---- public API
export function snapPoint(p, others, { tol = 0, kinds } = {}) {
  const K = { ...ALL, ...kinds };
  const ctx = { env: mkEnv(others, null), K, mode: "point" };
  const cur = { cx: p.x, cy: p.y, r: 0 };
  const near = lociFor(null, ctx.env, K).filter((L) => dist(L.g, cur.cx, cur.cy) <= tol);
  const cands = [cur];
  for (const L of near) { const q = project(L.g, cur.cx, cur.cy); cands.push({ cx: q.x, cy: q.y, r: 0 }); }
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++)
      for (const q of inter(near[i].g, near[j].g)) if (Math.hypot(q.x - cur.cx, q.y - cur.cy) <= tol) cands.push({ cx: q.x, cy: q.y, r: 0 });
  const best = pickBest(cands, cur, ctx, () => null);
  return { x: best.f.cx, y: best.f.cy, hits: best.hits };
}

export function snapCircle(c, others, { mode = "move", tol = 0, base, kinds } = {}) {
  const K = { ...ALL, ...kinds };
  const ctx = { env: mkEnv(others, c.id), K, mode, base };
  let cur = { cx: c.cx, cy: c.cy, r: c.r };
  if (mode === "create" && tol > 0) {
    const sp = snapPoint({ x: cur.cx, y: cur.cy }, ctx.env.os, { tol, kinds: { centre: K.centre, align: K.align, phi: false, tangent: false, concentric: false, vertex: false, sliver: false } });
    cur = { ...cur, cx: sp.x, cy: sp.y };
  }
  const best = pickBest([cur, ...(tol > 0 ? candidates(cur, ctx, tol) : [])], cur, ctx, (f) => f.r);
  let { f, hits } = best;

  if (K.sliver && tol > 0) {
    const bad = (g) => slivers([...ctx.env.os, { ...g, id: SNAP }], { minArea: 0.5 * tol * tol, minWidth: 2 * tol }).filter((s) => s.ids.includes(SNAP));
    const now = bad(f);
    if (now.length) {
      const K2 = { ...Object.fromEntries(KINDS.map((k) => [k, false])), tangent: K.tangent, concentric: K.concentric, vertex: K.vertex };
      const ctx2 = { ...ctx, K: K2 };
      const pool = candidates(cur, ctx2, 2 * tol).sort((a, b) => disp(a, cur) - disp(b, cur)).slice(0, 30);
      let win = null;
      for (const g of pool) {
        const n = bad(g).length;
        if (n < now.length && (!win || n < win.n)) win = { g, n };
      }
      if (win) {
        f = win.g;
        hits = [{ kind: "sliver", label: "avoids sliver", with: now[0].ids.filter((i) => i !== SNAP), guide: { type: "point", x: now[0].x, y: now[0].y } }, ...detect(f, ctx, f.r)];
      }
    }
  }
  return { circle: { cx: f.cx, cy: f.cy, r: f.r }, hits, label: hits.map((h) => h.label).join(" · ") };
}
