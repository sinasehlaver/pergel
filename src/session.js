// Project file text + page-reload memory. Pure: storages are passed in (sessionStorage / localStorage), so node:test covers them.
// A `.pergel` file is the kit envelope, pretty-printed WITHOUT a timestamp so equal documents give equal bytes
// (autosave compares text against what is on disk).
import { parseEnvelope } from "look/kit/envelope.js";

export const SESSION_KEY = "pergel:session";
export const LEGACY_KEY = "pergel:data"; // pre-projects localStorage autosave, migrated once into the session
export const EXT = ".pergel";

export const serialize = (app, version, data) => JSON.stringify({ app, version, data }, null, 2);

/** Display name: file name without the extension, or null for untitled. */
export const baseName = (name) => (name ? name.replace(/\.(pergel|json)$/i, "") : "");

/** Never throws (quota / blocked storage just means no restore). */
export function storeSession(st, s) {
  try { st.setItem(SESSION_KEY, JSON.stringify({ text: s.text, name: s.name ?? null, hasFile: !!s.hasFile, clean: !!s.clean, ...(s.disk != null ? { disk: s.disk } : {}) })); return true; } catch { return false; }
}
export function clearSession(st) { try { st.removeItem(SESSION_KEY); } catch { /* ignore */ } }

/** Same parseEnvelope + sanitize gate as any Open; anything unparsable is dropped. -> {doc,text,name,hasFile,clean,disk} | null */
export function readSession(st, opts) {
  try {
    const raw = st.getItem(SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.text !== "string") return null;
    return {
      doc: parseEnvelope(o.text, opts), text: o.text,
      name: typeof o.name === "string" ? o.name.slice(0, 300) : null,
      hasFile: o.hasFile === true, clean: o.clean === true, disk: typeof o.disk === "string" ? o.disk : null,
    };
  } catch { return null; }
}

/**
 * First load after the update: an old localStorage `pergel:data` doc becomes the session's Untitled project (and is
 * removed), so nobody loses a drawing. Returns the session or null.
 */
export function migrateLegacy(local, session, opts) {
  try {
    const raw = local.getItem(LEGACY_KEY);
    if (!raw) return null;
    const doc = parseEnvelope(raw, opts);
    local.removeItem(LEGACY_KEY);
    const text = serialize(opts.app, opts.version, doc);
    storeSession(session, { text, name: null, hasFile: false, clean: false });
    return { doc, text, name: null, hasFile: false, clean: false, disk: null };
  } catch { return null; }
}
