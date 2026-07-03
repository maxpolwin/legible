# Figma Community listing — draft copy

Draft text for the Community publish dialog (Plugins → Development → Manage
plugins in Development → **Publish**). Figma's own dropdowns (category, tags)
are authoritative — the options below are a starting point to paste and
adjust on the day, not a guarantee of what's currently offered.

## Tagline

Real text PDFs from Figma — not vector outlines. Selectable, searchable,
screen-reader-ready, and ATS-parseable.

## Description

Figma's native PDF export converts every character to a vector outline.
Nothing is selectable, nothing is searchable, and applicant-tracking systems
(Greenhouse & friends) extract zero characters from a Figma-designed résumé.
Screen readers get nothing either — just shapes.

Legible rebuilds the export instead of outlining it: real, embedded,
subsetted fonts and a hand-built tagged PDF structure tree, laid out exactly
where Figma drew it.

**What you get:**

- True, selectable, copy-pasteable text — not outlines
- ATS-parseable: applicant-tracking systems can actually read the content
- Screen-reader-navigable: tagged structure tree (headings/paragraphs/links),
  reading order you control
- Pixel-perfect placement, including mixed bold/italic runs, letter-spacing,
  underline/strikethrough, and rotated text
- Working hyperlinks at the exact text location
- Smart line-wrap reconstruction, so wrapped words and force-wrapped URLs
  extract cleanly instead of splitting mid-word
- Multi-frame merge into one PDF, with drag-and-keyboard reordering
- A DPI control with ATS / Balanced / Print guidance and a live size estimate
- Fonts you don't have permission to embed automatically fall back to vector
  outlines for just that text — export never blocks, and the report tells
  you exactly what happened and where

**Why it asks for font files:** the Figma plugin API doesn't expose font
binaries, and Legible makes zero network requests by design — everything
runs offline, with no telemetry. So the first export asks you to drop in the
`.ttf`/`.otf` files your design uses; it remembers them for next time.

Built originally for exporting Figma-designed résumés/CVs that need to
survive an ATS — but works for any frame: reports, one-pagers, posters with
real body copy.

## Category

Closest official fits: **Productivity** or **Accessibility** if either
exists in the live dropdown at publish time; otherwise **Design tools**.

## Tags (max 5)

1. PDF export
2. accessibility
3. ATS
4. screen reader
5. tagged PDF

## Support contact

https://github.com/maxpolwin/legible/issues

## Cover image / carousel

Draft cover banner: [assets/cover.png](assets/cover.png) (1920×1080, reuses
the icon's outline-to-text motif). Figma allows up to 9 additional
images/videos in the carousel — **not started**: genuine in-product
screenshots require running the plugin inside the Figma desktop app, which
this environment cannot do. Grab these once you've done the in-Figma
verification pass in [TESTING.md](TESTING.md) — the export report panel and
the reading-order UI are the two screens most worth showing.
