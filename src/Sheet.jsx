import { useEffect, useMemo, useRef, useState } from "react";
import { arrange, faceAt, inkPaths, loopsToPath, resolveFills } from "./geom/arrange.js";
import { hitTest as hit, resizeCursor } from "./geom/hit.js";
import { activeLayer, mapLayer } from "./geom/doc.js";
import { snapCircle, snapPoint, slivers } from "./geom/snap.js";
import { syncTwins, paintMirrored, setMirror } from "./geom/mirror.js";
import { useT } from "look/kit/i18n.js";

const MIN_R = 3; // px; a shorter drag is a click, not a circle
const uid = () => Math.random().toString(36).slice(2, 9);
const r1 = (n) => Math.round(n * 10) / 10;

// The drafting sheet: one hand-driven <svg>. Compass mode draws/moves/resizes circles, ink mode fills faces.
// Drags edit a local draft and commit once on release, so one gesture = one undo step.
export function Sheet({ doc, commit, mode, sel, setSel, view, setView, showGuides = true, adjust = false, reveal = false }) {
  const t = useT();
  const [uDraft, setUDraft] = useState(null); // {x,y} while the trace image is being dragged
  const [sweepAll, setSweepAll] = useState(false); // reveal reversed: every circle re-draws its stroke
  const wasReveal = useRef(false);
  useEffect(() => {
    if (wasReveal.current && !reveal) { setSweepAll(true); const id = setTimeout(() => setSweepAll(false), 1500); wasReveal.current = reveal; return () => clearTimeout(id); }
    wasReveal.current = reveal;
  }, [reveal]);
  const under = doc.underlay;
  const svg = useRef(null);
  const [draft, setDraftState] = useState(null); // circles while dragging
  const draftRef = useRef(null);
  const setDraft = (v) => { draftRef.current = v; setDraftState(v); };
  const [band, setBand] = useState(null); // rubber band {x0,y0,x1,y1}
  const [hover, setHover] = useState(null); // {x,y} world, ink mode
  const [hot, setHot] = useState(null); // compass hover {id, part, angle}
  const [cursor, setCursor] = useState("crosshair");
  const [sn, setSn] = useState(null); // live snap result {hits,label,x,y} while dragging
  const [fresh, setFresh] = useState(null); // id of the circle that just got drawn (compass sweep)
  const layer = activeLayer(doc);
  const frozen = layer.locked || !layer.visible; // can't select, edit or ink
  const [axDraft, setAxDraft] = useState(null); // mirror axis while it is being dragged
  const mirror = axDraft ?? layer.mirror ?? null;
  const circles = useMemo(() => (draft ? syncTwins(draft, layer.mirror, layer.circles) : layer.circles), [draft, layer.mirror, layer.circles]);
  const arr = useMemo(() => arrange(circles), [circles]);
  const [inkDraft, setInkDraft] = useState(null); // fills while an ink stroke is being dragged
  const inkFills = inkDraft ?? layer.fills;
  const inks = useMemo(() => inkPaths(arr, inkFills), [arr, inkFills]);
  // every other layer is drawn from its own construction, never mixed with the active one
  const others = useMemo(() => doc.layers.map((l) => {
    if (l.id === layer.id || !l.visible) return null;
    const a = arrange(l.circles);
    return { id: l.id, circles: a.circles, inks: inkPaths(a, l.fills) };
  }), [doc.layers, layer.id]);
  const { x: tx, y: ty, z } = view;
  const [fcur, setFcur] = useState(null); // resize cursor while over a frame handle
  const [fDraft, setFDraft] = useState(null); // canvas frame while a handle is dragged
  const frame = fDraft ?? doc.frame;
  // corner + edge-midpoint handles; k = which sides move (-1 left/top, 1 right/bottom, 0 fixed)
  const fHandles = (f) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]].map(([kx, ky]) => ({ kx, ky, x: f.x + (kx + 1) * f.w / 2, y: f.y + (ky + 1) * f.h / 2 }));
  const frameHit = (p) => { const tol = 9 / z; return fHandles(frame).find((h) => Math.hypot(h.x - p.x, h.y - p.y) <= tol) ?? null; };
  const frameCursor = (h) => (h.kx && h.ky ? (h.kx === h.ky ? "nwse-resize" : "nesw-resize") : h.kx ? "ew-resize" : "ns-resize");
  const frameDrag = (e, h) => {
    const el = e.currentTarget, f0 = doc.frame, clampW = (v) => Math.min(8192, Math.max(1, Math.round(v)));
    el.setPointerCapture(e.pointerId);
    let cur = f0;
    const mv = (ev) => {
      const q = world(ev);
      let { x, y, w, h: ht } = f0;
      if (h.kx === 1) w = clampW(q.x - f0.x);
      if (h.kx === -1) { w = clampW(f0.x + f0.w - q.x); x = f0.x + f0.w - w; }
      if (h.ky === 1) ht = clampW(q.y - f0.y);
      if (h.ky === -1) { ht = clampW(f0.y + f0.h - q.y); y = f0.y + f0.h - ht; }
      cur = { x, y, w, h: ht }; setFDraft(cur);
    };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", () => { el.removeEventListener("pointermove", mv); setFDraft(null); if (cur !== f0) commit((d) => ({ ...d, frame: cur })); }, { once: true });
  };

  const world = (e) => { const b = svg.current.getBoundingClientRect(); return { x: (e.clientX - b.left - tx) / z, y: (e.clientY - b.top - ty) / z }; };
  const hitTest = (p) => hit(p, circles, z, sel);

  // wheel = pan, pinch / ⌘-wheel = zoom about the pointer (non-passive so the page doesn't scroll)
  useEffect(() => {
    const el = svg.current;
    const onWheel = (e) => {
      e.preventDefault();
      setView((v) => {
        if (!(e.ctrlKey || e.metaKey)) return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
        const b = el.getBoundingClientRect(), sx = e.clientX - b.left, sy = e.clientY - b.top;
        const nz = Math.min(20, Math.max(0.1, v.z * Math.exp(-e.deltaY * 0.01)));
        return { z: nz, x: sx - ((sx - v.x) * nz) / v.z, y: sy - ((sy - v.y) * nz) / v.z };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setView]);

  // The one place a dragged circle's new geometry is computed (snapping hooks in here).
  // Snapping: every visible circle of every layer except the dragged ones; ⌘/Ctrl held = bypass; master switch off = none.
  const snapOn = (ev) => doc.snap.on && !(ev?.metaKey || ev?.ctrlKey);
  const snapEnv = (skip) => [...layer.circles.filter((c) => !skip.has(c.id) && !skip.has(c.mirrorOf) && !layer.circles.some((o) => skip.has(o.id) && o.mirrorOf === c.id)), ...doc.layers.filter((l) => l.id !== layer.id && l.visible).flatMap((l) => l.circles)];
  const snapTo = (c, env, mode, ev) => {
    if (!snapOn(ev)) { setSn(null); return null; }
    const s = snapCircle({ ...c, id: "drag~" }, env, { mode, tol: 8 / z, base: doc.base, kinds: doc.snap.kinds });
    setSn(s.hits.length ? { hits: s.hits, label: s.label, x: s.circle.cx, y: s.circle.cy } : null);
    return s.circle;
  };
  const moved = (c, dx, dy) => ({ cx: c.cx + dx, cy: c.cy + dy, r: c.r });
  const resized = (c, q) => ({ cx: c.cx, cy: c.cy, r: Math.max(MIN_R / z, Math.hypot(q.x - c.cx, q.y - c.cy)) });

  const down = (e) => {
    if (reveal) return;
    if (adjust && under && !under.locked && e.button === 0) { // dragging the trace image instead of drawing
      const p0 = world(e), el0 = e.currentTarget;
      el0.setPointerCapture(e.pointerId);
      let at = { x: under.x, y: under.y };
      const mv = (ev) => { const q = world(ev); at = { x: under.x + q.x - p0.x, y: under.y + q.y - p0.y }; setUDraft(at); };
      el0.addEventListener("pointermove", mv);
      el0.addEventListener("pointerup", () => { el0.removeEventListener("pointermove", mv); setUDraft(null); commit((d) => (d.underlay ? { ...d, underlay: { ...d.underlay, ...at } } : d)); }, { once: true });
      return;
    }
    if (e.button === 0) { const fh = frameHit(world(e)); if (fh) return frameDrag(e, fh); }
    if (e.button !== 0 || frozen) return;
    const p = world(e);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const add = e.shiftKey || e.metaKey || e.ctrlKey;
    let move;
    let up = () => {};

    if (mode === "ink") {
      const path = [p];
      move = (q) => { path.push(q); setInkDraft(paintMirrored(arr, layer.fills, path, doc.ink, e.shiftKey, layer.mirror).fills); };
      up = (q) => {
        path.push(q);
        const r = paintMirrored(arr, layer.fills, path, doc.ink, e.shiftKey, layer.mirror);
        setInkDraft(null);
        if (r.action) commit((d) => mapLayer(d, (l) => ({ ...l, fills: r.fills }), layer.id));
      };
    } else {
      const h = hitTest(p);
      const axk = !h && layer.mirror && !draft ? axisHit(p) : null;
      if (axk) { // drag the mirror axis; snaps to the nearest existing centre on that coordinate
        const m0 = layer.mirror, onlyCentre = Object.fromEntries(Object.keys(doc.snap.kinds).map((k) => [k, k === "centre"]));
        const pts = layer.circles.filter((c) => !c.mirrorOf);
        move = (q, ev) => {
          let v = q[axk];
          if (snapOn(ev)) { // nearest existing centre on this coordinate, through snapPoint's tolerance
            const key = axk === "x" ? "cx" : "cy";
            const near = pts.filter((c) => Math.abs(c[key] - v) <= 8 / z).sort((a, b) => Math.abs(a[key] - v) - Math.abs(b[key] - v))[0];
            if (near) v = snapPoint(axk === "x" ? { x: near.cx, y: q.y } : { x: q.x, y: near.cy }, pts, { tol: 0, kinds: onlyCentre })[axk];
          }
          setAxDraft({ ...m0, [axk]: v });
        };
        up = (q) => { const m = axDraftRef.current; setAxDraft(null); if (m && m[axk] !== m0[axk]) commit((d) => mapLayer(d, (l) => setMirror(l, m), layer.id)); };
      } else if (h && h.part !== "rim") { // centre handle, or the body of a selected circle: move
        const ids = sel.has(h.c.id) ? sel : add ? new Set([...sel, h.c.id]) : new Set([h.c.id]);
        // Alt = duplicate and move the copies; a plain click (no drag) leaves the doc alone
        const copies = e.altKey ? new Map([...ids].map((id) => [id, uid()])) : null;
        const base = copies ? [...layer.circles, ...layer.circles.filter((c) => ids.has(c.id)).map(({ mirrorOf, mirrorAx, ...c }) => ({ ...c, id: copies.get(c.id) }))] : layer.circles;
        const moving = copies ? new Set(copies.values()) : ids;
        setSel(moving);
        const env = snapEnv(moving), hc = h.c;
        move = (q, ev) => {
          let dx = q.x - p.x, dy = q.y - p.y;
          const s = snapTo(moved(hc, dx, dy), env, "move", ev);
          if (s) { dx = s.cx - hc.cx; dy = s.cy - hc.cy; }
          setDraft(base.map((c) => (moving.has(c.id) ? { ...c, ...moved(c, dx, dy) } : c)));
        };
      } else if (h) { // rim: resize
        setSel(add ? new Set([...sel, h.c.id]) : new Set([h.c.id]));
        const env = snapEnv(new Set([h.c.id]));
        move = (q, ev) => {
          const r = resized(h.c, q), s = snapTo(r, env, "resize", ev);
          setDraft(layer.circles.map((c) => (c.id === h.c.id ? { ...c, ...r, r: s ? s.r : r.r } : c)));
        };
      } else if (e.shiftKey) {
        move = (q) => setBand({ x0: p.x, y0: p.y, x1: q.x, y1: q.y });
        up = (q) => {
          const [xa, xb, ya, yb] = [Math.min(p.x, q.x), Math.max(p.x, q.x), Math.min(p.y, q.y), Math.max(p.y, q.y)];
          setSel(new Set([...sel, ...layer.circles.filter((c) => c.cx >= xa && c.cx <= xb && c.cy >= ya && c.cy <= yb).map((c) => c.id)]));
          setBand(null);
        };
      } else {
        const id = uid();
        const env = snapEnv(new Set());
        move = (q, ev) => {
          const r0 = { cx: p.x, cy: p.y, r: Math.hypot(q.x - p.x, q.y - p.y) };
          const s = r0.r * z >= MIN_R ? snapTo(r0, env, "create", ev) : (setSn(null), null);
          setDraft([...layer.circles, { id, ...(s ?? r0) }]);
        };
        up = (q) => { if (Math.hypot(q.x - p.x, q.y - p.y) * z < MIN_R) setSel(new Set()); else { setSel(new Set([id])); setFresh(id); } };
      }
    }
    let last = null;
    const onMove = (ev) => { if (move) { last = world(ev); move(last, ev); } };
    const onUp = (ev) => {
      el.removeEventListener("pointermove", onMove);
      const q = world(ev);
      up(q);
      // a click on a rim or centre with no drag selects only; a too-small new circle is discarded
      const d = draftRef.current;
      if (d && last) commit((doc0) => mapLayer(doc0, (l) => ({ ...l, circles: d.filter((c) => c.r * z >= MIN_R || l.circles.some((o) => o.id === c.id)) }), layer.id));
      setDraft(null); setSn(null);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp, { once: true });
  };

  const axDraftRef = useRef(null);
  axDraftRef.current = axDraft;
  const axisHit = (p) => {
    const m = layer.mirror, tol = 6 / z;
    if (m.axis !== "h" && Math.abs(p.x - m.x) < tol) return "x";
    if (m.axis !== "v" && Math.abs(p.y - m.y) < tol) return "y";
    return null;
  };
  const hoverMove = (e) => {
    if (fDraft) return;
    if (draft || band) return setCursor("not-allowed");
    const fh = reveal ? null : frameHit(world(e));
    setFcur(fh ? frameCursor(fh) : null);
    if (fh || frozen) return;
    const p = world(e);
    if (mode === "ink") return setHover(p);
    const h = hitTest(p);
    setHot(h && { id: h.c.id, part: h.part, angle: h.angle ?? 0 });
    const ak = !h && layer.mirror ? axisHit(p) : null;
    setCursor(ak ? (ak === "x" ? "ew-resize" : "ns-resize") : !h ? "crosshair" : h.part === "rim" ? resizeCursor(h.angle) : "move");
  };
  const hoverFace = mode === "ink" && hover && !draft && !frozen ? faceAt(arr, hover.x, hover.y) : null;
  const hw = 0.75 / z; // hairline width in world units
  const one = sel.size === 1 ? circles.find((c) => sel.has(c.id)) : null;
  const warn = useMemo(() => (doc.snap.kinds.sliver && layer.visible ? slivers(layer.circles, { minArea: 0.5 * (8 / z) ** 2, minWidth: 16 / z }) : []), [layer.circles, layer.visible, doc.snap.kinds.sliver, z]);
  const drawing = draft && draft.length > layer.circles.length ? draft[draft.length - 1] : null;
  const callout = drawing ?? one;
  const active = mode === "compass" && !frozen && !draft ? hot : null;
  const hotC = active ? circles.find((c) => c.id === active.id) : null;
  const knob = (c, a) => ({ x: c.cx + c.r * Math.cos(a), y: c.cy + c.r * Math.sin(a) });
  const kb = hotC && active.part === "rim" ? knob(hotC, active.angle) : null;

  return (
    <svg ref={svg} className={`sheet mode-${mode} ${reveal ? "reveal" : ""} ${adjust && under && !under.locked ? "adjusting" : ""}`} style={{ cursor: fcur ?? (frozen ? "not-allowed" : mode === "ink" ? (hoverFace ? "pointer" : "default") : cursor) }}
      onPointerDown={down} onPointerMove={hoverMove} onPointerLeave={() => { setFcur(null); setHover(null); setHot(null); }} role="application" aria-label={t("sheetLabel")}>
      <defs>
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r={0.9 / z} className="dot" />
        </pattern>
      </defs>
      <g transform={`translate(${tx} ${ty}) scale(${z})`}>
        {doc.bg !== "transparent" && <rect className="canvas-bg" x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill={doc.bg} />}
        <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="url(#dots)" />
        {under && under.visible && <image className="underlay" href={under.src} x={uDraft?.x ?? under.x} y={uDraft?.y ?? under.y} width={under.w} height={under.h} opacity={under.opacity} preserveAspectRatio="none" style={{ pointerEvents: "none" }} />}
        {doc.layers.map((l, i) => {
          if (!l.visible) return null;
          const o = others[i];
          const ps = o ? o.inks : inks;
          return <g key={l.id} className={`ink layer-ink ${o ? "" : "active-layer"}`} data-layer={l.id}>{ps.map((p) => <path key={p.color} d={p.d} fill={p.color} fillRule="evenodd" />)}</g>;
        })}
        {others.map((o) => o && (
          <g key={o.id} className={`guides faint ${showGuides ? "" : "off"}`} strokeWidth={hw}>{o.circles.map((c) => <circle key={c.id} cx={c.cx} cy={c.cy} r={c.r} />)}</g>
        ))}
        <path className="frame-dim" fillRule="evenodd" d={`M-1e5 -1e5H1e5V1e5H-1e5Z M${frame.x} ${frame.y}h${frame.w}v${frame.h}h${-frame.w}Z`} style={{ pointerEvents: "none" }} />
        {mirror && layer.visible && (
          <g className="mirror-axis" strokeWidth={1.25 / z} strokeDasharray={`${10 / z} ${3 / z} ${2 / z} ${3 / z}`}>
            {mirror.axis !== "h" && <line x1={mirror.x} y1={-1e5} x2={mirror.x} y2={1e5} />}
            {mirror.axis !== "v" && <line x1={-1e5} y1={mirror.y} x2={1e5} y2={mirror.y} />}
          </g>
        )}
        {hoverFace && <path className="face-hover" d={loopsToPath(arr, hoverFace.loops.map((l) => l.hes))} fillRule="evenodd" strokeWidth={1.5 / z}
          style={{ "--ink": doc.ink }} />}
        <g className={`guides ${frozen ? "faint" : ""} ${showGuides ? "" : "off"}`} strokeWidth={hw}>
          {arr.circles.map((c, i) => (
            <circle key={c.id} cx={c.cx} cy={c.cy} r={c.r} pathLength="1" style={{ transitionDelay: reveal ? `${i * 70}ms` : undefined, animationDelay: sweepAll ? `${i * 70}ms` : undefined }} className={`${sel.has(c.id) ? "sel" : ""} ${sel.has(c.id) || hotC?.id === c.id || drawing?.id === c.id ? "keep" : ""} ${fresh === c.id || sweepAll ? "sweep" : ""} ${drawing?.id === c.id ? "drafting" : ""}`}
              onAnimationEnd={() => setFresh(null)} strokeWidth={sel.has(c.id) ? 1.25 / z : hw} />
          ))}
        </g>
        <g className={`verts ${showGuides ? "" : "off"}`}>{arr.verts.map((v, i) => <circle key={i} cx={v.x} cy={v.y} r={1.8 / z} />)}</g>
        {mode === "compass" && !frozen && (
          <g className="centres" strokeWidth={hw * 1.4}>
            {circles.map((c) => <path key={c.id} className={sel.has(c.id) ? "sel" : ""} d={`M${c.cx - 5 / z} ${c.cy}h${10 / z}M${c.cx} ${c.cy - 5 / z}v${10 / z}`} />)}
          </g>
        )}
        {mode === "compass" && !frozen && circles.filter((c) => sel.has(c.id)).map((c) => {
          const a = hotC?.id === c.id && active.part === "rim" ? active.angle : 0, k = knob(c, a);
          return (
            <g key={c.id} className="handles">
              <circle className="h-centre" cx={c.cx} cy={c.cy} r={4 / z} strokeWidth={hw * 1.4} />
              <circle className="h-rim" cx={k.x} cy={k.y} r={4 / z} strokeWidth={hw * 1.4} />
            </g>
          );
        })}
        {hotC && (
          <g className="hot">
            {!sel.has(hotC.id) && <circle className="hot-ring" cx={hotC.cx} cy={hotC.cy} r={hotC.r} strokeWidth={1.25 / z} />}
            {active.part === "centre" && <circle className="h-centre on" cx={hotC.cx} cy={hotC.cy} r={5 / z} strokeWidth={hw * 1.4} />}
            {kb && <circle className="h-rim on" cx={kb.x} cy={kb.y} r={5 / z} strokeWidth={hw * 1.4} />}
            <text className="hint" style={{ fontSize: 11 / z }} textAnchor="middle"
              x={active.part === "rim" ? kb.x : hotC.cx} y={(active.part === "rim" ? kb.y : hotC.cy) - 12 / z}>
              {active.part === "rim" ? `drag to resize · r = ${r1(hotC.r)}` : active.part === "body" ? "drag to move" : "drag to move"}
            </text>
          </g>
        )}
        {!draft && warn.map((w, i) => (
          <g key={i} className="sliver-warn" style={{ fontSize: 11 / z }}>
            <circle cx={w.x} cy={w.y} r={9 / z} strokeWidth={1.25 / z} />
            <text x={w.x} y={w.y - 14 / z} textAnchor="middle">{t("sliverHint")}</text>
          </g>
        ))}
        {sn && (
          <g className="snapg" strokeWidth={hw} style={{ fontSize: 11 / z }}>
            {sn.hits.map((h, i) => {
              const g = h.guide;
              if (!g) return null;
              if (g.type === "circle") return <circle key={i} className="sg-ghost" cx={g.cx} cy={g.cy} r={g.r} />;
              if (g.type === "line") return <line key={i} className="sg-line" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />;
              return <circle key={i} className="sg-dot" cx={g.x} cy={g.y} r={3 / z} />;
            })}
            <text className="sg-label" x={sn.x} y={sn.y + 20 / z} textAnchor="middle">{sn.label}</text>
          </g>
        )}
        {callout && (
          <g className="callout" style={{ fontSize: 11 / z }}>
            <line x1={callout.cx} y1={callout.cy} x2={callout.cx + callout.r} y2={callout.cy} strokeWidth={hw} />
            <text x={callout.cx + callout.r / 2} y={callout.cy - 5 / z} textAnchor="middle">r {r1(callout.r)}</text>
          </g>
        )}
        <g className="frame" style={{ fontSize: 11 / z }}>
          <rect className="frame-line" x={frame.x} y={frame.y} width={frame.w} height={frame.h} strokeWidth={1.25 / z} style={{ pointerEvents: "none" }} />
          <text className="frame-label" x={frame.x} y={frame.y - 6 / z}>{Math.round(frame.w)} × {Math.round(frame.h)} px</text>
          {!reveal && fHandles(frame).map((h, i) => <rect key={i} className="frame-h" x={h.x - 4 / z} y={h.y - 4 / z} width={8 / z} height={8 / z} strokeWidth={hw * 1.4} />)}
        </g>
        {band && <rect className="band" x={Math.min(band.x0, band.x1)} y={Math.min(band.y0, band.y1)} width={Math.abs(band.x1 - band.x0)} height={Math.abs(band.y1 - band.y0)} strokeWidth={hw} />}
      </g>
    </svg>
  );
}

export const newId = uid;
