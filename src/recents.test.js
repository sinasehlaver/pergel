import { test } from "node:test";
import assert from "node:assert/strict";
import { addRecent, removeRecent, cleanRecents, MAX_RECENTS } from "./recents.js";

test("addRecent: newest first, de-duplicated by id, capped", () => {
  let l = [];
  for (let i = 0; i < MAX_RECENTS + 3; i++) l = addRecent(l, { id: `i${i}`, name: `n${i}`, at: i });
  assert.equal(l.length, MAX_RECENTS); assert.equal(l[0].id, `i${MAX_RECENTS + 2}`);
  l = addRecent(l, { id: "i5", name: "again", at: 99 });
  assert.equal(l[0].name, "again"); assert.equal(l.filter((r) => r.id === "i5").length, 1); assert.equal(l.length, MAX_RECENTS);
});

test("removeRecent drops one id", () => {
  assert.deepEqual(removeRecent([{ id: "a", name: "a", at: 1 }, { id: "b", name: "b", at: 2 }], "a").map((r) => r.id), ["b"]);
});

test("cleanRecents drops malformed entries, dups, sorts, caps", () => {
  const raw = [null, 3, { id: "", name: "x", at: 1 }, { id: "a", name: 5, at: 1 }, { id: "a", name: "a", at: NaN }, { id: "a", name: "a", at: 1 }, { id: "a", name: "dup", at: 9 }, { id: "b", name: "b", at: 5 }];
  assert.deepEqual(cleanRecents(raw), [{ id: "b", name: "b", at: 5 }, { id: "a", name: "a", at: 1 }]);
  assert.deepEqual(cleanRecents("nope"), []);
  assert.equal(cleanRecents([{ id: "a", name: "x".repeat(999), at: 1 }])[0].name.length, 300);
});
