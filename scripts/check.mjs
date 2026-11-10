// Draws three circles, inks a lens, merges a neighbour, undoes, exports both SVGs. Run through `npm run verify`.
import assert from "node:assert/strict";
import { launch } from "./browser.mjs";

const URL = process.env.PERGEL_URL;
const SHOTS = process.env.PERGEL_SHOTS;
const { browser, page } = await launch();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };
const EMPTY = JSON.stringify({ app: "pergel", version: 2, savedAt: "", data: { layers: [{ id: "l1", name: "Layer 1", visible: true, locked: false, circles: [], fills: [] }], active: "l1", ink: "#e8705a", bg: "transparent", frame: { x: -256, y: -256, w: 512, h: 512 } } });
// Seeding a project: write (or clear) the session snapshot, then reload. The app snapshots the live document on a 400ms timer and on
// pagehide, which would overwrite the seed, so the page's own session writes are blocked first (the seed itself goes through the original setItem).
const setSession = async (v) => {
  await page.evaluate((val) => {
    const set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, x) { return k === "pergel:session" ? undefined : set.call(this, k, x); };
    if (val === null) del.call(sessionStorage, "pergel:session"); else set.call(sessionStorage, "pergel:session", val);
  }, v);
  await page.reload();
};
const seed = () => setSession(JSON.stringify({ text: EMPTY, name: null, hasFile: false, clean: true }));
page.on("dialog", (d) => d.accept()); // beforeunload guard on dirty untitled projects
// In-memory File System Access pickers, only when localStorage["pg-fake-fsa"] = "1" (files live in localStorage["pg-fake-files"] so they survive reloads).
await page.addInitScript(() => {
  if (localStorage.getItem("pg-fake-fsa") !== "1") return;
  const files = () => JSON.parse(localStorage.getItem("pg-fake-files") || "{}");
  const put = (n, t) => { const f = files(); f[n] = t; localStorage.setItem("pg-fake-files", JSON.stringify(f)); localStorage.setItem("pg-fake-writes", String(+localStorage.getItem("pg-fake-writes") + 1)); };
  const handleFor = (name) => ({
    kind: "file", name,
    async getFile() { return new File([files()[name] ?? ""], name); },
    async createWritable() { let buf = ""; return { async write(d) { buf += typeof d === "string" ? d : await d.text(); }, async close() { put(name, buf); } }; },
    async queryPermission() { return "granted"; }, async requestPermission() { return "granted"; },
  });
  window.showSaveFilePicker = async (o) => handleFor(o.suggestedName);
  window.showOpenFilePicker = async () => [handleFor(localStorage.getItem("pg-fake-open"))];
});

