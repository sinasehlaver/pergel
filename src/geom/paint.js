import { faceAt, resolveFills } from "./arrange.js";

// Ink drag-painting, pure. A stroke is the pointer path (world points); every face it crosses is hit.

// Points along the path, no gap longer than `step` (so fast drags can't jump over a thin face).
export function samplePath(pts, step = 2) {
  const out = [];
  pts.forEach((p, i) => {
    if (i === 0) return out.push(p);
    const a = pts[i - 1], n = Math.max(1, Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / step));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((p.x - a.x) * k) / n, y: a.y + ((p.y - a.y) * k) / n });
  });
  return out;
}

// Path -> ordered Map(face id -> first point that landed in it)
export function stroke(arr, pts, step = 2) {
  const hits = new Map();
  for (const p of samplePath(pts, step)) {
    const f = faceAt(arr, p.x, p.y);
    if (f && !hits.has(f.id)) hits.set(f.id, p);
  }
  return hits;
}

// First face decides: already this ink (or shift held) -> erase, else paint.
export function strokeAction(arr, fills, firstFaceId, color, shift = false) {
  if (shift) return "erase";
  return resolveFills(arr, fills).get(firstFaceId) === color ? "erase" : "paint";
}

// Fills after applying the action to every hit face. Existing fills on hit faces are dropped first.
export function applyStroke(arr, fills, hits, action, color) {
  const kept = fills.filter((fl) => ![...resolveFills(arr, [fl]).keys()].some((id) => hits.has(id)));
  if (action === "erase") return kept;
  return [...kept, ...[...hits].map(([id, p]) => ({ ids: arr.faces[id].ids, x: p.x, y: p.y, color }))];
}

// One-call helper for the UI: path -> {fills, action} (fills unchanged when the path hits nothing)
export function paintStroke(arr, fills, pts, color, shift = false, step = 2) {
  const hits = stroke(arr, pts, step);
  if (!hits.size) return { fills, action: null, count: 0 };
  const action = strokeAction(arr, fills, hits.keys().next().value, color, shift);
  return { fills: applyStroke(arr, fills, hits, action, color), action, count: hits.size };
}
