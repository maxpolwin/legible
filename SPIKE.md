# Spike: PDF construction library (§12 decision)

**Status: pdf-lib selected (per the default decision rule) and confirmed by
veraPDF (PDF/UA-1, 106/106 rules, 1189/1189 checks — see below). Screen-reader
spot check still pending; see "Pending validation" below.**

## Decision rule (from requirements §12)

> Default to pdf-lib unless it (a) fails veraPDF's tagged-PDF validation or
> (b) its estimated effort exceeds ~3x the pdf-writer/WASM estimate.

## What was built and validated (pdf-lib branch)

A complete tagged-PDF pipeline on pdf-lib 1.17 with a hand-built structure
tree ([src/lib/pdf/tags.ts](src/lib/pdf/tags.ts)) and raw marked-content
operators ([src/lib/pdf/ops.ts](src/lib/pdf/ops.ts)):

- StructTreeRoot → Document → P/Figure elements, Link elements with OBJR,
  ParentTree number tree (pages + annotations), ParentTreeNextKey,
  /StructParents on pages, /StructParent on link annotations,
  /MarkInfo /Marked true, /Lang, DisplayDocTitle.
- BDC/EMC with inline MCID property dicts around every content run;
  backgrounds and decoration wrapped as /Artifact.
- /ActualText on paragraphs whose line wraps would split keywords (FR-7);
  /Alt on outline-fallback Figures (FR-5).

Verified automatically (see `npm test`, 58 tests):

- pdf.js `getTextContent` extracts 100% of drawn text, including äöüß and
  ligature-prone words (fi/fl/ffi map back to ASCII pairs via the ToUnicode
  CMap pdf-lib+fontkit generate from `glyph.codePoints`).
- `pdffonts`: embedded (emb=yes), subsetted (sub=yes, with proper ABCDEF+
  subset tags added by Legible), unicode-mapped (uni=yes).
- `pdftotext`: full text in correct column-aware reading order.
- Structure tree round-trips through a pdf-lib re-parse with all invariants
  checked by tests.
- Renders pixel-correct in poppler (independent renderer) and pdf.js.

Effort actually spent on the tagged-PDF layer: ~350 lines including tests —
well under any plausible 3x threshold.

## pdf-writer (Rust/WASM) branch

Not exercised. Rationale for stopping early: the decision rule only requires
the WASM prototype when pdf-lib fails validation or balloons in effort;
neither happened. The known trade-offs stand as researched: first-class
structure-tree API vs. WASM toolchain, bundle size, and CSP/eval concerns in
the plugin iframe.

## veraPDF result (2026-07-03)

`veraPDF --flavour ua1 demo/legible-demo.pdf`: initially 2 failures out of
1182 checks — both incremental gaps, not architecture problems, exactly as
anticipated:

- ISO 14289-1:2014 §7.18.3: pages with a link annotation need `/Tabs /S`.
  Fixed in [build.ts](src/lib/pdf/build.ts) where the link annotation is
  added to the page.
- ISO 14289-1:2014 §7.1: the Catalog needs an XMP metadata stream. Added
  `attachMetadataStream()` in [tags.ts](src/lib/pdf/tags.ts), wired from
  `buildPdf` in `build.ts`.

Re-run after the fix: **compliant**, 106/106 rules, 1189/1189 checks.

## Pending validation (the review gate)

1. ~~veraPDF~~ — done, compliant (above).
2. **Screen-reader spot check** on a real export (VoiceOver + Preview/Acrobat).

If a future screen-reader check surfaces something pdf-lib cannot express,
revisit the pdf-writer/WASM branch per the original decision rule.