try {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto(URL);
  await seed();
  // capture exports instead of opening a save dialog
  await page.evaluate(() => {
    window.__out = [];
    window.showSaveFilePicker = async ({ suggestedName }) => ({ createWritable: async () => ({ write: async (b) => { const u = new Uint8Array(await b.arrayBuffer()); window.__out.push([suggestedName, b.type === "image/svg+xml" ? new TextDecoder().decode(u) : Array.from(u)]); }, close: async () => {} }) });
  });
  await page.keyboard.press("s"); // snapping off: the geometry checks below assume free dragging
  const box = await page.locator(".stage").boundingBox();
  const at = (x, y) => [box.x + box.width / 2 + x, box.y + box.height / 2 + y]; // empty doc: world origin = stage centre, zoom 1
  const drag = async ([x0, y0], [x1, y1]) => { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 3 }); await page.mouse.move(x1, y1, { steps: 3 }); await page.mouse.up(); };
  // exports go through the dialog: shortcut opens it, Export button saves (fmt = radio label, default SVG)
  const exportVia = async (key, fmt) => {
    await page.keyboard.press(key);
    const dlg = page.locator(".export-dialog");
    if (fmt) await dlg.getByRole("radio", { name: fmt, exact: true }).click();
    await dlg.locator(".btn-primary").click();
    await dlg.waitFor({ state: "detached" });
  };
  const tally = () => page.locator(".tally").innerText();

  await drag(at(-50, 0), at(30, 0));
  await drag(at(50, 0), at(130, 0));
  await drag(at(0, -90), at(80, -90));
  assert.equal(await page.locator(".guides circle").count(), 3);
  assert.match(await tally(), /^3 circles · 7 regions · 0 inked/);
  await shot("1-circles");

  // a tiny drag is a click, not a circle
  await drag(at(300, 200), at(301, 200));
  assert.equal(await page.locator(".guides circle").count(), 3);

  await page.keyboard.press("i");
  await page.mouse.move(...at(0, 40));
  assert.equal(await page.locator(".face-hover").count(), 1);
  await page.mouse.click(...at(0, 40)); // lens of circles 1+2
  assert.match(await tally(), /1 inked/);
  await page.mouse.click(...at(-110, 0)); // circle 1 alone, same colour → merges with the lens
  assert.equal(await page.locator(".ink path").count(), 1);
  await shot("2-inked");

  await page.keyboard.press("Meta+z");
  assert.match(await tally(), /1 inked/);
  await page.mouse.click(...at(0, 40)); // click again lifts the ink
  assert.match(await tally(), /0 inked/);
  await page.keyboard.press("Meta+z");
  assert.match(await tally(), /1 inked/);

  // drag-paint: one stroke across circle 1 only, the lens, circle 2 only = 3 regions, one undo step
  await drag(at(-110, 40), at(110, 40));
  assert.match(await tally(), /3 inked/);
  await page.keyboard.press("Meta+z");
  assert.match(await tally(), /1 inked/);
  await drag(at(-110, 40), at(110, 40));
  await drag(at(-110, 40), at(110, 40)); // starts on an inked region: erases the whole path
  assert.match(await tally(), /0 inked/);
  await page.keyboard.press("Meta+z");
  await page.keyboard.press("Meta+z");
  assert.match(await tally(), /1 inked/);

  await exportVia("Meta+e");
  await exportVia("Meta+Shift+e");
  await page.waitForFunction(() => window.__out.length === 2);
  const [[markName, mark], [sheetName, sheet]] = await page.evaluate(() => window.__out);
  assert.equal(markName, "pergel-mark.svg");
  assert.equal(sheetName, "pergel-sheet.svg");
  const d = mark.match(/ d="([^"]+)"/)[1];
  assert.match(d, /A/);
  assert.doesNotMatch(d, /[CQSTLHV]/i, "only true arcs");
  assert.doesNotMatch(mark, /<circle/);
  assert.equal((sheet.match(/<circle /g) ?? []).length, 3);

  // moving a circle keeps its ink attached to the same overlap
  await page.keyboard.press("c");
  await drag(at(50, 0), at(60, 10));
  assert.match(await tally(), /1 inked/);
  assert.equal(await page.locator(".ink path").count(), 1);

  // autosave survives a reload
  await page.waitForTimeout(600);
  await page.reload();
  assert.match(await tally(), /^3 circles · 7 regions · 1 inked/);
  await shot("3-reloaded");

  // layers: a second layer with its own circle + ink, visibility, locking, background rect
  await page.getByRole("button", { name: "Add layer" }).click();
  assert.equal(await page.locator(".layer").count(), 2);
  assert.match(await tally(), /^0 circles/);
  await drag(at(-250, 150), at(-190, 150));
  assert.equal(await page.locator(".guides:not(.faint) circle").count(), 1);
  // H toggles the construction circles (view only); hovered/selected circle stays
  const vis = () => page.locator(".guides circle").evaluateAll((cs) => cs.filter((c) => getComputedStyle(c).opacity !== "0").length);
  await page.mouse.click(box.x + 10, box.y + 10); await page.mouse.move(box.x + 12, box.y + 12);
  assert.ok((await vis()) > 0);
  await page.keyboard.press("h"); await page.waitForTimeout(400);
  assert.equal(await vis(), 0, "H hides guides");
  await page.keyboard.press("h"); await page.waitForTimeout(400);
  assert.ok((await vis()) > 0, "H shows guides again");
  // discoverable handles: hover shows them, centre moves, rim resizes, a selected circle's interior moves, unselected interior still draws
  const act = ".guides:not(.faint) circle";
  // screen-space geometry of the first active circle: [cx, cy, r] in px
  const geo = () => page.locator(act).first().evaluate((c) => { const b = c.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, b.width / 2].map(Math.round); });
  const near = (a, b, m) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= 2), `${m}: ${a} vs ${b}`);
  const [cx, cy, R] = await geo();
  await page.mouse.click(box.x + 10, box.y + 10); // deselect (empty corner)
  await page.mouse.move(cx, cy);
  assert.equal(await page.locator(".hot .h-centre.on").count(), 1);
  assert.equal(await page.locator(".hot .hot-ring").count(), 1);
  assert.match(await page.locator(".hot .hint").textContent(), /drag to move/);
  await page.mouse.move(cx + R, cy + 5);
  assert.equal(await page.locator(".hot .h-rim.on").count(), 1);
  assert.match(await page.locator(".hot .hint").textContent(), /drag to resize · r = /);
  await drag([cx + R, cy], [cx + R + 20, cy]); // rim resize
  near(await geo(), [cx, cy, R + 20], "resized");
  assert.equal(await page.locator(".handles").count(), 1); // selected: handles stay
  await drag([cx, cy + 40], [cx, cy + 20]); // interior of the selected circle moves it
  near(await geo(), [cx, cy - 20, R + 20], "interior move");
  await drag([cx, cy - 20], [cx, cy]); // centre handle moves it back
  near(await geo(), [cx, cy, R + 20], "centre move");
  await page.mouse.click(box.x + 10, box.y + 10);
  await drag([cx, cy + 40], [cx, cy + 70]); // unselected interior still draws a new circle
  assert.equal(await page.locator(act).count(), 2);
  await page.keyboard.press("Meta+z");
  assert.equal(await page.locator(act).count(), 1);
  near(await geo(), [cx, cy, R + 20], "after undo");
  await page.keyboard.press("i");
  await page.mouse.click(...at(-250, 150));
  assert.match(await tally(), /^1 circles · 1 regions · 1 inked/);
  await shot("5-layers");
  // colour picker: type a hex, re-ink the face, the fill takes it; recolour swaps a used colour
  await page.getByRole("button", { name: /^Ink: / }).click();
  await page.getByLabel("Hex colour").fill("#12ab34");
  await page.keyboard.press("Escape");
  await page.mouse.click(...at(-250, 150)); // a different colour re-inks the face
  assert.match(await tally(), /1 inked/);
  assert.match(await page.locator(".active-layer path").last().getAttribute("fill"), /#12ab34/i);
  await shot("5b-picker");
  await page.evaluate(() => {
    window.__out = [];
    window.showSaveFilePicker = async ({ suggestedName }) => ({ createWritable: async () => ({ write: async (b) => { const u = new Uint8Array(await b.arrayBuffer()); window.__out.push([suggestedName, b.type === "image/svg+xml" ? new TextDecoder().decode(u) : Array.from(u)]); }, close: async () => {} }) });
  });
  await exportVia("Meta+e");
  await page.waitForFunction(() => window.__out.length === 1);
  let svg = (await page.evaluate(() => window.__out))[0][1];
  assert.equal((svg.match(/<g id="layer-/g) ?? []).length, 2);
  assert.doesNotMatch(svg, /<rect/);
  // hide the top layer: it leaves the sheet and the export
  await page.locator(".layer").first().getByRole("button", { name: "Hide layer" }).click();
  assert.equal(await page.locator(".layer-ink").count(), 1);
  await page.evaluate(() => { window.__out.length = 0; });
  await exportVia("Meta+e");
  await page.waitForFunction(() => window.__out.length === 1);
  svg = (await page.evaluate(() => window.__out))[0][1];
  assert.equal((svg.match(/<g id="layer-/g) ?? []).length, 1);
  await page.locator(".layer").first().getByRole("button", { name: "Show layer" }).click();
  // a locked layer cannot be drawn on
  await page.locator(".layer").first().getByRole("button", { name: "Lock layer" }).click();
  await page.keyboard.press("c");
  const before = await page.locator(".guides circle").count();
  await drag(at(-250, -150), at(-200, -150));
  assert.equal(await page.locator(".guides circle").count(), before);
  await page.locator(".layer").first().getByRole("button", { name: "Unlock layer" }).click();
  // canvas colour
  await page.locator(".bg-colour").click();
  assert.equal(await page.locator(".canvas-bg").count(), 1);
  await page.evaluate(() => { window.__out.length = 0; });
  await exportVia("Meta+e");
  await page.waitForFunction(() => window.__out.length === 1);
  svg = (await page.evaluate(() => window.__out))[0][1];
  assert.equal((svg.match(/<g id="layer-/g) ?? []).length, 2);
  assert.match(svg, /<svg[^>]*>\s*<rect [^>]*fill="#ffffff"/);
  await shot("6-bg");
  // raster exports: magic bytes + pixel size (viewBox aspect kept, 2x default scale in the dialog)
  await page.evaluate(() => { window.__out.length = 0; });
  await exportVia("Meta+e", "PNG");
  await page.waitForFunction(() => window.__out.length === 1);
  const [pngName, pngB] = (await page.evaluate(() => window.__out))[0];
  assert.equal(pngName, "pergel-mark.png");
  assert.deepEqual(pngB.slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
  const [vw, vh] = svg.match(/viewBox="[^"]*?([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const pw = (pngB[16] << 24) | (pngB[17] << 16) | (pngB[18] << 8) | pngB[19], ph = (pngB[20] << 24) | (pngB[21] << 16) | (pngB[22] << 8) | pngB[23];
  assert.equal(pw, Math.round(vw * 2)); assert.equal(ph, Math.round(vh * 2));
  await page.evaluate(() => { window.__out.length = 0; });
  await exportVia("Meta+e", "JPG");
  await page.waitForFunction(() => window.__out.length === 1);
  const [jpgName, jpgB] = (await page.evaluate(() => window.__out))[0];
  assert.equal(jpgName, "pergel-mark.jpg");
  assert.deepEqual(jpgB.slice(0, 3), [255, 216, 255]);
  assert.ok(jpgB.length > 200);
  // deleting a layer is undoable
  await page.locator(".layer").first().getByRole("button", { name: "Delete layer" }).click();
  assert.equal(await page.locator(".layer").count(), 1);
  await page.keyboard.press("Meta+z");
  assert.equal(await page.locator(".layer").count(), 2);

  // snapping: near-tangent drag lands exactly tangent with a visible guide; ⌘ bypasses; the toggle (S) turns it off
  await seed();
  await page.keyboard.press("c");
  const origin = [box.x + box.width / 2, box.y + box.height / 2];
  const stored = async () => { await page.waitForTimeout(600); return JSON.parse(JSON.parse(await page.evaluate(() => sessionStorage.getItem("pergel:session"))).text).data.layers[0].circles; };
  const gap = ([a, b]) => Math.hypot(a.cx - b.cx, a.cy - b.cy) - (a.r + b.r);
  // grab circle #1 by its centre and move it by `by`, optionally holding a modifier; returns guide count mid-drag + stored circles
  const grab = async (by, mod) => {
    const c = (await stored())[1], from = [origin[0] + c.cx, origin[1] + c.cy];
    if (mod) await page.keyboard.down(mod);
    await page.mouse.move(...from); await page.mouse.down();
    await page.mouse.move(from[0] + by[0] / 2, from[1] + by[1] / 2, { steps: 3 });
    await page.mouse.move(from[0] + by[0], from[1] + by[1], { steps: 3 });
    const guides = await page.locator(".snapg").count();
    await page.mouse.up();
    if (mod) await page.keyboard.up(mod);
    return { guides, cs: await stored() };
  };
  await drag(at(-200, 0), at(-120, 0)); // A: r 80
  await drag(at(150, -100), at(200, -100)); // B: r 50
  const [A, B] = await stored();
  // 4px beyond exactly tangent (centre distance 130 -> 134), 2px off the horizontal
  const snapped = await grab([A.cx + 134 - B.cx, A.cy + 2 - B.cy]);
  assert.ok(snapped.guides > 0, "snap guide visible during drag");
  assert.ok(Math.abs(gap(snapped.cs)) < 1e-6, `tangent after snap, gap ${gap(snapped.cs)}`);
  await shot("7-snap");
  await grab([0, 80]); // pull away (snapping may or may not engage)
  const free = await grab([-40, -77], "Meta");
  assert.equal(free.guides, 0, "no guide with ⌘ held");
  await page.locator(".snap-master").uncheck();
  assert.ok(!(await page.locator(".snap-master").isChecked()));
  const off = await grab([-0.3, 3.7]);
  assert.equal(off.guides, 0, "no guide with snapping off");
  await page.keyboard.press("s"); // shortcut turns it back on
  assert.ok(await page.locator(".snap-master").isChecked());

  // trace-over image: renders behind the drawing, never exported
  const PNG1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
  await page.locator(".underlay-input").setInputFiles({ name: "t.png", mimeType: "image/png", buffer: PNG1 });
  await page.locator("image.underlay").waitFor();
  assert.equal(await page.locator("image.underlay").count(), 1);
  await page.evaluate(() => { // the reload dropped the stub
    window.__out = [];
    window.showSaveFilePicker = async ({ suggestedName }) => ({ createWritable: async () => ({ write: async (b) => { window.__out.push([suggestedName, new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()))]); }, close: async () => {} }) });
  });
  await exportVia("Meta+Shift+e");
  await page.waitForFunction(() => window.__out.length === 1);
  const sheetSvg = (await page.evaluate(() => window.__out))[0][1];
  assert.ok(typeof sheetSvg === "string" && !/<image|data:image/.test(sheetSvg));
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  assert.equal(await page.locator("image.underlay").count(), 0);

  // golden preset adds a layer, undoable
  const nLayers = await page.locator(".layer").count();
  await page.locator(".phi-preset").click();
  assert.equal(await page.locator(".layer").count(), nLayers + 1);
  await page.keyboard.press("Meta+z");
  assert.equal(await page.locator(".layer").count(), nLayers);

  // construction reveal: circles + panels fade, R again brings them back
  const op = (sel) => page.evaluate((q) => +getComputedStyle(document.querySelector(q)).opacity, sel);
  assert.ok((await op(".guides circle")) > 0.2);
  await page.keyboard.press("r");
  await page.waitForFunction(() => +getComputedStyle(document.querySelector(".guides circle")).opacity === 0 && +getComputedStyle(document.querySelector(".panel")).opacity === 0, null, { timeout: 5000 });
  await shot("3-reveal");
  await page.keyboard.press("r");
  await page.waitForFunction(() => +getComputedStyle(document.querySelector(".guides circle")).opacity > 0.2 && +getComputedStyle(document.querySelector(".panel")).opacity === 1, null, { timeout: 5000 });
  await page.keyboard.press("r");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => +getComputedStyle(document.querySelector(".panel")).opacity === 1, null, { timeout: 5000 });

  // mirror: vertical axis through x=0; an off-axis circle gets a linked twin, moves/inks/undoes together
  await seed();
  await page.keyboard.press("c");
  await page.keyboard.press("s"); // free dragging
  const circ = async () => { await page.waitForTimeout(600); return JSON.parse(JSON.parse(await page.evaluate(() => sessionStorage.getItem("pergel:session"))).text).data.layers[0]; };
  await page.locator(".mirror-v").click();
  assert.equal((await circ()).mirror.axis, "v");
  await drag(at(100, 0), at(160, 0)); // centre x=100 (axis at 0), r=60
  let ml = await circ();
  assert.equal(ml.circles.length, 2, "off-axis circle gets one twin");
  assert.ok(Math.abs(ml.circles[1].cx + 100) < 1e-6 && ml.circles[1].mirrorOf === ml.circles[0].id, "twin is the exact mirror");
  await page.locator(".tally").waitFor();
  await drag(at(100, 0), at(130, 0)); // grab the centre handle and move the original
  ml = await circ();
  assert.ok(Math.abs(ml.circles[0].cx - 130) < 1 && Math.abs(ml.circles[1].cx + ml.circles[0].cx) < 1e-6, `twin follows: ${ml.circles.map((c) => c.cx)}`);
  const cx0 = ml.circles[0].cx;
  await page.keyboard.press("i");
  await drag(at(cx0 + 5, 0), at(cx0 + 8, 0));
  ml = await circ();
  assert.equal(ml.fills.length, 2, "inking a face inks its mirror");
  assert.ok(ml.fills.some((f) => f.x < 0) && ml.fills.some((f) => f.x > 0));
  await page.keyboard.press("Meta+z");
  assert.equal((await circ()).fills.length, 0, "one undo reverts the ink gesture");
  await page.keyboard.press("Meta+z");
  assert.equal((await circ()).circles[0].cx, 100, "one undo reverts the move with its twin");
  assert.equal((await circ()).circles.length, 2);
  await shot("5-mirror");

  // canvas frame: visible, dims outside, W/H inputs and corner drag resize it, export is exactly the frame
  const fr = () => page.locator(".frame-line").evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const f0 = await fr();
  assert.ok(f0.w > 100 && f0.h > 100, "frame visible");
  assert.equal(await page.locator(".frame-dim").count(), 1);
  assert.equal(await page.locator(".frame-h").count(), 8);
  assert.match(await page.locator(".frame-label").textContent(), /512 × 512/);
  assert.equal(await page.locator(".panel-right .frame-in-w").count(), 1, "canvas controls live in the right pane");
  assert.equal(await page.locator(".panel-left .layer").count() > 0, true, "layers live in the left pane");
  assert.equal(await page.locator(".dock .seg-btn").count(), 2, "compass/ink switch in the bottom dock");
  await page.locator(".frame-in-w").fill("420"); await page.locator(".frame-in-h").fill("640"); await page.locator(".frame-in-h").blur();
  await page.waitForFunction(() => /420 × 640/.test(document.querySelector(".frame-label")?.textContent ?? ""));
  await page.locator(".stage").click({ position: { x: 5, y: 5 } }); await page.keyboard.press("0"); // fit view: the whole frame on screen
  await page.waitForTimeout(100);
  const f1 = await fr();
  assert.ok(Math.abs(f1.w / f1.h - 420 / 640) < 0.01, "inputs resize the frame");
  await shot("8-frame");
  const z1 = f1.w / 420;
  await page.mouse.move(f1.x + f1.w, f1.y + f1.h); await page.mouse.down();
  await page.mouse.move(f1.x + f1.w + 40 * z1, f1.y + f1.h + 20 * z1, { steps: 4 }); await page.mouse.up();
  await page.waitForFunction(() => /460 × 660/.test(document.querySelector(".frame-label")?.textContent ?? ""));
  await page.keyboard.press("Meta+z");
  await page.waitForFunction(() => /420 × 640/.test(document.querySelector(".frame-label")?.textContent ?? ""));
  await page.mouse.move(f1.x + f1.w, f1.y + f1.h); await page.mouse.down();
  await page.mouse.move(f1.x + f1.w + 40 * z1, f1.y + f1.h + 20 * z1, { steps: 4 }); await page.mouse.up();
  await page.evaluate(() => {
    window.__out = [];
    window.showSaveFilePicker = async ({ suggestedName }) => ({ createWritable: async () => ({ write: async (b) => { const u = new Uint8Array(await b.arrayBuffer()); window.__out.push([suggestedName, b.type === "image/svg+xml" ? new TextDecoder().decode(u) : Array.from(u)]); }, close: async () => {} }) });
  });
  await exportVia("Meta+Shift+e");
  await page.waitForFunction(() => window.__out.length === 1);
  svg = (await page.evaluate(() => window.__out))[0][1];
  assert.match(svg, /width="460" height="660" viewBox="-?[\d.]+ -?[\d.]+ 460 660"/);

  // projects: start page, New, Save as -> .pergel, autosave to the fake handle, reload keeps the project, foreign change = conflict
  await page.evaluate(() => { localStorage.setItem("pg-fake-fsa", "1"); localStorage.removeItem("pg-fake-files"); localStorage.removeItem("pg-fake-writes"); });
  const waitFor = async (fn, ms = 4000) => { for (let i = 0; i < ms; i += 100) { if (await fn()) return true; await page.waitForTimeout(100); } return false; };
  const fake = (n) => page.evaluate((k) => JSON.parse(localStorage.getItem("pg-fake-files") || "{}")[k] ?? null, n);
  const writes = () => page.evaluate(() => +localStorage.getItem("pg-fake-writes"));
  const snapOn = async (n) => JSON.parse(await fake(n)).data.snap.on;
  const chip = () => page.getAttribute("[data-testid=autosave-status]", "data-state");
  await setSession(null);
  await page.locator("[data-testid=start-page]").waitFor();
  assert.equal(await page.locator(".stage").count(), 0, "start page replaces the sheet");
  await shot("5-start");
  await page.locator("[data-testid=start-new]").click();
  await page.locator(".stage").waitFor();
  assert.equal(await page.locator("[data-testid=proj-name]").innerText(), "Untitled");
  assert.equal(await chip(), "nofile");
  await page.keyboard.press("s"); // a doc edit (snap toggle)
  await page.locator("[data-testid=dirty]").waitFor();
  await page.waitForTimeout(1400); // absence check: AUTOSAVE_DELAY is 1000 ms
  assert.equal(await writes(), 0, "an untitled project never autosaves");
  await page.locator("[data-testid=pj-saveas]").click();
  assert.ok(await waitFor(async () => (await fake("untitled.pergel")) !== null), "Save as wrote untitled.pergel");
  assert.match(await fake("untitled.pergel"), /^\{\n  "app": "pergel",/, "pretty-printed envelope");
  assert.ok(await waitFor(async () => (await chip()) === "saved" && (await page.locator("[data-testid=dirty]").count()) === 0), "saved: chip + no dirty dot");
  const was = await snapOn("untitled.pergel");
  await page.waitForTimeout(1400);
  const w0 = await writes();
  await page.keyboard.press("s");
  assert.ok(await waitFor(async () => (await snapOn("untitled.pergel")) !== was), "an edit autosaves to the handle");
  assert.ok(await waitFor(async () => (await page.locator("[data-testid=dirty]").count()) === 0), "autosave clears the dirty dot");
  assert.equal(await writes(), w0 + 1, "one write for one edit");
  await shot("6-autosaved");
  await page.reload();
  await page.locator(".stage").waitFor();
  assert.equal(await page.locator("[data-testid=proj-name]").innerText(), "untitled", "reload keeps the project");
  assert.equal(await page.locator("[data-testid=start-page]").count(), 0);
  // (the fake handle cannot be stored in IndexedDB, so the link is gone: Save as re-binds one)
  await page.locator("[data-testid=pj-saveas]").click();
  assert.ok(await waitFor(async () => (await chip()) === "saved"));
  const mine = await snapOn("untitled.pergel");
  await page.evaluate(() => { const f = JSON.parse(localStorage.getItem("pg-fake-files")); const e = JSON.parse(f["untitled.pergel"]); e.data.snap.on = !e.data.snap.on; e.data.ink = "#112233"; f["untitled.pergel"] = JSON.stringify(e, null, 2); localStorage.setItem("pg-fake-files", JSON.stringify(f)); });
  await page.keyboard.press("s");
  assert.ok(await waitFor(async () => (await chip()) === "conflict"), "a foreign change under an unsaved edit pauses autosave");
  assert.equal(JSON.parse(await fake("untitled.pergel")).data.ink, "#112233", "the foreign content was not overwritten");
  await shot("7-conflict");
  await page.locator("[data-testid=autosave-mine]").click();
  assert.ok(await waitFor(async () => (await chip()) === "saved" && JSON.parse(await fake("untitled.pergel")).data.ink !== "#112233"), "Use mine overwrites");
  void mine;
  await page.evaluate(() => localStorage.removeItem("pg-fake-fsa"));

  // theme flip renders in dark too
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await shot("4-dark");

  assert.deepEqual(errors, []);
  console.log("pergel check: ok");
} finally {
  await browser.close();
}
