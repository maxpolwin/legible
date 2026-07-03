# Testing

## Automated

```sh
npm run fixtures   # once: fetch OFL test fonts (Lato, EB Garamond)
npm test           # 58 Vitest tests: extraction, ordering, CMap, tags, links…
npm run build      # typecheck + bundle the plugin
npm run demo       # generate demo/legible-demo.pdf straight from the builder
node scripts/visual-diff.mjs demo/legible-demo.pdf test/references
```

Acceptance tools (§3):

```sh
pdffonts demo/legible-demo.pdf    # expect: emb=yes, sub=yes, uni=yes
pdftotext demo/legible-demo.pdf - # expect: full text, column-aware order
```

## In-Figma verification checklist (first run on the real CV file)

The unit tests cover everything that runs outside Figma. The following
assumptions about Figma's export behaviour must be confirmed once inside the
desktop app (Plugins → Development → Import plugin from manifest…):

- [ ] **SVG text export origin.** Extraction assumes `SVG_STRING` export of a
      text node uses the node's bounding-box top-left as origin, with
      per-line `<tspan x y>` baselines. Check: exported text sits exactly on
      the Figma layout (overlay the PDF on a frame PNG; `scripts/visual-diff.mjs`
      against a Figma PNG export at 144 dpi automates this).
- [ ] **Rotated text nodes.** Rotation is expected to arrive as a `transform`
      on the SVG group and is carried into the PDF text matrix. Verify with a
      rotated label.
- [ ] **Text inside component instances and auto-layout** is found, hidden
      for the background render (opacity override), and restored afterwards.
- [ ] **Mixed-style runs** (bold span inside a regular paragraph) keep exact
      x-offsets from the tspans.
- [ ] **Hyperlink rects** land on the link text (FR-6) — click them in
      Preview and Acrobat.
- [ ] **Background render** (any frame with shapes/images): text is absent
      from the raster and drawn as vector text on top; opacities restored
      (no document dirty state beyond the export).
- [ ] **Non-embeddable font path**: temporarily mark a font unmatched (don't
      provide its file) → export completes, node becomes vector outlines,
      report names the node, structure tree carries /Alt.
- [ ] **Reading order UI**: drag + keyboard buttons reorder pages; per-frame
      "Reading order" list reorders paragraphs; tab order sensible; focus
      visible on every control.
- [ ] **Performance**: 2-page export < 5 s; progress indicator visible for
      longer runs (§8).
- [ ] **Filename persistence** across plugin restarts (FR-3).
- [ ] **veraPDF + screen reader** — see [SPIKE.md](SPIKE.md), pending gate.

## Visual regression references

Export each frame from Figma as PNG at **2x** (144 dpi) into
`test/references/page-<n>.png`, then run the diff against the exported PDF.
CI runs the check automatically once references are committed (threshold:
0.1% differing pixels, §8).
