// Project file I/O. File System Access (Chromium: handles, in-place writes) with download + <input type=file> fallback.
import { MAX_BYTES } from "look/kit/envelope.js";
import { EXT } from "./session.js";

const types = () => [{ description: "pergel", accept: { "application/json": [EXT] } }];
export const hasFsAccess = () => typeof window !== "undefined" && window.isSecureContext !== false && typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
const isAbort = (e) => e?.name === "AbortError";

export async function writeHandle(h, text) {
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
}
export const readHandle = async (h) => {
  const f = await h.getFile();
  if (f.size > MAX_BYTES) throw new Error("file too large");
  return f.text();
};

/** -> {name,text,handle|null} or null when cancelled. `handle` null = no write access (opened as a copy) or no FSA. */
export async function pickOpen(onAsk) {
  if (hasFsAccess()) {
    try {
      const [h] = await window.showOpenFilePicker({ types: types() });
      const text = await readHandle(h);
      const had = h.queryPermission ? await h.queryPermission({ mode: "readwrite" }) : "granted";
      if (had !== "granted" && h.requestPermission) onAsk?.(h.name);
      const perm = had === "granted" || !h.requestPermission ? "granted" : await h.requestPermission({ mode: "readwrite" });
      return { name: h.name, text, handle: perm === "granted" ? h : null };
    } catch (e) { if (isAbort(e)) return null; throw e; }
  }
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: `${EXT},.json,application/json` });
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      if (f.size > MAX_BYTES) return reject(new Error("file too large"));
      resolve({ name: f.name, text: await f.text(), handle: null });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Save as: picker handle (FSA) -> {handle,name}; fallback downloads -> {handle:null,name}; null = cancelled. */
export async function pickSave(text, suggested) {
  if (hasFsAccess()) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: suggested, types: types() });
      await writeHandle(handle, text);
      return { handle, name: handle.name };
    } catch (e) { if (isAbort(e)) return null; throw e; }
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: suggested }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { handle: null, name: suggested };
}
