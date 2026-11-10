import test from "node:test";
import assert from "node:assert/strict";
import { parseHex, normHex, toHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, sanitizeRecent, pushRecent } from "./color.js";
import { sanitize, exportSVG } from "./geom/doc.js";

test("parse/normalise", () => {
  assert.deepEqual(parseHex("#FfF"), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(normHex("e8705A"), "#e8705a");
  assert.equal(normHex("#12345", "x"), "x");
  assert.equal(normHex("#gg0000"), null);
  assert.equal(normHex(5), null);
  assert.equal(toHex({ r: 1, g: 2, b: 3, a: 0.5 }, true), "#01020380");
  assert.equal(toHex({ r: 1, g: 2, b: 3, a: 0.5 }), "#010203");
  assert.ok(Math.abs(parseHex("#00000080").a - 0.502) < 0.01);
});
test("round trips", () => {
  for (const hex of ["#e8705a", "#1d1d1f", "#ffffff", "#000000", "#2f6f8f", "#43b85c"]) {
    const c = parseHex(hex);
    assert.equal(toHex(hsvToRgb(rgbToHsv(c))), hex);
    assert.equal(toHex(hslToRgb(rgbToHsl(c))), hex);
  }
  assert.deepEqual(rgbToHsv({ r: 255, g: 0, b: 0 }), { h: 0, s: 1, v: 1 });
  assert.deepEqual(rgbToHsl({ r: 0, g: 255, b: 0 }), { h: 120, s: 1, l: 0.5 });
});
test("recent list is sanitized", () => {
  assert.deepEqual(sanitizeRecent(["#ABCDEF", "#abcdef", "javascript:1", "#abc", 3, "#12345678"]), ["#abcdef"]);
  assert.equal(pushRecent(Array.from({ length: 12 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`), "#ffffff").length, 12);
  assert.equal(pushRecent(["#111111", "#222222"], "#222222")[0], "#222222");
  assert.deepEqual(sanitizeRecent("nope"), []);
});
test("doc accepts 8-digit hex bg, rejects junk", () => {
  assert.equal(sanitize({ bg: "#11223380" }).bg, "#11223380");
  assert.equal(sanitize({ bg: "red\"/>" }).bg, "transparent");
  assert.match(exportSVG(sanitize({ bg: "#11223380", circles: [{ id: "a", cx: 0, cy: 0, r: 10 }] })), /fill="#11223380"/);
});
