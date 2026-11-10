// The open project: name, backing file (File System Access handle), dirty marker, autosave, session memory.
// Decisions are pure (autosave.js, session.js); this is the wiring. Autosave never touches history: a write only moves
// the "saved" marker (`savedDoc`, compared by identity, so undoing back to the saved document is clean again).
import { useEffect, useRef, useState } from "react";
import { parseEnvelope } from "look/kit/envelope.js";
import { toast } from "look/kit/Toasts.jsx";
import { useT } from "look/kit/i18n.js";
import { AUTOSAVE_DELAY, armed, checkBeforeWrite, createDebouncer, judgeDisk, loadAutosavePref, needsLeaveGuard, saveAutosavePref, shouldWrite, statusKind } from "./autosave.js";
import { EXT, serialize, storeSession } from "./session.js";
import { hasFsAccess, pickOpen, pickSave, readHandle, writeHandle } from "./files.js";
import { loadHandle, openRecent, storeHandle } from "./recentsStore.js";

const msg = (e) => (e instanceof Error ? e.message : String(e));

export function useProject({ history, opts, boot, doc, initialData, onLoaded }) {
  const t = useT();
  const fsa = hasFsAccess();
  const [started, setStarted] = useState(!!boot);
  const [name, setName] = useState(boot?.name ?? null);
  const [hasFile, setHasFile] = useState(false);
  const [savedDoc, setSavedDoc] = useState(boot ? (boot.clean ? boot.doc : null) : doc);
  const [enabled, setEnabledState] = useState(loadAutosavePref);
  const [phase, setPhase] = useState("idle");
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(null);
  const [reconnect, setReconnect] = useState(null); // a restored handle waiting for a user gesture
  const lastDisk = useRef(boot?.hasFile ? (boot.disk ?? boot.text) : null);
  const handle = useRef(null);
  const writing = useRef(false);
  const dirty = doc !== savedDoc;
  const gate = { enabled, hasFile, conflict: !!conflict };
  const live = useRef({});
  live.current = { doc, dirty, gate, name, hasFile, t };

  const settle = () => { deb.current.cancel(); setConflict(null); setError(""); setPhase("idle"); setReconnect(null); };
  const markSaved = (d) => { setSavedDoc(d); setSavedAt(new Date()); };

  // ── load a project from file text. `h` = write handle (null: download-only / no permission)
  const load = (text, nm, h) => {
    const data = parseEnvelope(text, opts);
    history.reset(data);
    setSavedDoc(history.getSnapshot().data);
    setName(nm); handle.current = h; lastDisk.current = h ? text : null; setHasFile(!!h); setSavedAt(null);
    void storeHandle(h);
    settle(); setStarted(true); onLoaded(data);
  };
  const fromDisk = (nm, text) => {
    try {
      const data = parseEnvelope(text, opts);
      history.reset(data); setSavedDoc(history.getSnapshot().data); lastDisk.current = text; onLoaded(data);
      return true;
    } catch (e) { toast(`${t("loadFailed")}: ${msg(e)}`); return false; }
  };
  const fail = (e, key) => toast(`${t(key)}: ${msg(e)}`);

  // ── autosave write
  const write = async (force = false) => {
    const L = live.current;
    if (writing.current) return;
    const d = L.doc, text = serialize(opts.app, opts.version, d);
    if (!force && !shouldWrite(L.gate, text, lastDisk.current)) {
      if (armed(L.gate) && text === lastDisk.current) { setSavedDoc(d); setPhase("idle"); }
      return;
    }
    const h = handle.current;
    if (!h) return;
    writing.current = true; setPhase("saving");
    try {
      const disk = force ? null : await readHandle(h);
      const verdict = checkBeforeWrite(disk, text, lastDisk.current, force);
      if (verdict === "conflict") { setConflict({ name: h.name, text: disk }); setPhase("conflict"); return; }
      if (verdict === "write") await writeHandle(h, text);
      lastDisk.current = text; markSaved(d); setError(""); setPhase("idle");
    } catch (e) { setError(msg(e)); setPhase("error"); }
    finally { writing.current = false; if (live.current.doc !== d) deb.current?.schedule(); }
  };
  const writeRef = useRef(write); writeRef.current = write;
  const deb = useRef(null);
  if (!deb.current) deb.current = createDebouncer(() => void writeRef.current(), AUTOSAVE_DELAY);

  const canAuto = armed(gate);
  useEffect(() => {
    if (dirty && canAuto) { if (!writing.current) setPhase("pending"); deb.current.schedule(); }
    else { deb.current.cancel(); setPhase((s) => (s === "pending" ? "idle" : s)); }
  }, [doc, dirty, canAuto]);

  // flush on blur / hide so the last edit is on disk before the user leaves
  useEffect(() => {
    const flush = () => deb.current.flush();
    const vis = () => { if (document.visibilityState === "hidden") flush(); };
    addEventListener("blur", flush); addEventListener("pagehide", flush); document.addEventListener("visibilitychange", vis);
    return () => { removeEventListener("blur", flush); removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", vis); };
  }, []);

  // the file changed on disk: own write = ignore; clean editor = reload; unsaved edits = pause + ask
  const external = (nm, text) => {
    const v = judgeDisk(text, lastDisk.current, live.current.dirty);
    if (v === "own") return;
    if (v === "reload") { if (fromDisk(nm, text)) toast(t("pjReloaded")); }
    else { setConflict({ name: nm, text }); setPhase("conflict"); }
  };
  useEffect(() => {
    if (!fsa) return;
    const onFocus = async () => { const h = handle.current; if (!h || writing.current) return; try { external(h.name, await readHandle(h)); } catch { /* next write reports it */ } };
    addEventListener("focus", onFocus);
    return () => removeEventListener("focus", onFocus);
  }, [fsa]);

  // ── session snapshot: reload keeps the project (sessionStorage), the handle re-binds from IndexedDB
  useEffect(() => {
    if (!started) return;
    const persist = () => {
      const L = live.current, text = serialize(opts.app, opts.version, L.doc);
      storeSession(sessionStorage, { text, name: L.name, hasFile: L.hasFile, clean: !L.dirty, disk: L.hasFile && lastDisk.current !== text ? lastDisk.current : null });
    };
    const id = setTimeout(persist, 400);
    const hide = () => persist();
    addEventListener("pagehide", hide);
    return () => { clearTimeout(id); removeEventListener("pagehide", hide); };
  }, [started, doc, name, hasFile, dirty]);

  const bind = async (h) => {
    try {
      const disk = await readHandle(h);
      handle.current = h; setHasFile(true); setReconnect(null);
      if (lastDisk.current === null) lastDisk.current = disk;
      external(h.name, disk);
    } catch (e) { fail(e, "loadFailed"); }
  };
  useEffect(() => {
    if (!boot?.hasFile) return;
    (async () => {
      const h = await loadHandle();
      if (!h) { lastDisk.current = null; toast(t("pjLinkLost")); return; }
      const q = h.queryPermission ? await h.queryPermission({ mode: "readwrite" }) : "granted";
      if (q === "granted") await bind(h); else setReconnect(h);
    })();
  }, []);

  // ── leave guard (no window.confirm anywhere: this is the browser's own prompt)
  const guard = needsLeaveGuard({ dirty, hasFile, enabled, conflict, phase });
  useEffect(() => {
    if (!guard) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    addEventListener("beforeunload", h);
    return () => removeEventListener("beforeunload", h);
  }, [guard]);

  const base = () => (live.current.name || "untitled").replace(/\.(pergel|json)$/i, "");
  const api = {
    started, name, hasFile, dirty, enabled, fsa, reconnect: !!reconnect, conflict, phase, savedAt, error,
    kind: statusKind({ supported: fsa, enabled, hasFile, conflict: !!conflict, phase, reconnect: !!reconnect }),
    setEnabled: (on) => { saveAutosavePref(on); setEnabledState(on); },
    newProject: () => {
      history.reset(initialData); setSavedDoc(history.getSnapshot().data);
      setName(null); handle.current = null; lastDisk.current = null; setHasFile(false); setSavedAt(null);
      void storeHandle(null); settle(); setStarted(true); onLoaded(initialData);
    },
    open: async () => {
      try {
        const r = await pickOpen((n) => toast(t("pjPermNote", { name: n })));
        if (!r) return;
        load(r.text, r.name, r.handle);
        toast(t("loaded"));
      } catch (e) { fail(e, "loadFailed"); }
    },
    openRecent: async (id) => {
      try {
        const r = await openRecent(id);
        load(r.text, r.name, r.handle);
      } catch (e) { toast(t("pjRecentGone")); }
    },
    save: async (as = false) => {
      const d = live.current.doc, text = serialize(opts.app, opts.version, d);
      try {
        if (handle.current && !as) {
          await writeHandle(handle.current, text);
          lastDisk.current = text; settle(); markSaved(d); toast(t("saved"));
          return;
        }
        const r = await pickSave(text, `${base()}${EXT}`);
        if (!r) return;
        setName(r.name); handle.current = r.handle; lastDisk.current = r.handle ? text : null; setHasFile(!!r.handle);
        void storeHandle(r.handle); settle(); markSaved(d); toast(t("saved"));
      } catch (e) { fail(e, "pjSaveFailed"); }
    },
    keepMine: () => { setConflict(null); setPhase("idle"); void write(true); },
    loadDisk: () => { const c = conflict; if (c && fromDisk(c.name, c.text)) settle(); },
    reconnectNow: async () => {
      const h = reconnect;
      try { if (h && (await h.requestPermission({ mode: "readwrite" })) === "granted") await bind(h); else toast(t("pjReadOnly")); } catch (e) { fail(e, "loadFailed"); }
    },
  };
  return api;
}
