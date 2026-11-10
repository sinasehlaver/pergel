import test from "node:test";
import assert from "node:assert/strict";
import { FORMATS, rasterSize, fileName, MAX_SIDE } from "./export.js";

test("FORMATS has the four formats with ext+mime", () => {
  assert.deepEqual(Object.keys(FORMATS), ["svg", "png", "jpg", "webp"]);
  assert.equal(FORMATS.jpg.mime, "image/jpeg");
  assert.equal(FORMATS.webp.ext, "webp");
  assert.equal(FORMATS.svg.raster, false);
});
test("rasterSize scale, width, aspect, clamp", () => {
  assert.deepEqual(rasterSize("0 0 100 50", { scale: 2 }), { w: 200, h: 100 });
  assert.deepEqual(rasterSize("-10 -10 100 50", { width: 400 }), { w: 400, h: 200 });
  assert.deepEqual(rasterSize("0 0 100 50"), { w: 100, h: 50 });
  const big = rasterSize("0 0 100 50", { width: 100000 });
  assert.equal(big.w, MAX_SIDE); assert.equal(big.h, MAX_SIDE / 2);
  assert.ok(rasterSize("0 0 100 100", { scale: 1000 }).w <= MAX_SIDE);
  assert.throws(() => rasterSize("0 0 0 5"));
  assert.throws(() => rasterSize("junk"));
});
test("fileName swaps ext and sanitises", () => {
  assert.equal(fileName("pergel-mark.svg", "png"), "pergel-mark.png");
  assert.equal(fileName("a/b:c", "jpg"), "a-b-c.jpg");
  assert.equal(fileName("", "webp"), "pergel.webp");
  assert.throws(() => fileName("x", "gif"));
});
