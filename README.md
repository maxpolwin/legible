# Legible

Export Figma frames as **genuinely machine-readable PDFs** — selectable,
searchable, ATS-parseable, screen-reader-navigable — without giving up the
pixel-perfect layout.

Figma's native PDF export converts all text to vector outlines: nothing is
selectable, searchable or copy-pasteable, ATS systems (Greenhouse & friends)
extract zero characters, screen readers get nothing, and a 2-page text CV
weighs 2.6 MB. Legible rebuilds the export with real, embedded, subsetted
fonts and a tagged structure tree — the same document lands at ~20–100 KB
with 100% extractable text.

**Status:** dev/private. Built for the Figma-native CV workflow; Community
publishing is a later step.

## What it does

- **True-text PDF** from selected frames (or the whole file if nothing is
  selected, with a confirm step above 20 frames). One merged PDF per export.
- **Pixel-perfect placement** — line/run baselines come from Figma's own SVG
  export (`svgOutlineText: false`), so the PDF text sits exactly where Figma
  drew it. Bold/mixed styles, letter-spacing, underline/strikethrough,
  rotation via the PDF text matrix.
- **Ligature-safe extraction** — the ToUnicode CMap maps fi/fl/ffi/ffl back
  to plain ASCII pairs (verified by tests against pdftotext/pdf.js).
- **Line-wrap reconstruction (FR-7)** — wrapped lines rejoin into whole
  keywords; force-wrapped tokens (URLs) get `/ActualText`; soft hyphens never
  leak into extraction.
- **Tagged PDF** — hand-built `StructTreeRoot` → `Document` → `P`/`Link`/
  `Figure` with MCIDs, ParentTree, `/MarkInfo`, `/Lang`; backgrounds are
  `/Artifact`. Reading order is column-aware (recursive XY-cut: leftmost
  column completes before the next), overridable per node in the UI.
- **Hyperlinks preserved** — link annotations with URI actions at the exact
  text rectangles, wired into the structure tree via OBJR.
- **Multi-frame ordering** — canvas position by default, drag *and*
  keyboard move buttons to reorder.
- **Filename pattern persistence** — `yyyymmdd - name.pdf`, date always
  today, name remembered via `figma.clientStorage`.
- **Raster control** — DPI input with ATS (≤96) / Balanced (≤150) / Print
  zone badge (icon + label, not color-only) and a live size estimate. Vector
  text is unaffected by DPI.
- **Non-embeddable fonts never block** — restricted-license (fsType) or
  missing fonts fall back to vector outlines (raster as last resort) for the
  affected nodes only; the post-export report says exactly what and where,
  and the structure tree carries the original text as `/Alt`.
- **German diacritics** (ä ö ü ß) verified end-to-end.
- **Fully offline** — `networkAccess.allowedDomains: ["none"]`, zero
  telemetry. Architectural invariant, not a setting.

## Why the plugin asks for font files

The Figma plugin API does not expose font binaries, and Legible makes no
network requests by design. So the first time you export, drop the `.ttf` /
`.otf` files for the fonts your design uses onto the Fonts panel. With
"Remember fonts" enabled they are stored in `figma.clientStorage` (local to
your machine) and future exports are one click. License embedding flags
(OS/2 `fsType`) and glyph coverage (e.g. umlauts) are checked before export.

## Getting started

```sh
npm install
npm run build        # bundles the plugin and writes manifest.json
```

In the **Figma desktop app**: Plugins → Development → *Import plugin from
manifest…* → pick `manifest.json` in this folder. Then run **Legible** from
the plugins menu.

Development loop: `npm run watch`.

## Verifying an export (§3 success criteria)

```sh
pdffonts  "20260703 - MyCV.pdf"    # emb=yes, sub=yes, uni=yes for every font
pdftotext "20260703 - MyCV.pdf" -  # complete text, correct reading order
```

Or generate a synthetic sample without Figma: `npm run fixtures && npm run demo`.

## Testing & CI

```sh
npm run fixtures   # fetch OFL test fonts (dev-only; gitignored)
npm test           # Vitest: extraction, ordering, CMap, tagging, links, sizes
```

See [TESTING.md](TESTING.md) for the in-Figma verification checklist and the
visual-regression setup (pixel-diff vs Figma-exported PNGs, 0.1% threshold).
CI (GitHub Actions) runs tests, build, demo generation, visual diff, plus
Gitleaks and Semgrep; Socket.dev attaches as a GitHub App.

The library decision (pdf-lib vs pdf-writer/WASM) is documented in
[SPIKE.md](SPIKE.md) — including the still-open veraPDF/screen-reader gate.

## Architecture

```
src/main.ts              Figma main thread: scope, extraction, background
                         render (text hidden via opacity), fallbacks, storage
src/ui.tsx               Preact UI: fonts, ordering, filename, DPI, report
src/lib/
  svgtext.ts, xml.ts     Parse Figma's SVG export (dependency-free XML parser
                         — works in the plugin sandbox and in Node tests)
  attribute.ts           Merge styled-text segments onto positioned runs
  order.ts               Column-aware reading order (recursive XY-cut)
  linewrap.ts            FR-7 wrap reconstruction + /ActualText gate
  fontmatch.ts           Family/style matching + fsType embedding policy
  svgpath.ts, matrix.ts  Path/affine math for outline fallback & rotation
  estimate.ts            DPI zones + live size estimate
  filename.ts            yyyymmdd pattern
  pdf/build.ts           PDF assembly (pdf-lib + fontkit, subset embedding)
  pdf/tags.ts            Hand-built tagged-PDF structure tree
  pdf/ops.ts             Raw content-stream operators (BDC/EMC, text, paths)
```

Main thread extracts (Figma APIs live there); the UI iframe owns fonts and
PDF construction; both sides share the pure `lib/` modules, which is what
makes the pipeline unit-testable outside Figma.

## License

[MIT](LICENSE). Test fonts (Lato, EB Garamond) are fetched at dev time under
the SIL OFL and are not part of this repository.
