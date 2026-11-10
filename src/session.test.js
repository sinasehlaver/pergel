import { test } from "node:test";
import assert from "node:assert/strict";
import { serialize, storeSession, readSession, clearSession, migrateLegacy, baseName, SESSION_KEY, LEGACY_KEY } from "./session.js";
import { config, initialData, migrate } from "./config.js";

const opts = { app: config.appId, version: config.version, migrate };
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) }; };

test("serialize is stable, pretty, and round-trips through parseEnvelope + sanitize", () => {
  const a = serialize("pergel", 2, initialData);
  assert.equal(a, serialize("pergel", 2, initialData));
  assert.match(a, /\n  "app": "pergel"/);
  const st = mem();
  assert.equal(storeSession(st, { text: a, name: "x.pergel", hasFile: true, clean: true }), true);
  const s = readSession(st, opts);
  assert.equal(s.name, "x.pergel"); assert.equal(s.hasFile, true); assert.equal(s.clean, true); assert.equal(s.doc.layers.length, 1);
});

test("readSession drops garbage, wrong app, missing text", () => {
  const st = mem();
  assert.equal(readSession(st, opts), null);
  st.setItem(SESSION_KEY, "{nope"); assert.equal(readSession(st, opts), null);
  st.setItem(SESSION_KEY, JSON.stringify({ hasFile: true })); assert.equal(readSession(st, opts), null);
  st.setItem(SESSION_KEY, JSON.stringify({ text: serialize("other", 2, initialData) })); assert.equal(readSession(st, opts), null);
  storeSession(st, { text: serialize("pergel", 2, initialData) }); clearSession(st); assert.equal(readSession(st, opts), null);
});

test("session doc is sanitised on read (hostile colour never survives)", () => {
  const bad = { ...initialData, ink: "red;}</style>" };
  const st = mem();
  storeSession(st, { text: serialize("pergel", 2, bad), name: null, hasFile: false, clean: false });
  assert.match(readSession(st, opts).doc.ink, /^#[0-9a-f]{6}$/i);
});

test("legacy pergel:data migrates into an Untitled session and is removed", () => {
  const local = mem(), session = mem();
  assert.equal(migrateLegacy(local, session, opts), null);
  local.setItem(LEGACY_KEY, JSON.stringify({ app: "pergel", version: 2, savedAt: "x", data: initialData }));
  const m = migrateLegacy(local, session, opts);
  assert.equal(m.name, null); assert.equal(m.clean, false);
  assert.equal(local.getItem(LEGACY_KEY), null);
  assert.equal(readSession(session, opts).name, null);
  local.setItem(LEGACY_KEY, "garbage"); assert.equal(migrateLegacy(local, session, opts), null);
});

test("baseName strips the extension", () => {
  assert.equal(baseName("logo.pergel"), "logo"); assert.equal(baseName("a.JSON"), "a"); assert.equal(baseName(null), "");
});
