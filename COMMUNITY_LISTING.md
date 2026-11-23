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

legible PDF rebuilds the export instead of outlining it: real, embedded,
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
- Inter, Roboto, Open Sans and Lato are built in — no font upload needed for
  designs that use them
- Any other font works too, static or variable: add the files once, they're
  remembered, and you can remove them any time to free space
- A clear warning before export if some text would fall back to outlines
- Fonts you don't have permission to embed automatically fall back to vector
  outlines for just that text — export never blocks, and the report tells
  you exactly what happened and where

**Why other fonts need a file:** the Figma plugin API doesn't expose font
binaries, and legible PDF makes zero network requests by design — everything
runs offline, with no telemetry. So for fonts that aren't built in, you add the
`.ttf`/`.otf` files once (Google Fonts' variable files work too); they're saved
on your machine and reused for every export.

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

Carousel screenshots (taken from the real built plugin UI, run against text
from an actual CV; regenerate after UI changes):

- [assets/screenshot-cv-pages.png](assets/screenshot-cv-pages.png) — the
  two-page demo CV rendered in Figma, showing headings, mixed bold/italic
  subheadings, bullet lists, and a live hyperlink.
- [assets/screenshot-fonts.png](assets/screenshot-fonts.png) — frames to
  export plus the Fonts panel with Inter shown as "built-in".
- [assets/screenshot-saved-fonts.png](assets/screenshot-saved-fonts.png) — a
  variable font (Source Sans 3) added once, shown as saved with its size, the
  storage meter and a Remove button.
- [assets/screenshot-outline-warning.png](assets/screenshot-outline-warning.png)
  — the warning banner shown when a font has no usable file.
- [assets/screenshot-report.png](assets/screenshot-report.png) — the panel
  after a clean export: "Exported with no warnings — all text is real,
  selectable text."
- [assets/screenshot-reading-order.png](assets/screenshot-reading-order.png)
  — the reading-order list, showing every paragraph with up/down reorder
  controls.

- [assets/demo.mp4](assets/demo.mp4) — a 20-second feature tour (800×1120,
  H.264; Figma's carousel picker rejects animated GIF, so use this MP4):
  built-in Inter fonts ready, the reading-order list, filename/author/language
  metadata, the DPI control moving from ATS to Balanced to Print, a clean
  export, then a font that isn't built in (warning banner) fixed by adding
  Google's variable file once. Rebuilt from the real UI with
  `scripts/ui-harness` and `scripts/frames-to-mp4.swift` (macOS, no ffmpeg).
  `assets/demo.gif` is the older recording, kept only for other uses.

Figma allows up to 9 images/videos in the carousel, so there's room for more
if useful.
