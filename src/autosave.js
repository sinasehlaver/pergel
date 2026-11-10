// Autosave decisions, pure (no React/DOM): when to write, when a write is a no-op, what a change on disk means,
// what the status chip says. `useProject.js` wires these to the File System Access API.
// The preference lives in localStorage (app chrome), never in the .pergel file.

/** Quiet time after the last edit before the file is written. */
export const AUTOSAVE_DELAY = 1000;

/** Autosave is armed only with a backing file, the preference on and no unresolved conflict. */
export const armed = (g) => !!(g.enabled && g.hasFile && !g.conflict);

/** Write iff armed and the content differs from what we last wrote/read (`lastDisk` null = unknown -> write). */
export const shouldWrite = (g, text, lastDisk) => armed(g) && text !== lastDisk;

/**
 * What a change of the file on disk means: same bytes as ours = our own write (ignore); different and no unsaved
 * edits = safe to reload; different while we hold unsaved edits = conflict (never overwrite silently).
 */
export const judgeDisk = (disk, lastDisk, unsaved) => (disk === lastDisk ? "own" : unsaved ? "conflict" : "reload");

/** Write decision against the file as it is now (browser path): refuse when it is not what we last saw. */
export const checkBeforeWrite = (disk, text, lastDisk, force) => {
  if (force) return "write";
  if (lastDisk !== null && disk !== lastDisk) return "conflict";
  return disk === text ? "same" : "write";
};

export function createDebouncer(fn, ms = AUTOSAVE_DELAY, timers = globalThis) {
  let id = null;
  const clear = () => { if (id !== null) { timers.clearTimeout(id); id = null; } };
  return {
    schedule() { clear(); id = timers.setTimeout(() => { id = null; fn(); }, ms); },
    cancel: clear,
    flush() { if (id !== null) { clear(); fn(); } },
    pending: () => id !== null,
  };
}

/**
 * Chip state: `kind` drives colour and `data-state`: unsupported | off | nofile | pending | saving | saved | error | conflict.
 * `in`: {supported, enabled, hasFile, conflict, phase: idle|pending|saving|error|conflict, reconnect}.
 */
export function statusKind(s) {
  if (!s.supported) return "unsupported";
  if (s.conflict || s.phase === "conflict") return "conflict";
  if (s.reconnect) return "reconnect";
  if (!s.enabled) return "off";
  if (!s.hasFile) return "nofile";
  if (s.phase === "error") return "error";
  if (s.phase === "saving") return "saving";
  if (s.phase === "pending") return "pending";
  return "saved";
}

/** Leave the page only after asking when the work could be lost: untitled with changes, autosave off, conflict, error. */
export const needsLeaveGuard = ({ dirty, hasFile, enabled, conflict, phase }) => !!dirty && (!hasFile || !enabled || !!conflict || phase === "error" || phase === "conflict");

const KEY = "pergel:autosave";
/** Preference: on unless the user turned it off. */
export const loadAutosavePref = (st = globalThis.localStorage) => { try { return st.getItem(KEY) !== "off"; } catch { return true; } };
export const saveAutosavePref = (on, st = globalThis.localStorage) => { try { st.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ } };
