import { useEffect, useState } from "react";
import { useT } from "look/kit/i18n.js";
import { ColorPicker, SWATCHES } from "look/kit/ColorPicker.jsx";
import { FORMATS, rasterSize, fileName, renderExport, saveBlob } from "./export.js";
import "./export.css";

// Merge into src/strings.js (same shape as the other keys).
export const exportStrings = {
  en: {
    xpTitle: "Export", xpWhat: "What", xpMark: "Mark", xpSheet: "Construction sheet", xpFormat: "Format",
    xpSize: "Size", xpCustom: "Custom", xpWidth: "Width (px)", xpBg: "Background", xpBgNone: "Transparent",
    xpBgDoc: "Document", xpBgCustom: "Custom", xpBgColour: "Background colour", xpQuality: "Quality",
    xpJpgNote: "JPG has no transparency: it is flattened onto white.", xpGo: "Export", xpBusy: "Exporting…",
    xpDone: "Exported {name}", xpOut: "Output: {w} × {h} px",
  },
  tr: {
    xpTitle: "Dışa aktar", xpWhat: "Ne", xpMark: "Amblem", xpSheet: "Yapı çizimi", xpFormat: "Biçim",
    xpSize: "Boyut", xpCustom: "Özel", xpWidth: "Genişlik (px)", xpBg: "Arka plan", xpBgNone: "Saydam",
    xpBgDoc: "Belge", xpBgCustom: "Özel", xpBgColour: "Arka plan rengi", xpQuality: "Kalite",
    xpJpgNote: "JPG saydamlığı desteklemez: beyaz üzerine düzleştirilir.", xpGo: "Dışa aktar", xpBusy: "Aktarılıyor…",
    xpDone: "{name} aktarıldı", xpOut: "Çıktı: {w} × {h} px",
  },
};

const Seg = ({ label, value, options, onChange }) => (
  <div className="seg" role="radiogroup" aria-label={label} style={{ "--i": Math.max(0, options.findIndex((o) => o[0] === value)), "--n": options.length }}>
    <span className="seg-thumb" aria-hidden />
    {options.map(([v, text]) => (
      <button key={v} type="button" role="radio" aria-checked={v === value} className="seg-btn" onClick={() => onChange(v)}>{text}</button>
    ))}
  </div>
);

// getSVG({sheet, bg}) -> svg text (bg = hex or null). bg prop = the document's background hex (or null/"" if none).
export function ExportDialog({ frame, open, onClose, getSVG, bg, onExported, initialSheet = false }) {
  const t = useT();
  const [sheet, setSheet] = useState(false);
  const [format, setFormat] = useState("svg");
  const [scale, setScale] = useState("2");
  const [width, setWidth] = useState(1024);
  const [bgMode, setBgMode] = useState("none");
  const [custom, setCustom] = useState(SWATCHES[0]);
  const [quality, setQuality] = useState(92);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setErr(""); setSheet(initialSheet); setBgMode(bg ? "doc" : "none"); } }, [open, initialSheet]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const f = FORMATS[format];
  const out = frame ? (f.raster ? rasterSize(`0 0 ${frame.w} ${frame.h}`, scale === "custom" ? { width: Math.max(1, +width || 1) } : { scale: +scale }) : { w: Math.round(frame.w), h: Math.round(frame.h) }) : null;
  const bgHex = bgMode === "custom" ? custom : bgMode === "doc" && bg ? bg : null;
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const svg = getSVG({ sheet, bg: bgHex });
      const sc = scale === "custom" ? { width: Math.max(1, +width || 1) } : { scale: +scale };
      const blob = await renderExport(svg, { format, ...sc, bg: bgHex, quality: quality / 100 });
      const name = fileName(`pergel-${sheet ? "sheet" : "mark"}`, format);
      if (await saveBlob(blob, name, format)) { onExported?.(t("xpDone", { name })); onClose(); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="overlay overlay-center" onMouseDown={onClose}>
      <div className="dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="exp-title"
        onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
        <h2 id="exp-title">{t("xpTitle")}</h2>
        <div className="exp-row"><span className="exp-label">{t("xpWhat")}</span>
          <Seg label={t("xpWhat")} value={sheet ? "sheet" : "mark"} onChange={(v) => setSheet(v === "sheet")}
            options={[["mark", t("xpMark")], ["sheet", t("xpSheet")]]} /></div>
        <div className="exp-row"><span className="exp-label">{t("xpFormat")}</span>
          <Seg label={t("xpFormat")} value={format} onChange={setFormat} options={Object.entries(FORMATS).map(([k, v]) => [k, v.label])} /></div>
        {f.raster && (
          <div className="exp-row"><span className="exp-label">{t("xpSize")}</span>
            <Seg label={t("xpSize")} value={scale} onChange={setScale} options={[["1", "1×"], ["2", "2×"], ["4", "4×"], ["custom", t("xpCustom")]]} />
            {scale === "custom" && (
              <input className="input mono exp-width" type="number" min="1" max="8192" value={width} aria-label={t("xpWidth")}
                onChange={(e) => setWidth(e.target.value)} />
            )}
          </div>
        )}
        <div className="exp-row"><span className="exp-label">{t("xpBg")}</span>
          <Seg label={t("xpBg")} value={bgMode} onChange={setBgMode}
            options={[["none", t("xpBgNone")], ...(bg ? [["doc", t("xpBgDoc")]] : []), ["custom", t("xpBgCustom")]]} />
          {bgMode === "custom" && <ColorPicker value={custom} swatches={SWATCHES} label={t("xpBgColour")} onChange={setCustom} />}
        </div>
        {out && <p className="mono muted small exp-out">{t("xpOut", out)}</p>}
        {f.lossy && (
          <div className="exp-row"><span className="exp-label">{t("xpQuality")}</span>
            <input type="range" className="exp-range" min="40" max="100" value={quality} aria-label={t("xpQuality")} onChange={(e) => setQuality(+e.target.value)} />
            <span className="mono muted">{quality}</span></div>
        )}
        {format === "jpg" && bgMode === "none" && <p className="muted small">{t("xpJpgNote")}</p>}
        {err && <p className="exp-err" role="alert">{err}</p>}
        <div className="dialog-btns">
          <button className="btn btn-ghost" onClick={onClose}>{t("cancel")}</button>
          <button className="btn btn-primary" disabled={busy} onClick={go}>{busy ? t("xpBusy") : t("xpGo")}</button>
        </div>
      </div>
    </div>
  );
}
