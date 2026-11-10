// Start-page "recent projects": pure list logic (storage lives in recentsStore.js).
export const MAX_RECENTS = 8;

/** Newest first, one entry per id (re-adding moves it to the top), capped. */
export function addRecent(list, entry, max = MAX_RECENTS) {
  return [entry, ...list.filter((r) => r.id !== entry.id)].slice(0, max);
}
export const removeRecent = (list, id) => list.filter((r) => r.id !== id);

/** Drops anything malformed (stored data is untrusted), newest first, capped. */
export function cleanRecents(raw, max = MAX_RECENTS) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const { id, name, at } = r;
    if (typeof id !== "string" || !id || typeof name !== "string" || typeof at !== "number" || !Number.isFinite(at)) continue;
    if (!out.some((x) => x.id === id)) out.push({ id, name: name.slice(0, 300), at });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, max);
}
