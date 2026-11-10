// The only file a new app edits before building features (appId also keys the no-flash look script, via vite.config.js).
import { sanitize, defaultSnap } from "./geom/doc.js";

export const config = {
  appId: "pergel",
  title: "pergel",
  version: 2, // data schema version; bump + add a migration in migrate()
  users: false,
  languages: ["en", "tr"],
};

// A three-circle Venn to ink straight away; Settings → reset brings it back.
const R = 120, D = 70;
export const initialData = {
  layers: [{
    id: "l1", name: "Layer 1", visible: true, locked: false,
    circles: [0, 1, 2].map((k) => ({ id: `c${k + 1}`, cx: Math.round(D * Math.cos(-Math.PI / 2 + (k * 2 * Math.PI) / 3)), cy: Math.round(D * Math.sin(-Math.PI / 2 + (k * 2 * Math.PI) / 3)), r: R })),
    fills: [],
  }],
  active: "l1",
  base: 100,
  snap: defaultSnap(),
  ink: "#e8705a",
  bg: "transparent",
  frame: { x: -256, y: -256, w: 512, h: 512 },
};

// Files and localStorage are untrusted: every load goes through sanitize (shape, caps, hex-only colours).
export function migrate(data, from) {
  void from; // v1 = flat {circles, fills}; sanitize() wraps it into one layer
  return sanitize(data);
}
