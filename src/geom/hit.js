// Pure compass-mode hit test. Pointer p and circles are in world units; z = zoom, so every
// tolerance is in screen px (zoom-independent).
// Precedence: centre handle > rim > interior of a SELECTED circle (moves it) > null (draws a new circle).
export const CENTRE_PX = 12;
export const RIM_PX = 8;

export function hitTest(p, circles, z, selected = new Set(), { centrePx = CENTRE_PX, rimPx = RIM_PX } = {}) {
  let centre = null, rim = null, body = null;
  for (const c of circles) {
    const d = Math.hypot(p.x - c.cx, p.y - c.cy);
    const dc = d * z;
    // a tiny circle must keep a rim to grab: its centre zone shrinks to 45% of its radius
    if (dc <= Math.min(centrePx, c.r * z * 0.45) && (!centre || dc < centre.d)) centre = { c, part: "centre", d: dc };
    const rd = Math.abs(d - c.r) * z;
    if (rd <= rimPx && (!rim || rd < rim.d)) rim = { c, part: "rim", d: rd, angle: Math.atan2(p.y - c.cy, p.x - c.cx) };
    if (d < c.r && selected.has(c.id) && (!body || c.r < body.c.r)) body = { c, part: "body" };
  }
  const best = centre ?? rim ?? body;
  if (!best) return null;
  const { d, ...out } = best;
  return out;
}

// CSS cursor for a resize handle at `angle` (radians) on the rim.
export function resizeCursor(angle) {
  const a = ((angle % Math.PI) + Math.PI) % Math.PI; // direction line, 0..π
  const deg = (a * 180) / Math.PI;
  if (deg < 22.5 || deg >= 157.5) return "ew-resize";
  if (deg < 67.5) return "nwse-resize"; // screen y points down: angle 45° runs top-left→bottom-right
  if (deg < 112.5) return "ns-resize";
  return "nesw-resize";
}
