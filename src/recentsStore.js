// IndexedDB `pergel` : `handles` (the current project's handle, re-bound after a reload) and `recents`
// (start-page list: key = id, value = {id,name,at,handle}). Best effort: handles that cannot be cloned are skipped.
import { addRecent, cleanRecents, MAX_RECENTS } from "./recents.js";

const DB = "pergel", HANDLES = "handles", RECENTS = "recents", CURRENT = "current";
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { for (const n of [HANDLES, RECENTS]) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx(store, mode, run) {
  const db = await idb();
  try {
    return await new Promise((res, rej) => {
      const r = run(db.transaction(store, mode).objectStore(store));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } finally { db.close(); }
}
const rows = async () => ((await tx(RECENTS, "readonly", (s) => s.getAll())) || []).filter((r) => r && r.handle && typeof r.id === "string").sort((a, b) => b.at - a.at);

/** h = null forgets the current one. */
export async function storeHandle(h) {
  try {
    if (!h) { await tx(HANDLES, "readwrite", (s) => s.delete(CURRENT)); return; }
    await tx(HANDLES, "readwrite", (s) => s.put(h, CURRENT));
    await addRecentHandle(h);
  } catch { /* ignore */ }
}
export async function loadHandle() { try { return (await tx(HANDLES, "readonly", (s) => s.get(CURRENT))) ?? null; } catch { return null; } }

export async function addRecentHandle(h) {
  try {
    if (!h || typeof h.name !== "string") return;
    const all = await rows();
    let id = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    for (const r of all) { try { if (r.handle.isSameEntry && await r.handle.isSameEntry(h)) { id = r.id; break; } } catch { /* ignore */ } }
    const next = addRecent(all, { id, name: h.name, at: Date.now() }, MAX_RECENTS);
    const keep = new Set(next.map((r) => r.id));
    for (const r of all) if (!keep.has(r.id)) await tx(RECENTS, "readwrite", (s) => s.delete(r.id));
    await tx(RECENTS, "readwrite", (s) => s.put({ id, name: h.name, at: Date.now(), handle: h }, id));
  } catch { /* ignore */ }
}
/** null = unavailable (no IndexedDB). */
export async function listRecents() {
  if (typeof indexedDB === "undefined") return null;
  try { return cleanRecents((await rows()).map(({ id, name, at }) => ({ id, name, at }))); } catch { return []; }
}
export async function forgetRecent(id) { try { await tx(RECENTS, "readwrite", (s) => s.delete(id)); } catch { /* ignore */ } }
/** Opens one via its handle (permission asked on the user's click). Failure forgets the entry and throws. */
export async function openRecent(id) {
  try {
    const row = await tx(RECENTS, "readonly", (s) => s.get(id));
    if (!row?.handle) throw new Error("not in the list");
    const h = row.handle;
    const had = h.queryPermission ? await h.queryPermission({ mode: "readwrite" }) : "granted";
    const perm = had === "granted" || !h.requestPermission ? "granted" : await h.requestPermission({ mode: "readwrite" });
    const f = await h.getFile();
    return { name: f.name, text: await f.text(), handle: perm === "granted" ? h : null };
  } catch (e) { await forgetRecent(id); throw e; }
}
