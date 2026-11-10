// Pure colour math: hex <-> rgb <-> hsv <-> hsl. rgb 0..255, s/v/l 0..1, h 0..360, a 0..1.
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const h2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");

// "#abc" / "abc" / "#aabbcc" / "#aabbccdd" -> {r,g,b,a} or null (4-digit #rgba is accepted too).
export function parseHex(s) {
  if (typeof s !== "string") return null;
  let m = s.trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(m)) return null;
  if (m.length === 3 || m.length === 4) m = [...m].map((c) => c + c).join("");
  if (m.length !== 6 && m.length !== 8) return null;
  const n = (i) => parseInt(m.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: m.length === 8 ? n(6) / 255 : 1 };
}
export const isHex = (s) => parseHex(s) !== null;
// Canonical lowercase "#rrggbb" (or "#rrggbbaa" when alpha < 1 and withAlpha). Invalid -> fallback.
export function normHex(s, fallback = null, withAlpha = false) {
  const c = parseHex(s);
  return c ? toHex(c, withAlpha) : fallback;
}
export function toHex({ r, g, b, a = 1 }, withAlpha = false) {
  return `#${h2(r)}${h2(g)}${h2(b)}${withAlpha && a < 1 ? h2(a * 255) : ""}`;
}
export function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: mx ? d / mx : 0, v: mx };
}
export function hsvToRgb({ h, s, v }) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
}
export function rgbToHsl({ r, g, b }) {
  const { h, s: sv, v } = rgbToHsv({ r, g, b });
  const l = v * (1 - sv / 2);
  return { h, s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l };
}
export function hslToRgb({ h, s, l }) {
  const v = l + s * Math.min(l, 1 - l);
  return hsvToRgb({ h, s: v ? 2 * (1 - l / v) : 0, v });
}
// Recent-colour lists come from localStorage: keep opaque 6-digit hex only, unique, capped.
export function sanitizeRecent(list, cap = 12) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    const c = typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x) ? x.toLowerCase() : null;
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= cap) break;
  }
  return out;
}
export const pushRecent = (list, hex, cap = 12) => sanitizeRecent([hex, ...list], cap);
