// Export formats + pure helpers + raster pipeline (SVG text -> Blob). Pure parts are node-tested.
export const FORMATS = {
  svg: { ext: "svg", mime: "image/svg+xml", label: "SVG", raster: false, lossy: false },
  png: { ext: "png", mime: "image/png", label: "PNG", raster: true, lossy: false },
  jpg: { ext: "jpg", mime: "image/jpeg", label: "JPG", raster: true, lossy: true },
  webp: { ext: "webp", mime: "image/webp", label: "WebP", raster: true, lossy: true },
};
export const MAX_SIDE = 8192;

// viewBox "x y w h" -> output pixel size. `width` (px) wins over `scale`; clamped to 1..MAX_SIDE, aspect kept.
export function rasterSize(viewBox, { scale = 1, width } = {}) {
  const p = String(viewBox).trim().split(/[\s,]+/).map(Number);
  const vw = p[2], vh = p[3];
  if (p.length !== 4 || !(vw > 0) || !(vh > 0) || !p.every(Number.isFinite)) throw new Error("bad viewBox");
  let k = Number(width) > 0 ? Number(width) / vw : Number(scale) > 0 ? Number(scale) : 1;
  k = Math.min(k, MAX_SIDE / Math.max(vw, vh));
  k = Math.max(k, 1 / Math.min(vw, vh)); // at least 1px per side
  return { w: Math.max(1, Math.round(vw * k)), h: Math.max(1, Math.round(vh * k)) };
}

export function fileName(base, format) {
  const f = FORMATS[format]; if (!f) throw new Error("bad format");
  const stem = String(base || "pergel").replace(/\.(svg|png|jpe?g|webp)$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim() || "pergel";
  return `${stem}.${f.ext}`;
}

const HEX = /^#[0-9a-f]{3,8}$/i;
const load = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("SVG render failed")); i.src = url; });

// svgText -> Blob. bg: hex colour or null/"transparent". JPG always flattens (white when no bg).
export async function renderExport(svgText, { format = "svg", scale = 1, width, bg = null, quality = 0.92 } = {}) {
  const f = FORMATS[format]; if (!f) throw new Error("bad format");
  if (!f.raster) return new Blob([svgText], { type: f.mime });
  const vb = /viewBox="([^"]+)"/.exec(svgText)?.[1];
  if (!vb) throw new Error("SVG has no viewBox");
  const { w, h } = rasterSize(vb, { scale, width });
  // an <img> needs intrinsic size: stamp width/height on the root tag
  const sized = svgText.replace(/<svg\b([^>]*)>/, (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, "")} width="${w}" height="${h}">`);
  const url = URL.createObjectURL(new Blob([sized], { type: FORMATS.svg.mime }));
  try {
    const img = await load(url);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d");
    if (HEX.test(bg || "")) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
    else if (format === "jpg") { x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h); }
    x.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, f.mime, f.lossy ? quality : undefined));
    if (!blob) throw new Error("Canvas export failed");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

// File System Access save with download fallback. Returns false when the user cancels.
export async function saveBlob(blob, name, format) {
  const f = FORMATS[format];
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: f.label, accept: { [f.mime]: [`.${f.ext}`] } }] });
      const w = await h.createWritable(); await w.write(blob); await w.close();
      return true;
    } catch (e) { if (e?.name === "AbortError") return false; throw e; }
  }
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
