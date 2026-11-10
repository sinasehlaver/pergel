import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { config, initialData, migrate } from "./config.js";
import { createHistory } from "look/kit/history.js";
import { readSession, migrateLegacy } from "./session.js";
import { useProject } from "./useProject.js";
import { ProjectBar } from "./ProjectBar.jsx";
import { StartPage } from "./StartPage.jsx";
import { usePrefs, setPrefs } from "look/kit/prefs.js";
import { useT, extendDict } from "look/kit/i18n.js";
import { useShortcuts } from "look/kit/shortcuts.js";
import { toast, Toasts } from "look/kit/Toasts.jsx";
import { syncDoc, setMirror } from "./geom/mirror.js";
import { Navbar } from "look/kit/Navbar.jsx";
import { Panel } from "look/kit/Panel.jsx";
import { Palette } from "look/kit/Palette.jsx";
import { Settings } from "look/kit/Settings.jsx";
import { Tooltip, tip, keyLabel } from "look/kit/Tooltip.jsx";
import { DialogHost } from "look/kit/Dialog.jsx";
import { ColorPicker } from "./ColorPicker.jsx";
import { ExportDialog } from "./ExportDialog.jsx";
import { Sheet, newId } from "./Sheet.jsx";
import { arrange } from "./geom/arrange.js";
import { phiPreset } from "./geom/preset.js";
import { exportSVG, activeLayer, mapLayer, allCircles, countFills, MAX_UNDERLAY, MAX_LAYERS, MAX_NAME, MAX_FRAME, fitFrame } from "./geom/doc.js";
import { strings } from "./strings.js";
import "./app.css";

extendDict(strings);
const opts = { app: config.appId, version: config.version, migrate };

// A reload keeps the project: the session snapshot (or an old localStorage autosave, migrated once) seeds the history.
const boot = readSession(sessionStorage, opts) ?? migrateLegacy(localStorage, sessionStorage, opts);
const history = createHistory(boot?.doc ?? initialData);

const TABS = [{ id: "home", label: "sheetTab" }];
// One shortcut table: cheat-sheet, palette hints and tooltips are built from it.
const KEYS = [["c", "compass"], ["i", "inkMode"], ["s", "toggleSnap"], ["h", "toggleGuides"], ["mod+z", "undo"], ["mod+shift+z", "redo"], ["mod+s", "save"], ["mod+shift+s", "saveAs"], ["mod+o", "open"],
  ["mod+e", "exportMark"], ["mod+shift+e", "exportSheet"], ["mod+a", "selectAll"], ["mod+d", "duplicate"], ["backspace", "delete"],
  ["arrowleft", "nudge"], ["0", "fitView"], ["r", "reveal"], ["mod+k", "palette"], ["escape", "clearSel"], ["?", "shortcuts"]];

