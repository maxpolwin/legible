# UI harness

Runs the real built plugin UI (`build/ui.js`) in a plain browser with a fake
Figma main thread, for visual checks and Community screenshots. All text is
dummy data (no personal information).

```sh
npm run build
python3 -m http.server 8765 --bind 127.0.0.1     # from the repo root
# open http://127.0.0.1:8765/scripts/ui-harness/index.html?family=Inter
```

- `?family=Inter` shows built-in fonts; without it the design asks for
  "Source Sans 3", which is not built in (outline warning; add a variable font
  to see the saved-fonts list).
- `driver.js` answers `UI_READY` with a state built from `data.js` and answers
  `EXPORT` with synthetic extracted frames. Anything the UI sends (STORE_FONT,
  DELETE_FONT, …) is collected in `window.__log`; the exported PDF blob is
  `window.__pdfBlob`.
- For crisp 2× screenshots, set the viewport to 800×1120 and
  `document.documentElement.style.zoom = 2`.
