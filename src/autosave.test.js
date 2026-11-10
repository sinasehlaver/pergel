import { test } from "node:test";
import assert from "node:assert/strict";
import { armed, shouldWrite, judgeDisk, checkBeforeWrite, createDebouncer, statusKind, needsLeaveGuard, loadAutosavePref, saveAutosavePref } from "./autosave.js";

const on = { enabled: true, hasFile: true, conflict: false };

test("armed needs file + pref + no conflict; untitled never writes", () => {
  assert.equal(armed(on), true);
  for (const k of ["enabled", "hasFile"]) assert.equal(armed({ ...on, [k]: false }), false);
  assert.equal(armed({ ...on, conflict: true }), false);
  assert.equal(shouldWrite({ ...on, hasFile: false }, "a", null), false);
});

test("shouldWrite is a no-op when text equals lastDisk; unknown disk writes", () => {
  assert.equal(shouldWrite(on, "a", "a"), false);
  assert.equal(shouldWrite(on, "b", "a"), true);
  assert.equal(shouldWrite(on, "a", null), true);
});

test("judgeDisk: own / reload / conflict", () => {
  assert.equal(judgeDisk("x", "x", true), "own");
  assert.equal(judgeDisk("y", "x", false), "reload");
  assert.equal(judgeDisk("y", "x", true), "conflict");
});

test("checkBeforeWrite never overwrites newer disk content", () => {
  assert.equal(checkBeforeWrite("old", "new", "old", false), "write");
  assert.equal(checkBeforeWrite("foreign", "new", "old", false), "conflict");
  assert.equal(checkBeforeWrite("new", "new", "old", false), "conflict"); // differs from what we last saw
  assert.equal(checkBeforeWrite("new", "new", "new", false), "same");
  assert.equal(checkBeforeWrite("foreign", "new", "old", true), "write"); // "Use mine"
  assert.equal(checkBeforeWrite("anything", "new", null, false), "write");
});

test("debouncer: coalesces, flush runs now, cancel drops", () => {
  const q = []; let n = 0, id = 0;
  const timers = { setTimeout: (f) => (q.push([++id, f]), id), clearTimeout: (i) => { const k = q.findIndex(([x]) => x === i); if (k >= 0) q.splice(k, 1); } };
  const d = createDebouncer(() => n++, 1000, timers);
  d.schedule(); d.schedule(); d.schedule();
  assert.equal(q.length, 1); assert.equal(d.pending(), true);
  d.flush(); assert.equal(n, 1); assert.equal(d.pending(), false);
  d.flush(); assert.equal(n, 1);
  d.schedule(); d.cancel(); assert.equal(q.length, 0);
  d.schedule(); q[0][1](); assert.equal(n, 2);
});

test("statusKind precedence", () => {
  const base = { supported: true, enabled: true, hasFile: true, conflict: false, phase: "idle", reconnect: false };
  assert.equal(statusKind({ ...base, supported: false, conflict: true }), "unsupported");
  assert.equal(statusKind({ ...base, conflict: true }), "conflict");
  assert.equal(statusKind({ ...base, reconnect: true }), "reconnect");
  assert.equal(statusKind({ ...base, enabled: false }), "off");
  assert.equal(statusKind({ ...base, hasFile: false }), "nofile");
  for (const p of ["error", "saving", "pending"]) assert.equal(statusKind({ ...base, phase: p }), p);
  assert.equal(statusKind(base), "saved");
});

test("leave guard only when work could be lost", () => {
  const ok = { dirty: true, hasFile: true, enabled: true, conflict: null, phase: "pending" };
  assert.equal(needsLeaveGuard(ok), false);
  assert.equal(needsLeaveGuard({ ...ok, dirty: false, hasFile: false }), false);
  assert.equal(needsLeaveGuard({ ...ok, hasFile: false }), true);
  assert.equal(needsLeaveGuard({ ...ok, enabled: false }), true);
  assert.equal(needsLeaveGuard({ ...ok, conflict: {} }), true);
  assert.equal(needsLeaveGuard({ ...ok, phase: "error" }), true);
});

test("autosave pref defaults on, persists off", () => {
  const m = new Map(); const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  assert.equal(loadAutosavePref(st), true);
  saveAutosavePref(false, st); assert.equal(loadAutosavePref(st), false);
  saveAutosavePref(true, st); assert.equal(loadAutosavePref(st), true);
});
