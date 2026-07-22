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

- [x] **SVG text export origin.** Extraction assumes `SVG_STRING` export of a
      text node uses the node's bounding-box top-left as origin, with
      per-line `<tspan x y>` baselines. Check: exported text sits exactly on
      the Figma layout (overlay the PDF on a frame PNG; `scripts/visual-diff.mjs`
      against a Figma PNG export at 144 dpi automates this).
- [x] **Rotated text nodes.** Rotation is expected to arrive as a `transform`
      on the SVG group and is carried into the PDF text matrix. Verify with a
      rotated label.
- [x] **Text inside component instances and auto-layout** is found, hidden
      for the background render (opacity override), and restored afterwards.
- [x] **Mixed-style runs** (bold span inside a regular paragraph) keep exact
      x-offsets from the tspans.
- [x] **Hyperlink rects** land on the link text (FR-6) — click them in
      Preview and Acrobat.
- [x] **Background render** (any frame with shapes/images): text is absent
      from the raster and drawn as vector text on top; opacities restored
      (no document dirty state beyond the export).
- [x] **Non-embeddable font path**: temporarily mark a font unmatched (don't
      provide its file) → export completes, node becomes vector outlines,
      report names the node, structure tree carries /Alt.
- [x] **Reading order UI**: drag + keyboard buttons reorder pages; per-frame
      "Reading order" list reorders paragraphs; tab order sensible; focus
      visible on every control.
- [x] **Performance**: 2-page export < 5 s; progress indicator visible for
      longer runs (§8).
- [x] **Filename persistence** across plugin restarts (FR-3).
- [ ] **Filename default** (FR-3): open the plugin in a fresh file → the box
      is prefilled with `yyyymmdd - <file name>` and "Saves as" appends
      `.pdf`; a name typed in file A must not leak into file B; in an
      "Untitled" file the page (tab) name is used instead.
- [ ] **Filename editability** (FR-3): overwrite the date prefix (e.g. to
      `20260101 - …`) → the export uses exactly that; changing the Figma
      selection afterwards must not reset the edit; reopening the plugin
      restores the name with *today's* prefix, not the edited one.
- [ ] **Language dropdown**: pick a tag → `/Lang` in the exported PDF matches;
      "Other language tag…" accepts a hand-typed tag (`gsw-CH`), lowercases
      to canonical form, and an invalid tag (`german`) is omitted from the
      PDF and named in the export report.
- [x] **veraPDF** — PDF/UA-1 compliant, see [SPIKE.md](SPIKE.md).
- [x] **Screen reader spot check** — see [SPIKE.md](SPIKE.md).

## Visual regression references

Export each frame from Figma as PNG at **2x** (144 dpi) into
`test/references/page-<n>.png`, then run the diff against the exported PDF.
CI runs the check automatically once references are committed (threshold:
0.1% differing pixels, §8).

## Publishing checklist (Figma Community)

In-Figma verification checklist above is complete — all checks passed.
Remaining before publish:

- [ ] Commit `test/references/page-<n>.png` so CI's visual-diff check runs
- [ ] `npm run build` (production, not `watch`) and inspect the bundle —
      confirm no dev-only artifacts ship (e.g. anything tied to the
      `legible-dev` plugin id in `package.json`, which Figma replaces with
      its own id on first publish anyway)
- [ ] Support contact (GitHub issues link or email) for the listing
- [ ] Cover image / banner (check current Figma-required size)
- [ ] Listing tagline + description (draft: the `package.json` description)
- [ ] Category + tags (e.g. Productivity/Accessibility; "PDF export",
      "accessibility", "ATS")
- [ ] Screenshots or demo GIF of the plugin in use
- [ ] Figma desktop → Plugins → Development → Manage plugins in Development
      → **Publish**
- [ ] Attach `assets/icon.png` in the publish dialog (manifest.json can't
      carry an icon field — confirmed empirically, see project memory)
- [ ] Submit for Figma review
