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

Cover banner: [assets/cover.png](assets/cover.png) (1920×1080, reuses the
icon's outline-to-text motif).

Carousel screenshots, captured against a dummy Lorem Ipsum CV in Figma:

- [assets/screenshot-cv-pages.png](assets/screenshot-cv-pages.png) — the
  two-page demo CV rendered in Figma, showing headings, mixed bold/italic
  subheadings, bullet lists, and a live hyperlink.
- [assets/screenshot-report.png](assets/screenshot-report.png) — the Legible
  panel with fonts embedded and ready ("Lato Bold ready" / "Lato Regular
  ready") right before export.
- [assets/screenshot-reading-order.png](assets/screenshot-reading-order.png)
  — the reading-order list, showing every paragraph with up/down reorder
  controls.

Figma allows up to 9 images/videos in the carousel, so there's room for more;
a short drag-reorder demo GIF is still **not started**.
