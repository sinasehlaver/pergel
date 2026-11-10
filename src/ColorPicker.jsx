import { useEffect, useRef, useState } from "react";
import { Popover } from "look/kit/Popover.jsx";
import { useT } from "look/kit/i18n.js";
import { parseHex, toHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, sanitizeRecent, pushRecent } from "./color.js";
import "./colorpicker.css";

// Curated swatches (a colour is data, not chrome, so hex lives here).
export const GROUPS = [
  ["swNeutrals", ["#1d1d1f", "#3a3a3c", "#636366", "#8e8e93", "#c7c7cc", "#e5e5ea", "#f4efe6", "#ffffff"]],
  ["swWarm", ["#e8705a", "#d9442f", "#f0a94e", "#f6c945", "#b5651d", "#7a3b2e", "#ff6b9a", "#c2185b"]],
  ["swCool", ["#5b9dff", "#2f6f8f", "#1f3a93", "#3cc6b4", "#43b85c", "#1e7d4f", "#9b8cff", "#5e35b1"]],
];
const RECENT_KEY = "pergel:recent-colours";
const loadRecent = () => { try { return sanitizeRecent(JSON.parse(localStorage.getItem(RECENT_KEY))); } catch { return []; } };
const saveRecent = (l) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(l)); } catch { /* private mode */ } };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Drag + arrow keys on a 1- or 2-axis surface. pos in 0..1.
function Surface({ x, y, onMove, className, label, valueText, children, step = 0.01 }) {
  const ref = useRef(null);
  const at = (e) => {
    const r = ref.current.getBoundingClientRect();
    onMove(clamp((e.clientX - r.left) / r.width, 0, 1), y === undefined ? 0 : clamp(1 - (e.clientY - r.top) / r.height, 0, 1));
  };
  const key = (e) => {
    const k = e.shiftKey ? step * 10 : step;
    const d = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }[e.key];
    if (!d) return;
    e.preventDefault();
    onMove(clamp(x + d[0], 0, 1), y === undefined ? 0 : clamp(y + d[1], 0, 1));
  };
  return (
    <div ref={ref} className={className} tabIndex={0} role="slider" aria-label={label} aria-valuetext={valueText} aria-valuenow={Math.round(x * 100)}
      onKeyDown={key} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
      onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e); }}>
      {children}
    </div>
  );
}

const Dot = ({ c, on, label, onClick }) => (
  <button type="button" className="cp-dot" role="radio" aria-checked={on} style={{ background: c }} aria-label={label || c} data-tip={c} onClick={onClick} />
);

