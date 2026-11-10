# pergel

Draft a logo with a compass: swing circles, ink the regions where they overlap, and export a clean true-arc SVG.

- Exact output: paths use only circular arcs, with same-colour neighbours merged into one shape
- Construction sheet export: the mark plus every circle as a hairline
- Layers: stack circle sets, hide, lock, reorder; each layer has its own fills and optional mirror axis
- Snapping to tangents, concentric circles, vertices and golden-ratio sizes, so no slivers are left behind
- Canvas frame you set to the exact export size (presets or fit to the drawing)
- Export as SVG, PNG, JPG or WebP; trace a reference image underneath the drawing
- Projects: open and save `.pergel` files, autosave to the same file, recent projects on a start page
- Static web app, local-only, no backend or account

## Run

```
npm install
npm run dev         # vite on http://127.0.0.1:5251
```

`./start.sh` does the same on macOS and opens Chrome for you. Saving and autosaving to files uses the File System
Access API, so use a Chromium browser (Chrome, Edge) for that.

## Test

```
npm test            # unit tests (node:test): faces, snapping, hit testing, ink painting, mirrors, colour, export, sanitizing, projects
npm run verify      # tests + build + headless Chrome: layers, drawing, snapping, ink, mirror, export, reload
PERGEL_SHOTS=/tmp/pergel npm run verify   # same, keeps screenshots
```

`verify` needs Google Chrome or Chromium (set `CHROME_PATH` if it is not in a standard location).

## Use

The left pane holds layers, the ink colour, the selection and mirror settings. The right pane holds the canvas,
background, snapping, trace, reveal and export. The bottom-centre dock switches compass and ink and toggles circle lines.

- **Start and projects**: a new tab opens a start page with recent projects. The top bar's second row shows the
  project name, New, Open, Save and Save as (⌘⇧S), and an autosave switch with its status. Autosave writes back to
  the file you saved, about a second after your last change. An untitled drawing lasts as long as its tab, until you save it.
- **Compass** (`C`): drag on the sheet from a centre point to swing a circle. Drag a centre cross to move (the whole
  selection moves together), drag a rim to resize. Click a rim/centre to select, ⇧/⌘-click to add, ⇧-drag on empty
  sheet for a rubber band. Arrows nudge (⇧ = 10), ⌘D duplicates, ⌫ deletes (with Undo toast), ⌘A selects all.
  Exact `x / y / r` in the left pane's Selection section (several selected: blank = "Mixed").
- **Ink** (`I`): hover shows the region under the pointer, click inks it in the current ink colour, click again
  lifts it (a different colour recolours it). Drag to paint many regions in one stroke; Shift-drag erases.
  Neighbouring regions of one colour export as one merged path.
- **Layers** (panel): add, rename, delete (undoable), reorder, hide, lock. Click a layer to make it active. Compass,
  ink and tally act on the active layer only; other layers show as faint guides.
- **Snapping** (`S`): new and moved circles snap to tangents, concentric circles, vertices and golden-ratio radii.
  Hold ⌘ / Ctrl to place freely. The Snap panel sets which kinds are on and the base radius.
- **Mirror**: per layer, mirror across a vertical, horizontal or both axes; drag the dash-dot axis in compass mode.
- **Colour**: a picker with a colour field, hue, alpha (background only), hex/RGB/HSL, an eyedropper where the browser has one,
  and swatches from the drawing. The Ink panel's Recolour swaps one colour for the ink across the active layer.
- **Canvas**: set the width and height, pick a preset (512², 1024², 420×640, 1920×1080) or fit it to the drawing.
  Drag the outline's eight handles to resize it. Background is transparent or a solid colour, filling only the canvas.
- **Trace**: place a PNG/JPG/WebP/SVG (up to 8 MB) under the drawing as a guide.
- **Circle lines** (`H`) hide the construction lines; **Reveal** (`R`) fades the chrome and shows just the mark.
- **Export** (⌘E = the mark, ⌘⇧E = construction sheet): choose SVG, PNG, JPG or WebP, scale, and background. The file is
  the canvas size. The trace image and mirror axis are never exported. SVG paths use only `M`/`A`/`Z`.
- Wheel pans, pinch / ⌘-wheel zooms, `0` fits the drawing. ⌘Z / ⌘⇧Z undo and redo. ⌘S saves, ⌘⇧S saves as, ⌘O opens
  (`.pergel` files; older `.json` files still open).

## How it works

`src/geom/arrange.js` turns each layer's circles into faces: pairwise intersections (ε-merged, tangency = one vertex) → arcs
between consecutive vertices → for each inside-set, a face walk (angle-ordered, secant directions so tangent arcs still sort)
gives loops; positive-area loops are faces, negative ones are holes of the smallest containing face. Ink is stored per
layer as `{ids (circles the region is inside), x, y, color}` so it follows its overlap when circles move. Merging drops
arcs shared by two same-colour faces and re-walks the rest. `src/geom/doc.js` holds the document shape, the sanitizer for
opened and stored files, and `exportSVG()`. Snapping (`snap.js`), hit testing (`hit.js`), paint drags (`paint.js`) and
mirrors (`mirror.js`) are pure functions with their own tests. Rasterising and saving live in `src/export.js`.

## Vendored `look`

`vendor/look/` is a copy of the shared UI package (design tokens, kit components, Settings → Appearance) that
the author uses across apps. Its `look.js` is generated upstream; edit it only if you mean to fork it.

## License

MIT, see `LICENSE`.
