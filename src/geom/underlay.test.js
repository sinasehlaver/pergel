import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize, exportSVG } from "./doc.js";
import { phiPreset } from "./preset.js";
import { PHI } from "./snap.js";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const U = { src: PNG, x: 1, y: 2, w: 300, h: 200, opacity: 0.5, visible: true, locked: false };

test("underlay survives sanitize; bad ones are dropped", () => {
  assert.deepEqual(sanitize({ underlay: U }).underlay, U);
  for (const bad of [
    { ...U, src: "https://evil/x.png" }, { ...U, src: "data:text/html;base64,AAAA" }, { ...U, src: "data:image/png;base64,AA\"onload=1" },
    { ...U, src: "data:image/gif;base64,AAAA" }, { ...U, w: NaN }, { ...U, h: 0 }, { ...U, x: Infinity }, { ...U, src: "data:image/png;base64," + "A".repeat(12e6) }, null, "x",
  ]) assert.equal(sanitize({ underlay: bad }).underlay, undefined);
  assert.equal(sanitize({ underlay: { ...U, opacity: 9, locked: "yes", visible: 0 } }).underlay.opacity, 1);
  assert.equal(sanitize({ underlay: { ...U, locked: "yes" } }).underlay.locked, false);
  assert.equal(sanitize({}).underlay, undefined);
});

test("underlay never reaches an exported SVG", () => {
  const d = sanitize({ underlay: U, layers: [{ id: "l1", name: "a", circles: [{ id: "a", cx: 0, cy: 0, r: 50 }], fills: [{ ids: ["a"], x: 0, y: 0, color: "#ff0000" }] }] });
  for (const sheet of [false, true]) { const s = exportSVG(d, { sheet }); assert.ok(!/<image|data:image/.test(s)); }
});

test("phi preset: radii base·φ^k, consecutive circles tangent, centred", () => {
  const cs = phiPreset(50, 10, 20);
  assert.equal(cs.length, 5);
  cs.forEach((c, i) => assert.ok(Math.abs(c.r - 50 * PHI ** (i - 2)) < 1e-9));
  for (let i = 1; i < cs.length; i++) assert.ok(Math.abs(Math.hypot(cs[i].cx - cs[i - 1].cx, cs[i].cy - cs[i - 1].cy) - (cs[i].r + cs[i - 1].r)) < 1e-9);
  const x0 = Math.min(...cs.map((c) => c.cx - c.r)), x1 = Math.max(...cs.map((c) => c.cx + c.r));
  assert.ok(Math.abs((x0 + x1) / 2 - 10) < 1e-9);
});
