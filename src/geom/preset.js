// The classic golden-ratio circle set: radii base·φ^k, each tangent to the next, turning 90° every step (a circle spiral). Pure JS.
import { PHI } from "./snap.js";

// ids come from the caller so tests are deterministic; returns circles centred (bounding box) on (cx, cy)
export function phiPreset(base = 100, cx = 0, cy = 0, newId = (i) => `p${i}`, ks = [-2, -1, 0, 1, 2]) {
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const out = [];
  let x = 0, y = 0, prev = null;
  ks.forEach((k, i) => {
    const r = base * PHI ** k;
    if (prev != null) { const [dx, dy] = dirs[(i - 1) % 4], d = prev + r; x += dx * d; y += dy * d; }
    out.push({ id: newId(i), cx: x, cy: y, r });
    prev = r;
  });
  const x0 = Math.min(...out.map((c) => c.cx - c.r)), x1 = Math.max(...out.map((c) => c.cx + c.r));
  const y0 = Math.min(...out.map((c) => c.cy - c.r)), y1 = Math.max(...out.map((c) => c.cy + c.r));
  const ox = cx - (x0 + x1) / 2, oy = cy - (y0 + y1) / 2;
  return out.map((c) => ({ ...c, cx: c.cx + ox, cy: c.cy + oy }));
}
