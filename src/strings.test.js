import { test } from "node:test";
import assert from "node:assert/strict";
import { strings } from "./strings.js";

test("en and tr have the same keys", () => {
  assert.deepEqual(Object.keys(strings.tr).sort(), Object.keys(strings.en).sort());
});