// A popover colour picker. alpha: caller allows 8-digit hex (canvas bg); otherwise the value stays opaque #rrggbb.
// docColors: colours already used in the document, shown as a swatch row.
export function ColorPicker({ value, onChange, label, alpha = false, docColors = [] }) {
  const t = useT();
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState({ h: 0, s: 0, v: 0 });
  const [a, setA] = useState(1);
  const [hexText, setHexText] = useState(value);
  const [recent, setRecent] = useState(loadRecent);
  const closePop = () => setOpen(false);

  const sync = (hex) => {
    const c = parseHex(hex) || { r: 0, g: 0, b: 0, a: 1 };
    const n = rgbToHsv(c);
    setHsv((p) => (n.s === 0 || n.v === 0 ? { h: p.h, s: n.s, v: n.v } : n));
    setA(c.a);
    setHexText(hex);
  };
  useEffect(() => { if (open) sync(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const rgb = hsvToRgb(hsv), hsl = rgbToHsl(rgb);
  const emit = (nextHsv, nextA = a) => {
    const c = { ...hsvToRgb(nextHsv), a: alpha ? nextA : 1 };
    const hex = toHex(c, alpha);
    setHsv(nextHsv); setA(nextA); setHexText(hex);
    onChange(hex);
  };
  const remember = (hex) => { const l = pushRecent(recent, toHex(parseHex(hex))); setRecent(l); saveRecent(l); };
  const setHex = (txt) => {
    setHexText(txt);
    const c = parseHex(txt);
    if (!c || (!alpha && txt.replace("#", "").length === 8)) return;
    const hex = toHex({ ...c, a: alpha ? c.a : 1 }, alpha);
    const n = rgbToHsv(c);
    setHsv((p) => (n.s === 0 || n.v === 0 ? { h: p.h, s: n.s, v: n.v } : n)); setA(alpha ? c.a : 1);
    onChange(hex); remember(hex);
  };
  const pick = (hex) => { sync(hex); onChange(alpha ? hex : toHex(parseHex(hex))); remember(hex); };
  const num = (v, max) => clamp(Math.round(Number(v) || 0), 0, max);
  const setRgb = (k, v) => emit(rgbToHsv({ ...rgb, [k]: num(v, 255) }));
  const setHsl = (k, v) => {
    const n = { ...hsl, [k]: k === "h" ? num(v, 360) : num(v, 100) / 100 };
    const nh = rgbToHsv(hslToRgb(n));
    emit(nh.s === 0 ? { ...nh, h: n.h } : nh);
  };
  const eyedrop = async () => {
    try { const r = await new window.EyeDropper().open(); pick(r.sRGBHex); } catch { /* cancelled */ }
  };
  const valid = !!parseHex(hexText) && (alpha || hexText.replace("#", "").length !== 8);
  const docUniq = [...new Set(docColors)];
  const cur = alpha ? toHex({ ...rgb, a }, true) : toHex(rgb);

  return (
    <>
      <button ref={btn} type="button" className="color-dot cp-trigger" style={{ background: value }} aria-label={`${label}: ${value}`} data-tip={label} aria-expanded={open}
        onClick={() => setOpen((o) => !o)} />
      <Popover open={open} anchor={btn.current} onClose={closePop} className="cp-pop" width={248}>
        <div role="group" aria-label={label} className="cp">
          <Surface className="cp-sv" x={hsv.s} y={hsv.v} label={t("cpSatVal")} valueText={`${Math.round(hsv.s * 100)}% / ${Math.round(hsv.v * 100)}%`}
            onMove={(s, v) => emit({ ...hsv, s, v })}>
            <div className="cp-sv-bg" style={{ "--hue": `hsl(${hsv.h} 100% 50%)` }} />
            <span className="cp-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: toHex(rgb) }} />
          </Surface>
          <Surface className="cp-hue" x={hsv.h / 360} label={t("cpHue")} valueText={`${Math.round(hsv.h)}°`} onMove={(x) => emit({ ...hsv, h: x * 360 })} step={1 / 360}>
            <span className="cp-knob" style={{ left: `${(hsv.h / 360) * 100}%`, top: "50%", background: `hsl(${hsv.h} 100% 50%)` }} />
          </Surface>
          {alpha && (
            <Surface className="cp-alpha" x={a} label={t("cpAlpha")} valueText={`${Math.round(a * 100)}%`} onMove={(x) => emit(hsv, x)}>
              <div className="cp-alpha-bg" style={{ "--c": toHex(rgb) }} />
              <span className="cp-knob" style={{ left: `${a * 100}%`, top: "50%" }} />
            </Surface>
          )}
          <div className="cp-row">
            <span className="cp-cur" style={{ background: cur }} aria-hidden />
            <input className="input mono cp-hex" value={hexText} maxLength={alpha ? 9 : 7} aria-label={t("hex")} aria-invalid={!valid} spellCheck={false}
              onChange={(e) => setHex(e.target.value.trim())} onBlur={() => { if (!valid) setHexText(cur); }} />
            {window.EyeDropper && <button type="button" className="btn btn-soft cp-eye" onClick={eyedrop} data-tip={t("cpEyedropper")} aria-label={t("cpEyedropper")}>⌖</button>}
          </div>
          <div className="cp-nums">
            {[["R", "r", rgb.r, 255, (k, v) => setRgb(k, v)], ["G", "g", rgb.g, 255, setRgb], ["B", "b", rgb.b, 255, setRgb]].map(([l, k, v, mx, fn]) => (
              <label key={k}>{l}<input className="input mono" type="number" min="0" max={mx} value={v} aria-label={l} onChange={(e) => fn(k, e.target.value)} /></label>
            ))}
            {[["H", "h", Math.round(hsl.h), 360], ["S", "s", Math.round(hsl.s * 100), 100], ["L", "l", Math.round(hsl.l * 100), 100]].map(([l, k, v, mx]) => (
              <label key={k}>{l}<input className="input mono" type="number" min="0" max={mx} value={v} aria-label={`HSL ${l}`} onChange={(e) => setHsl(k, e.target.value)} /></label>
            ))}
          </div>
          {docUniq.length > 0 && (
            <div className="cp-group"><h4>{t("cpInDoc")}</h4>
              <div className="cp-dots" role="radiogroup" aria-label={t("cpInDoc")}>{docUniq.map((c) => <Dot key={c} c={c} on={c === value} onClick={() => pick(c)} />)}</div></div>
          )}
          {recent.length > 0 && (
            <div className="cp-group"><h4>{t("cpRecent")}</h4>
              <div className="cp-dots" role="radiogroup" aria-label={t("cpRecent")}>{recent.map((c) => <Dot key={c} c={c} on={c === value} onClick={() => pick(c)} />)}</div></div>
          )}
          {GROUPS.map(([name, list]) => (
            <div className="cp-group" key={name}><h4>{t(name)}</h4>
              <div className="cp-dots" role="radiogroup" aria-label={t(name)}>{list.map((c) => <Dot key={c} c={c} on={c === value} onClick={() => pick(c)} />)}</div></div>
          ))}
        </div>
      </Popover>
    </>
  );
}