function useHash() {
  const read = () => location.hash.replace(/^#\/?/, "") || "home";
  return useSyncExternalStore((f) => (addEventListener("hashchange", f), () => removeEventListener("hashchange", f)), read);
}

// Centre the drawing in the sheet area, leaving margin; empty doc = origin in the middle.
function fit(frame, el) {
  const w = el?.clientWidth || 800, h = el?.clientHeight || 600;
  const z = Math.min(1, Math.max(0.05, 0.9 * Math.min(w / frame.w, h / frame.h)));
  return { z, x: w / 2 - (frame.x + frame.w / 2) * z, y: h / 2 - (frame.y + frame.h / 2) * z };
}

export default function App() {
  const t = useT();
  const { lang } = usePrefs();
  const snap = useSyncExternalStore(history.subscribe, history.getSnapshot);
  const doc = snap.data;
  const route = useHash();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [expOpen, setExpOpen] = useState(null); // null | "mark" | "sheet"
  const [mode, setMode] = useState("compass");
  const [showGuides, setShowGuides] = useState(() => { try { return localStorage.getItem("pergel:guides") !== "0"; } catch { return true; } });
  const toggleGuides = () => setShowGuides((v) => { try { localStorage.setItem("pergel:guides", v ? "0" : "1"); } catch {} return !v; });
  const [sel, setSel] = useState(new Set());
  const [view, setView] = useState(null);
  const layer = activeLayer(doc);
  const arr = useMemo(() => arrange(layer.circles), [layer.circles]);
  const editable = !layer.locked && layer.visible;
  const [renaming, setRenaming] = useState(null);

  const go = (r) => { location.hash = r === "home" ? "" : `/${r}`; };
  const canBack = route !== "home";
  const back = () => go("home");
  const commit = (fn) => history.set((d) => syncDoc(fn(d), d)); // mirrored layers re-twin in the same undo step
  const area = () => document.querySelector(".stage");
  useEffect(() => { if (route === "home" && !view) setView(fit(doc.frame, area())); }, [route, view, doc.layers]);

  const proj = useProject({ history, opts, boot, doc, initialData, onLoaded: (data) => { setSel(new Set()); setView(area() ? fit(data.frame, area()) : null); } });
  const save = () => proj.save(false), saveAs = () => proj.save(true), open = proj.open;
  const doExport = (sheet) => {
    if (!sheet && !countFills(doc)) return toast(t("nothingInked"));
    setExpOpen(sheet ? "sheet" : "mark");
  };
  const reset = () => { history.set(initialData); setSel(new Set()); setView(null); };

  const selected = layer.circles.filter((c) => sel.has(c.id));
  const onLayer = (fn) => commit((d) => mapLayer(d, fn));
  const del = () => {
    if (!sel.size || !editable) return;
    const n = sel.size;
    onLayer((l) => ({ ...l, circles: l.circles.filter((c) => !sel.has(c.id)) }));
    setSel(new Set());
    toast(t(n === 1 ? "circleDeleted" : "circlesDeleted", { n }), { action: { label: t("undo"), run: history.undo } });
  };
  const setAxis = (axis) => {
    if (!editable) return;
    const c = selected[0] ?? layer.circles[0];
    commit((d) => mapLayer(d, (l) => setMirror(l, axis && { axis, x: l.mirror?.x ?? (c ? c.cx : 0), y: l.mirror?.y ?? (c ? c.cy : 0) })));
    setSel(new Set());
  };
  const moveAxis = (m) => editable && commit((d) => mapLayer(d, (l) => setMirror(l, m)));
  const dup = () => {
    if (!sel.size || !editable) return;
    const copies = selected.map(({ mirrorOf, mirrorAx, ...c }) => ({ ...c, id: newId(), cx: c.cx + 24, cy: c.cy + 24 }));
    onLayer((l) => ({ ...l, circles: [...l.circles, ...copies] }));
    setSel(new Set(copies.map((c) => c.id)));
  };
  const nudge = (dx, dy) => sel.size && editable && onLayer((l) => ({ ...l, circles: l.circles.map((c) => (sel.has(c.id) ? { ...c, cx: c.cx + dx, cy: c.cy + dy } : c)) }));
  const setNum = (key, v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || (key === "r" && n <= 0) || Math.abs(n) > 1e6) return;
    if (editable) onLayer((l) => ({ ...l, circles: l.circles.map((c) => (sel.has(c.id) ? { ...c, [key]: n } : c)) }));
  };
  const toggleSnap = () => commit((d) => ({ ...d, snap: { ...d.snap, on: !d.snap.on } }));
  const home = route === "home";

  // ── construction reveal: chrome + circles fade, the mark stays centred; again (or Esc) reverses
  const [reveal, setReveal] = useState(false);
  const savedView = useRef(null);
  const toggleReveal = () => {
    if (!home) return;
    if (reveal) { if (savedView.current) setView(savedView.current); setReveal(false); return; }
    savedView.current = view;
    setView(fit(doc.frame, area()));
    setReveal(true);
  };

  // ── golden-ratio circle set as a new layer (one undo step)
  const addPhi = () => {
    if (doc.layers.length >= MAX_LAYERS) return toast(t("layerLimit"));
    const el = area(), v = view ?? { x: 0, y: 0, z: 1 };
    const cx = ((el?.clientWidth || 800) / 2 - v.x) / v.z, cy = ((el?.clientHeight || 600) / 2 - v.y) / v.z;
    const circles = phiPreset(doc.base ?? 100, cx, cy, () => newId());
    const id = `l${newId()}`;
    commit((d) => ({ ...d, active: id, layers: [...d.layers, { id, name: t("phiPresetName"), visible: true, locked: false, circles, fills: [] }] }));
    setSel(new Set());
  };

  // ── trace-over image
  const [adjust, setAdjust] = useState(false);
  const un = doc.underlay;
  const setUnder = (patch) => commit((d) => (d.underlay ? { ...d, underlay: { ...d.underlay, ...patch } } : d));
  const pickImage = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return toast(t("underlayBad"));
    if (file.size > MAX_UNDERLAY) return toast(t("underlayBig"));
    const rd = new FileReader();
    rd.onload = () => {
      const src = String(rd.result);
      const im = new Image();
      const place = (nw, nh) => {
        const w = 400, h = Math.max(1, (400 * nh) / nw);
        const el = area(), v = view ?? { x: 0, y: 0, z: 1 };
        const cx = ((el?.clientWidth || 800) / 2 - v.x) / v.z, cy = ((el?.clientHeight || 600) / 2 - v.y) / v.z;
        commit((d) => ({ ...d, underlay: { src, x: cx - w / 2, y: cy - h / 2, w, h, opacity: 0.4, visible: true, locked: false } }));
      };
      im.onload = () => place(im.naturalWidth || 400, im.naturalHeight || 400);
      im.onerror = () => toast(t("underlayBad"));
      im.src = src;
    };
    rd.readAsDataURL(file);
  };
  const removeUnder = () => { setAdjust(false); commit((d) => { const { underlay, ...rest } = d; return rest; }); toast(t("underlayRemoved"), { action: { label: t("undo"), run: history.undo } }); };
  // scale % is relative to the 400-unit width a freshly opened image gets; scales about its centre
  const scalePct = un ? Math.round((un.w / 400) * 100) : 100;
  const scaleUnder = (pct) => {
    const n = Number(pct);
    if (!un || !Number.isFinite(n) || n < 5 || n > 2000) return;
    const k = (n * 4) / un.w;
    setUnder({ w: un.w * k, h: un.h * k, x: un.x + (un.w - un.w * k) / 2, y: un.y + (un.h - un.h * k) / 2 });
  };

  useShortcuts({
    "mod+z": history.undo, "mod+shift+z": history.redo, "mod+s": save, "mod+shift+s": saveAs, "mod+o": open,
    "mod+e": () => doExport(false), "mod+shift+e": () => doExport(true),
    "mod+k": () => setPalette((p) => !p),
    h: () => home && toggleGuides(), s: () => home && toggleSnap(), c: () => home && setMode("compass"), i: () => home && setMode("ink"),
    "mod+a": () => home && editable && setSel(new Set(layer.circles.map((c) => c.id))),
    "mod+d": () => home && dup(), backspace: () => home && del(), delete: () => home && del(),
    arrowleft: () => nudge(-1, 0), arrowright: () => nudge(1, 0), arrowup: () => nudge(0, -1), arrowdown: () => nudge(0, 1),
    "shift+arrowleft": () => nudge(-10, 0), "shift+arrowright": () => nudge(10, 0), "shift+arrowup": () => nudge(0, -10), "shift+arrowdown": () => nudge(0, 10),
    0: () => home && setView(fit(doc.frame, area())),
    r: () => toggleReveal(),
    escape: () => { if (reveal) toggleReveal(); else if (palette) setPalette(false); else if (help) setHelp(false); else if (sel.size) setSel(new Set()); else if (canBack) back(); },
    "?": () => setHelp(true),
  });

  const hint = (id) => { const k = KEYS.find(([, a]) => a === id); return k && keyLabel(k[0]); };
  const cmd = (id, run) => ({ id, label: t(id), hint: hint(id), run });
  const commands = [
    cmd("toggleSnap", toggleSnap), cmd("compass", () => setMode("compass")), cmd("inkMode", () => setMode("ink")), cmd("toggleGuides", toggleGuides), cmd("reveal", toggleReveal), cmd("phiPreset", addPhi),
    cmd("exportMark", () => doExport(false)), cmd("exportSheet", () => doExport(true)),
    cmd("undo", history.undo), cmd("redo", history.redo), cmd("save", save), cmd("saveAs", saveAs), cmd("newProject", proj.newProject), cmd("open", open), cmd("fitView", () => setView(fit(doc.frame, area()))),
    { id: "settings", label: t("settings"), run: () => go("settings") },
    { id: "theme", label: `${t("theme")}: ${t("dark")}`, run: () => setPrefs({ theme: "dark" }) },
    { id: "theme2", label: `${t("theme")}: ${t("light")}`, run: () => setPrefs({ theme: "light" }) },
    { id: "theme3", label: `${t("theme")}: ${t("system")}`, run: () => setPrefs({ theme: "system" }) },
    cmd("shortcuts", () => setHelp(true)),
  ];

  const inked = layer.fills.length;

  // ── layers (first = bottom; the panel lists top first)
  const setActive = (id) => { if (id !== doc.active) { commit((d) => ({ ...d, active: id })); setSel(new Set()); } };
  const addLayer = () => {
    if (doc.layers.length >= MAX_LAYERS) return toast(t("layerLimit"));
    const id = `l${newId()}`;
    commit((d) => ({ ...d, active: id, layers: [...d.layers, { id, name: t("layerN", { n: d.layers.length + 1 }), visible: true, locked: false, circles: [], fills: [] }] }));
    setSel(new Set());
  };
  const delLayer = (id) => {
    if (doc.layers.length < 2) return toast(t("layerLast"));
    commit((d) => {
      const layers = d.layers.filter((l) => l.id !== id);
      return { ...d, layers, active: d.active === id ? layers[layers.length - 1].id : d.active };
    });
    setSel(new Set());
    toast(t("layerDeleted"), { action: { label: t("undo"), run: history.undo } });
  };
  const moveLayer = (id, dir) => commit((d) => {
    const i = d.layers.findIndex((l) => l.id === id), j = i + dir;
    if (j < 0 || j >= d.layers.length) return d;
    const layers = [...d.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    return { ...d, layers };
  });
  const flag = (id, key) => { commit((d) => mapLayer(d, (l) => ({ ...l, [key]: !l[key] }), id)); setSel(new Set()); };
  const rename = (id, v) => {
    setRenaming(null);
    const name = v.replace(/[<>&"']/g, "").trim().slice(0, MAX_NAME);
    if (name) commit((d) => mapLayer(d, (l) => ({ ...l, name }), id));
  };
  const usedColours = [...new Set(layer.fills.map((f) => f.color))];
  const docColours = [...new Set(doc.layers.flatMap((l) => l.fills.map((f) => f.color)))];
  const [recFrom, setRecFrom] = useState(null);
  const recolour = () => {
    const n = layer.fills.filter((f) => f.color === recFrom).length;
    onLayer((l) => ({ ...l, fills: l.fills.map((f) => (f.color === recFrom ? { ...f, color: doc.ink } : f)) }));
    setRecFrom(null); toast(t("recoloured", { n }));
  };
  const setFrame = (f) => commit((d) => ({ ...d, frame: f }));
  const setFrameSize = (k, n) => setFrame({ ...doc.frame, [k]: n });
  const bgOn = doc.bg !== "transparent";
  const mixed = (k) => (selected.every((c) => c[k] === selected[0][k]) ? Math.round(selected[0][k] * 10) / 10 : "");

  const leftPane = (
    <div className="tools">
      <section className="tool-sec">
        <h3>{t("layers")}</h3>
        <ul className="layers" aria-label={t("layers")}>
          {[...doc.layers].reverse().map((l) => {
            const i = doc.layers.indexOf(l);
            return (
              <li key={l.id} className={`layer ${l.id === doc.active ? "on" : ""} ${l.visible ? "" : "off"}`} data-layer={l.id} aria-current={l.id === doc.active}>
                <button type="button" className="icon-btn" aria-pressed={l.visible} aria-label={t(l.visible ? "hideLayer" : "showLayer")} data-tip={t(l.visible ? "hideLayer" : "showLayer")} onClick={() => flag(l.id, "visible")}>{l.visible ? "◉" : "○"}</button>
                <button type="button" className="icon-btn" aria-pressed={l.locked} aria-label={t(l.locked ? "unlockLayer" : "lockLayer")} data-tip={t(l.locked ? "unlockLayer" : "lockLayer")} onClick={() => flag(l.id, "locked")}>{l.locked ? "🔒" : "🔓"}</button>
                {renaming === l.id ? (
                  <input className="input layer-name" autoFocus defaultValue={l.name} maxLength={MAX_NAME} aria-label={t("renameLayer")}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.currentTarget.value = l.name; e.currentTarget.blur(); } }}
                    onBlur={(e) => rename(l.id, e.target.value)} />
                ) : (
                  <button type="button" className="layer-pick" onClick={() => setActive(l.id)} onDoubleClick={() => setRenaming(l.id)} data-tip={t("layerPickTip")}>{l.name}</button>
                )}
                <button type="button" className="icon-btn" aria-label={t("renameLayer")} data-tip={t("renameLayer")} onClick={() => setRenaming(l.id)}>✎</button>
                <button type="button" className="icon-btn" aria-label={t("layerUp")} data-tip={t("layerUp")} disabled={i === doc.layers.length - 1} onClick={() => moveLayer(l.id, 1)}>↑</button>
                <button type="button" className="icon-btn" aria-label={t("layerDown")} data-tip={t("layerDown")} disabled={i === 0} onClick={() => moveLayer(l.id, -1)}>↓</button>
                <button type="button" className="icon-btn" aria-label={t("deleteLayer")} data-tip={t("deleteLayer")} disabled={doc.layers.length < 2} onClick={() => delLayer(l.id)}>✕</button>
              </li>
            );
          })}
        </ul>
        <button className="btn btn-soft" onClick={addLayer}>{t("addLayer")}</button>
        {!editable && <p className="muted small">{t(layer.locked ? "layerLockedHint" : "layerHiddenHint")}</p>}
      </section>

      <section className="tool-sec">
        <h3>{t("inkColour")}</h3>
        <div className="ink-row">
          <ColorPicker docColors={docColours} value={doc.ink} label={t("inkColour")} onChange={(ink) => commit((d) => ({ ...d, ink }))} />
          <span className="mono muted">{doc.ink}</span>
        </div>
        {usedColours.length > 0 && (
          <div className="recolour">
            <span className="muted small" title={t("recolourHint")}>{t("recolour")}</span>
            <div className="cp-dots" role="radiogroup" aria-label={t("recolour")}>
              {usedColours.map((c) => <button key={c} type="button" role="radio" aria-checked={c === recFrom} className="cp-dot" style={{ background: c }} aria-label={c} data-tip={c} onClick={() => setRecFrom(c === recFrom ? null : c)} />)}
            </div>
            <button type="button" className="btn btn-soft recolour-btn" disabled={!recFrom || recFrom === doc.ink} onClick={recolour}>{t("recolourBtn")}</button>
          </div>
        )}
      </section>

      <section className="tool-sec">
        <h3>{selected.length ? t("selected", { n: selected.length }) : t("noSelection")}</h3>
        {selected.length > 0 ? (
          <div className="dims">
            {["cx", "cy", "r"].map((k) => (
              <label key={`${k}-${[...sel].join()}-${mixed(k)}`} className="dim">
                <span className="mono">{k === "r" ? "r" : k.slice(1)}</span>
                <input className="input mono" inputMode="decimal" defaultValue={mixed(k)} placeholder={t("mixed")} aria-label={k}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}
                  onBlur={(e) => e.target.value !== "" && e.target.value != mixed(k) && setNum(k, e.target.value)} />
              </label>
            ))}
            <div className="row-btns">
              <button className="btn btn-soft" onClick={dup} data-tip={tip(t("duplicate"), "mod+d")}>{t("duplicate")}</button>
              <button className="btn btn-ghost btn-danger" onClick={del} data-tip={tip(t("delete"), "backspace")}>{t("delete")}</button>
            </div>
          </div>
        ) : <p className="muted small">{t("selectHint")}</p>}
      </section>

      <section className="tool-sec mirror-sec">
        <h3>{t("mirrorTitle")}</h3>
        <div className="seg" role="radiogroup" aria-label={t("mirrorTitle")}>
          {[["off", null], ["v", "v"], ["h", "h"], ["both", "both"]].map(([k, axis]) => {
            const on = (layer.mirror?.axis ?? null) === axis;
            return <button key={k} type="button" role="radio" aria-checked={on} className={`seg-btn mirror-${k}`} disabled={!editable} aria-label={t(`mirror_${k}`)} data-tip={t(`mirror_${k}`)} onClick={() => !on && setAxis(axis)}>{t(k === "v" || k === "h" ? `mirrorShort_${k}` : `mirror_${k}`)}</button>;
          })}
        </div>
        {layer.mirror && (
          <div className="stack">
            <div className="under-row">
              {[["x", layer.mirror.axis !== "h"], ["y", layer.mirror.axis !== "v"]].map(([k, show]) => show && (
                <label key={`${k}-${layer.mirror[k]}`} className="dim"><span className="mono">{k}</span>
                  <input className="input mono" inputMode="decimal" defaultValue={Math.round(layer.mirror[k] * 100) / 100} aria-label={t("mirrorPos", { k })}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}
                    onBlur={(e) => { const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n) && Math.abs(n) <= 1e6) moveAxis({ ...layer.mirror, [k]: n }); }} /></label>
              ))}
            </div>
            <button type="button" className="btn btn-soft mirror-centre" disabled={selected.length !== 1} onClick={() => moveAxis({ ...layer.mirror, x: selected[0].cx, y: selected[0].cy })}>{t("mirrorThrough")}</button>
          </div>
        )}
        <p className="muted small">{t("mirrorHint")}</p>
      </section>

      <p className="tally mono">{t("tally", { c: arr.circles.length, f: arr.faces.length, i: inked })}</p>
    </div>
  );

  const rightPane = (
    <div className="tools">
      <section className="tool-sec canvas-sec">
        <h3>{t("frameSize")}</h3>
        <div className="under-row">
          {[["w", doc.frame.w], ["h", doc.frame.h]].map(([k, v]) => (
            <label key={`${k}-${v}`} className="dim"><span className="mono">{k === "w" ? "W" : "H"}</span>
              <input className={`input mono frame-in-${k}`} inputMode="numeric" defaultValue={v} aria-label={t(k === "w" ? "frameW" : "frameH")}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}
                onBlur={(e) => { const n = Math.round(Number(e.target.value)); if (e.target.value !== "" && Number.isFinite(n) && n >= 1 && n <= MAX_FRAME) { if (n !== v) setFrameSize(k, n); } else e.target.value = v; }} /></label>
          ))}
          <span className="muted small">px</span>
        </div>
        <div className="cp-dots frame-presets">
          {[[512, 512], [1024, 1024], [420, 640], [1920, 1080]].map(([w, h]) => <button key={`${w}x${h}`} type="button" className="btn btn-soft frame-preset" onClick={() => setFrame({ ...doc.frame, w, h })}>{w === h ? `${w}²` : `${w}×${h}`}</button>)}
        </div>
        <button type="button" className="btn btn-soft frame-fit" onClick={() => setFrame(fitFrame(allCircles(doc)))}>{t("frameFit")}</button>
        <p className="muted small">{t("frameHint")}</p>
      </section>

      <section className="tool-sec">
        <h3>{t("canvasBg")}</h3>
        <div className="seg" role="radiogroup" aria-label={t("canvasBg")} style={{ "--i": bgOn ? 1 : 0, "--n": 2 }}>
          <span className="seg-thumb" aria-hidden />
          <button type="button" role="radio" aria-checked={!bgOn} className="seg-btn bg-transparent" onClick={() => commit((d) => ({ ...d, bg: "transparent" }))}>{t("bgTransparent")}</button>
          <button type="button" role="radio" aria-checked={bgOn} className="seg-btn bg-colour" onClick={() => !bgOn && commit((d) => ({ ...d, bg: "#ffffff" }))}>{t("bgColour")}</button>
        </div>
        {bgOn && (
          <div className="ink-row">
            <ColorPicker alpha docColors={docColours} value={doc.bg} label={t("canvasBg")} onChange={(bg) => commit((d) => ({ ...d, bg }))} />
            <span className="mono muted">{doc.bg}</span>
          </div>
        )}
        <p className="muted small">{t("bgHint")}</p>
      </section>

      <section className="tool-sec snap-sec">
        <h3>{t("snap")}</h3>
        <label className="snap-chk"><input type="checkbox" className="snap-master" checked={doc.snap.on} onChange={toggleSnap} />{t("snapOn")} <kbd>S</kbd></label>
        <div className="snap-grid">
          {Object.keys(doc.snap.kinds).map((k) => (
            <label key={k} className="snap-chk"><input type="checkbox" data-kind={k} disabled={!doc.snap.on} checked={doc.snap.kinds[k]}
              onChange={() => commit((d) => ({ ...d, snap: { ...d.snap, kinds: { ...d.snap.kinds, [k]: !d.snap.kinds[k] } } }))} />{t(`snap_${k}`)}</label>
          ))}
        </div>
        <div className="snap-base">
          <span className="muted small">{t("baseRadius")}</span>
          <input key={doc.base} className="input mono" inputMode="decimal" defaultValue={doc.base} aria-label={t("baseRadius")}
            onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n <= 1e6) commit((d) => ({ ...d, base: n })); else e.target.value = doc.base; }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }} />
          <button type="button" className="btn btn-soft" disabled={selected.length !== 1} onClick={() => commit((d) => ({ ...d, base: selected[0].r }))}>{t("baseFromSel")}</button>
        </div>
        <p className="muted small">{t("snapHint")}</p>
      </section>

      <section className="tool-sec">
        <h3>{t("underlayTitle")}</h3>
        <div className="stack">
          <label className="btn btn-soft" data-tip={t("underlayHint")}>
            {t("underlayOpen")}
            <input type="file" className="underlay-input" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {un && (<>
            <label className="under-row"><span className="small">{t("underlayOpacity")}</span>
              <input type="range" min="0" max="1" step="0.05" value={un.opacity} aria-label={t("underlayOpacity")} onChange={(e) => setUnder({ opacity: Number(e.target.value) })} /></label>
            <div className="under-row">
              {[["x", un.x], ["y", un.y]].map(([k, v]) => (
                <label key={`${k}-${Math.round(v)}`} className="dim"><span className="mono">{k}</span>
                  <input className="input mono" inputMode="decimal" defaultValue={Math.round(v)} aria-label={`image ${k}`}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}
                    onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && Math.abs(n) <= 1e6 && n !== Math.round(v)) setUnder({ [k]: n }); }} /></label>
              ))}
              <label className="dim"><span className="small">{t("underlayScale")}</span>
                <input key={scalePct} className="input mono" inputMode="decimal" defaultValue={scalePct} aria-label={t("underlayScale")}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}
                  onBlur={(e) => e.target.value != scalePct && scaleUnder(e.target.value)} /></label>
            </div>
            <div className="under-btns">
              <button type="button" className="btn btn-soft" aria-pressed={adjust} disabled={un.locked} onClick={() => setAdjust((a) => !a)}>{t("underlayAdjust")}</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setAdjust(false); setUnder({ locked: !un.locked }); }}>{t(un.locked ? "underlayUnlock" : "underlayLock")}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setUnder({ visible: !un.visible })}>{t(un.visible ? "underlayHide" : "underlayShow")}</button>
              <button type="button" className="btn btn-ghost btn-danger" onClick={removeUnder}>{t("underlayRemove")}</button>
            </div>
          </>)}
        </div>
        <p className="muted small">{t("underlayHint")}</p>
      </section>

      <section className="tool-sec">
        <h3>{t("reveal")}</h3>
        <div className="stack">
          <button type="button" className="btn btn-primary reveal-btn" onClick={toggleReveal} data-tip={tip(t("revealTip"), "r")}>{t("reveal")}</button>
          <button type="button" className="btn btn-soft phi-preset" onClick={addPhi} data-tip={t("phiPresetTip")}>{t("phiPreset")}</button>
        </div>
      </section>

      <section className="tool-sec">
        <h3>{t("exportTitle")}</h3>
        <div className="stack">
          <button className="btn btn-primary" onClick={() => doExport(false)} data-tip={tip(t("exportMarkTip"), "mod+e")}>{t("exportMark")}</button>
          <button className="btn btn-soft" onClick={() => doExport(true)} data-tip={tip(t("exportSheetTip"), "mod+shift+e")}>{t("exportSheet")}</button>
        </div>
      </section>
    </div>
  );

  const dock = (
    <div className="dock" role="toolbar" aria-label={t("tool")}>
      <div className="seg" role="radiogroup" aria-label={t("tool")} style={{ "--i": mode === "ink" ? 1 : 0, "--n": 2 }} data-tip={t(mode === "ink" ? "inkHint" : "compassHint")}>
        <span className="seg-thumb" aria-hidden />
        {["compass", "inkMode"].map((m) => (
          <button key={m} type="button" role="radio" aria-checked={(mode === "ink" ? "inkMode" : "compass") === m} className="seg-btn"
            data-tip={tip(t(`${m}Tip`), m === "compass" ? "c" : "i")} onClick={() => setMode(m === "compass" ? "compass" : "ink")}>{t(m)}</button>
        ))}
      </div>
      <button type="button" className="icon-btn guides-toggle" aria-pressed={showGuides} aria-label={t("toggleGuides")} data-tip={tip(t("toggleGuidesTip"), "h")} onClick={toggleGuides}>{showGuides ? "◉" : "○"} {t("toggleGuides")}</button>
    </div>
  );

  if (!proj.started) return (
    <div className="shell">
      <StartPage lang={lang} onNew={proj.newProject} onOpen={open} onRecent={proj.openRecent} />
      <DialogHost /><Tooltip /><Toasts />
    </div>
  );

  return (
    <div className={`shell ${reveal ? "reveal" : ""}`}>
      <Navbar onSettings={() => go("settings")} settingsOpen={route === "settings"} tabs={TABS} route={route} go={go} canBack={canBack} onBack={back} history={{ ...snap, undo: history.undo, redo: history.redo }}
        onSave={save} onOpen={open} onPalette={() => setPalette(true)} onHelp={() => setHelp(true)} />
      <ProjectBar p={proj} onNew={proj.newProject} onOpen={open} onSave={save} onSaveAs={saveAs} />
      <div className="body">
        {home && <Panel id="layers" side="left" title={t("leftPane")}>{leftPane}</Panel>}
        <main className="main">
          {home ? (
            <div className="stage">
              {view && <Sheet doc={doc} commit={commit} mode={mode} sel={sel} setSel={setSel} view={view} setView={setView} showGuides={showGuides} adjust={adjust} reveal={reveal} />}
              {!reveal && dock}
              {reveal && <button type="button" className="btn btn-soft reveal-exit" onClick={toggleReveal}>{t("revealExit")}</button>}
              {!allCircles(doc).length && <div className="empty-sheet"><p className="lede">{t("emptyLede")}</p><p className="muted">{t("emptyHint2")}</p></div>}
            </div>
          ) : <div className="view"><Settings onReset={reset} /></div>}
        </main>
        {home && <Panel id="canvas" side="right" title={t("frameTitle")}>{rightPane}</Panel>}
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} commands={commands} />
      {help && (
        <div className="overlay overlay-center" onMouseDown={() => setHelp(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={t("shortcuts")} onMouseDown={(e) => e.stopPropagation()}>
            <h2>{t("shortcuts")}</h2>
            <dl className="keys">{KEYS.map(([k, a]) => <div key={k}><dt><kbd>{keyLabel(k)}</kbd></dt><dd>{t(a)}</dd></div>)}</dl>
          </div>
        </div>
      )}
      <ExportDialog open={!!expOpen} initialSheet={expOpen === "sheet"} onClose={() => setExpOpen(null)} bg={doc.bg === "transparent" ? null : doc.bg}
        frame={doc.frame} getSVG={({ sheet, bg }) => exportSVG(doc, { sheet, bg })} onExported={toast} />
      <DialogHost />
      <Tooltip />
      <Toasts />
    </div>
  );
}
