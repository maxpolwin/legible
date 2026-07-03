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

**Apps** — confirmed live in the publish wizard 2026-07-03 (there is no
Productivity/Accessibility category for plugins; those only appear as
sub-categories under Print/templates. Apps is the top-level category Figma
uses for plugins.)

## Tags (max 5)

Confirmed live in the publish wizard 2026-07-03 — typed into "Custom tags"
one at a time, each matched an existing tag via Figma's autocomplete
(shown with a resource count), so these are the exact strings to reuse:

1. pdf
2. ats
3. cv
4. accessibility
5. screen reader

## Data security questionnaire

Step 3 of the publish wizard ("Data security") requires checking "I agree to
share this information", which then reveals a 5-question form. Answers below
are derived directly from the source (`figma-plugin.networkAccess` in
`package.json`, and the `figma.clientStorage` calls in `src/main.ts`) and
should stay correct as long as those don't change:

1. **Do you host a backend service for your plugin/widget?**
   → "No, I do not host a backend service for my plugin/widget."
2. **Does your plugin/widget make any network requests with services you do
   not host?**
   → "My plugin/widget does not make any network requests." (matches
   `networkAccess.allowedDomains: ["none"]`)
3. **Does your plugin/widget use any user authentication?**
   → "No, my plugin/widget does not require or use any user authentication."
4. **Do you store any data read/derived from Figma's plugin API?**
   → "Yes, my plugin/widget stores data read/derived from Figma's plugin API
   locally (eg. localStorage, figma.clientStorage, or node.setPluginData)."
   (true: `figma.root.name` and font files are persisted via
   `figma.clientStorage`, all local to the user's machine)
5. **How do you manage updates to your plugin/widget?**
   → "I am a solo developer. I manage and update my plugin/widget myself."

## Plugin ID

Figma generates this on Step 4 ("Add the final details") via a
"Generate ID..." button next to "Invalid ID in manifest.json" — already
done: `1654888182581252507`, committed into `figma-plugin.id` in
`package.json` (replacing the `legible-dev` dev placeholder), which
`npm run build` turns into `manifest.json`. No need to regenerate on a
repeat pass through the wizard; it should show as valid immediately.

## Support contact

https://github.com/maxpolwin/legible/issues

Note: the wizard pre-fills this field with the Figma account's own email
(a `@simplelogin.com` alias) — it must be manually cleared and replaced with
the URL above.

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

- [assets/demo.mp4](assets/demo.mp4) — a full feature-tour video (converted
  from `assets/demo.gif`, which Figma's carousel picker rejects — it only
  accepts static images and video, not animated GIF): fonts going ready,
  reordering paragraphs in the reading-order list, setting the PDF
  author/locale metadata, sliding the DPI control from ATS through Balanced
  to Print, and exporting. `assets/demo.gif` is kept in the repo for use
  elsewhere (e.g. the README), just not uploaded to Community.

Figma allows up to 9 images/videos in the carousel, so there's room for more
if useful.
