# Spike: PDF construction library (§12 decision)

**Status: pdf-lib selected (per the default decision rule). Review before FR-1 goes
into production use — see "Pending validation" below.**

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

## Pending validation (the review gate)

1. **veraPDF**: not yet run (needs a local Java runtime). Command:
   `veraPDF --flavour ua1 demo/legible-demo.pdf` after `npm run demo`.
   The structure produced follows ISO 32000-1 §14.7/14.8; if veraPDF flags
   gaps (e.g. role-map or heading-level expectations for PDF/UA), they are
   incremental fixes in `tags.ts`, not architecture changes.
2. **Screen-reader spot check** on a real export (VoiceOver + Preview/Acrobat).

If either fails in a way that pdf-lib cannot express, revisit the
pdf-writer/WASM branch per the original decision rule.
