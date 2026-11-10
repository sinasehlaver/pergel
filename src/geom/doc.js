// Document shape, untrusted-input sanitizer (opened files, localStorage) and SVG export. Pure JS.
import { arrange, inkPaths } from "./arrange.js";
import { KINDS } from "./snap.js";

export const DEFAULT_BASE = 100;
export const defaultSnap = () => ({ on: true, kinds: Object.fromEntries(KINDS.map((k) => [k, true])) });

export const MAX_CIRCLES = 200; // total across all layers
export const MAX_FILLS = 2000; // total across all layers
export const MAX_LAYERS = 32;
export const MAX_NAME = 40;
export const MAX_UNDERLAY = 8 * 1024 * 1024; // bytes of file; the data URL is ~4/3 of that
const UNDER_SRC = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const MIRROR_AXES = ["v", "h", "both"];
const HEX = /^#[0-9a-f]{3,8}$/i;
const ID = /^[\w-]{1,32}$/;
const num = (v, lim = 1e6) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;
// plain text only: no control chars or angle brackets, trimmed, capped
const cleanName = (n, fallback) => {
  const s = typeof n === "string" ? n.replace(/[\u0000-\u001f\u007f<>&"']/g, "").trim().slice(0, MAX_NAME) : "";
  return s || fallback;
};

// Trace-over image: only base64 raster/svg data URLs (an <img> never runs svg script), finite numbers. null if absent/invalid.
export function sanitizeUnderlay(u) {
  if (!u || typeof u !== "object" || typeof u.src !== "string" || u.src.length > MAX_UNDERLAY * 1.4 || !UNDER_SRC.test(u.src)) return null;
  if (!num(u.x) || !num(u.y) || !num(u.w) || !num(u.h) || u.w <= 0 || u.h <= 0) return null;
  return { src: u.src, x: u.x, y: u.y, w: u.w, h: u.h, opacity: num(u.opacity) ? Math.min(1, Math.max(0, u.opacity)) : 0.4, visible: u.visible !== false, locked: u.locked === true };
}

// Drops anything malformed instead of failing the whole file; colours end up in exported SVG attributes,
// so only plain hex survives. Old flat {circles, fills} docs become one layer "Layer 1".
export function sanitize(data) {
  const d = data && typeof data === "object" ? data : {};
  const rawLayers = Array.isArray(d.layers) ? d.layers : [{ id: "l1", name: "Layer 1", visible: true, locked: false, circles: d.circles, fills: d.fills }];
  const seenC = new Set(), seenL = new Set();
  let nCircles = 0, nFills = 0;
  const layers = [];
  for (const l of rawLayers) {
    if (layers.length >= MAX_LAYERS) break;
    if (!l || typeof l !== "object" || !ID.test(l.id) || seenL.has(l.id)) continue;
    seenL.add(l.id);
    const circles = (Array.isArray(l.circles) ? l.circles : [])
      .filter((c) => c && ID.test(c.id) && num(c.cx) && num(c.cy) && num(c.r) && c.r > 0 && !seenC.has(c.id) && seenC.add(c.id))
      .slice(0, Math.max(0, MAX_CIRCLES - nCircles))
      .map(({ id, cx, cy, r, mirrorOf, mirrorAx }) => ({ id, cx, cy, r, mirrorOf, mirrorAx }));
    // twin links survive only when the original is a plain circle of this layer and the kind is known
    const plain = new Set(circles.filter((c) => !c.mirrorOf).map((c) => c.id));
    for (const c of circles) {
      if (!(typeof c.mirrorOf === "string" && plain.has(c.mirrorOf) && c.mirrorOf !== c.id && ["v", "h", "vh"].includes(c.mirrorAx))) { delete c.mirrorOf; delete c.mirrorAx; }
    }
    const rm = l.mirror, mirror = rm && typeof rm === "object" && MIRROR_AXES.includes(rm.axis) ? { axis: rm.axis, x: num(rm.x) ? rm.x : 0, y: num(rm.y) ? rm.y : 0 } : null;
    if (!mirror) for (const c of circles) { delete c.mirrorOf; delete c.mirrorAx; }
    nCircles += circles.length;
    const fills = (Array.isArray(l.fills) ? l.fills : [])
      .filter((f) => f && Array.isArray(f.ids) && f.ids.length <= MAX_CIRCLES && f.ids.every((i) => typeof i === "string" && ID.test(i)) && num(f.x) && num(f.y) && HEX.test(f.color))
      .slice(0, Math.max(0, MAX_FILLS - nFills))
      .map(({ ids, x, y, color }) => ({ ids: [...ids], x, y, color }));
    nFills += fills.length;
    layers.push({ id: l.id, name: cleanName(l.name, `Layer ${layers.length + 1}`), visible: l.visible !== false, locked: l.locked === true, circles, fills, ...(mirror ? { mirror } : {}) });
  }
  if (!layers.length) layers.push({ id: "l1", name: "Layer 1", visible: true, locked: false, circles: [], fills: [] });
  const active = layers.some((l) => l.id === d.active) ? d.active : layers[layers.length - 1].id;
  const rs = d.snap && typeof d.snap === "object" ? d.snap : {};
  const snap = { on: rs.on !== false, kinds: Object.fromEntries(KINDS.map((k) => [k, !(rs.kinds && typeof rs.kinds === "object") || rs.kinds[k] !== false])) };
  const base = num(d.base, 1e6) && d.base > 0 ? d.base : DEFAULT_BASE;
  const underlay = sanitizeUnderlay(d.underlay);
  const frame = sanitizeFrame(d.frame, layers.flatMap((l) => l.circles));
  return { base, snap, layers, active, frame, ...(underlay ? { underlay } : {}), ink: HEX.test(d.ink) ? d.ink : "#e8705a", bg: d.bg === "transparent" || HEX.test(d.bg) ? d.bg : "transparent" };
}

export const MAX_FRAME = 8192;
export const DEFAULT_FRAME = { x: -512, y: -512, w: 1024, h: 1024 };
// Canvas frame (artboard): world units, 1 unit = 1px of export at 1x. Fitted to the circles with a margin; empty doc = 1024x1024 around the origin.
export function fitFrame(circles, margin = 32) {
  if (!circles.length) return { ...DEFAULT_FRAME };
  const x0 = Math.min(...circles.map((c) => c.cx - c.r)) - margin, x1 = Math.max(...circles.map((c) => c.cx + c.r)) + margin;
  const y0 = Math.min(...circles.map((c) => c.cy - c.r)) - margin, y1 = Math.max(...circles.map((c) => c.cy + c.r)) + margin;
  const w = Math.min(MAX_FRAME, Math.max(1, Math.ceil(x1 - x0))), h = Math.min(MAX_FRAME, Math.max(1, Math.ceil(y1 - y0)));
  return { x: Math.round((x0 + x1) / 2 - w / 2), y: Math.round((y0 + y1) / 2 - h / 2), w, h };
}
export function sanitizeFrame(f, circles = []) {
  if (f && typeof f === "object" && num(f.x) && num(f.y) && num(f.w, MAX_FRAME) && num(f.h, MAX_FRAME) && f.w >= 1 && f.h >= 1) return { x: f.x, y: f.y, w: f.w, h: f.h };
  return fitFrame(circles);
}

export const activeLayer = (doc) => doc.layers.find((l) => l.id === doc.active) ?? doc.layers[doc.layers.length - 1];
// apply fn(layer) -> layer to the layer with that id (default: active)
export const mapLayer = (doc, fn, id = doc.active) => ({ ...doc, layers: doc.layers.map((l) => (l.id === id ? fn(l) : l)) });
export const allCircles = (doc) => doc.layers.flatMap((l) => l.circles);
export const countFills = (doc) => doc.layers.reduce((n, l) => n + l.fills.length, 0);

const f3 = (n) => String(Math.round(n * 1000) / 1000 + 0);

// The mark: per layer (bottom first, hidden skipped) one <g id="layer-…"> with one path per colour, true arcs only.
// sheet=true adds each layer's construction circles as hairlines. bg: "transparent" | hex (default doc.bg) adds a backing rect.
export function exportSVG(doc, { sheet = false, bg = doc.bg } = {}) {
  const layers = doc.layers.filter((l) => l.visible).map((l) => {
    const arr = arrange(l.circles);
    const inks = inkPaths(arr, l.fills);
    return { l, arr, inks };
  });
  // the export is always exactly the canvas frame
  const fr = doc.frame ?? fitFrame(doc.layers.flatMap((l) => l.circles));
  const vb = [fr.x, fr.y, fr.w, fr.h].map(f3).join(" ");
  const groups = layers.flatMap(({ l, arr, inks }) => {
    const paths = inks.map((p) => `    <path fill="${p.color}" fill-rule="evenodd" d="${p.d}"/>`);
    const guides = sheet && arr.circles.length
      ? [`    <g fill="none" stroke="#6b665e" stroke-width="0.75" vector-effect="non-scaling-stroke">`,
         ...arr.circles.map((c) => `      <circle cx="${f3(c.cx)}" cy="${f3(c.cy)}" r="${f3(c.r)}"/>`),
         `    </g>`]
      : [];
    return paths.length || guides.length ? [`  <g id="layer-${l.id}">`, ...paths, ...guides, `  </g>`] : [];
  });
  const [x, y, w, h] = vb.split(" ");
  const back = HEX.test(bg) ? [`  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}"/>`] : [];
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${f3(fr.w)}" height="${f3(fr.h)}" viewBox="${vb}">`, ...back, ...groups, `</svg>`, ""].join("\n");
}
