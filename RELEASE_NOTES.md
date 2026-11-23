# Release notes

## Next release — fonts, rebuilt

Fonts were the one thing that made legible PDF fiddly. This release fixes that.

### Figma "What's new" text (paste into the publish dialog)

> **Built-in fonts, variable-font support, smarter font storage.**
> Inter, Roboto, Open Sans and Lato (all weights and italics) are now built in, so designs using them export as real text with no upload. Google's variable fonts (e.g. Source Sans 3) work too. Uploaded fonts are always saved, with a list, storage meter and Remove button. A warning now appears before export if any text would fall back to outlines. Fixes: font-license (embedding) flags are now actually enforced, and failed font saves are reported instead of silent.

### Added

- **Built-in fonts.** Inter, Roboto, Open Sans and Lato, every weight and italic, ship inside the plugin as Latin subsets (German umlauts, ß, €, curly quotes, dashes, CO₂-style sub/superscripts, common maths signs). Matching Figma's style names ("Semi Bold" etc.) is automatic. They are labelled "built-in" in the Fonts panel and use none of the 5 MB font storage.
- **Variable fonts.** Add a variable `.ttf` (for example Google Fonts' `SourceSans3[wght].ttf`) once: every named style becomes its own face, and a static instance of just the characters you use is built at export, so the PDF embeds the correct weight.
- **Saved-fonts list.** Uploaded fonts show with their size, a storage meter ("862 KB of about 5.2 MB used", with a warning near the limit) and a **Remove** button to free space.
- **Outline warning.** If any font has no usable file, a banner above Export says how many fonts will export as outlines (not selectable, not ATS-readable) before you click.

### Changed

- Uploaded fonts are **always saved** on your machine; the "Remember fonts" toggle is gone.
- The hint under the upload button now says which fonts are built in and that variable fonts work.
- The plugin bundle is larger (about 5 MB, up from 1.4 MB) because the fonts are embedded. It still makes **no network requests**.

### Fixed

- **Font license flags were never enforced.** The plugin read the OS/2 `fsType` value in the wrong format, so a font that forbids embedding would have been embedded anyway. Restricted fonts are now detected and fall back to outlines with a report entry.
- **Silent storage failures.** A failed font save (storage full) or removal now shows an error message instead of doing nothing.
- Variable Google fonts previously matched no weight at all and silently exported as outlines.

### Known limitations

- Variable fonts: kerning and ligatures are not carried into the embedded instance (PDF viewers don't apply kerning to shown text anyway). Variable fonts with CFF2 outlines, or without named styles, are rejected with a message; use their static files.
- Only Inter, Roboto, Open Sans and Lato are built in. Other fonts need their file added once. Proprietary fonts (e.g. Helvetica Neue, SF) must come from your own licensed files.
- Open Sans has no arrow glyph (→) in its source files.

### For maintainers

- Build the built-in fonts with `npm run fonts` (needs python3 and network; hash-pinned sources and fonttools), then `npm run build`. Without them the build still succeeds, just with no built-in fonts.
- `scripts/ui-harness` runs the real built UI in a browser with dummy data for screenshots; `scripts/frames-to-mp4.swift` builds demo videos on macOS without ffmpeg.
- 102 tests pass. `npm audit --omit=dev` reports 0 vulnerabilities (dev-tooling advisories are tracked separately).
