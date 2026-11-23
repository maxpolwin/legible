// Plays the role of Figma's main thread for the real built UI (build/ui.js).
window.__log = []
const post = (name, ...args) => window.postMessage({ pluginMessage: [name, ...args] }, '*')
const colorOf = (k) => { const c = C[k]; return { r: c[0], g: c[1], b: c[2], opacity: 1 } }
const fid = (f, s) => `${f}##${s}`
const FAMILY = new URLSearchParams(location.search).get('family') || 'Source Sans 3'
function summaries() {
  return FRAMES.map((f) => ({
    id: f.id, name: f.name, width: f.w, height: f.h, imageAreaPt2: 0, hasNonTextContent: false, backgroundFill: { r: 1, g: 1, b: 1, opacity: 1 },
    texts: f.texts.map((t) => ({ id: t[0], name: t[5][0][0].slice(0, 30), preview: t[5][0][0].slice(0, 40), box: { x: t[1], y: t[2], w: t[3], h: t[4] },
      fonts: [...new Set(t[5].map((s) => fid(FAMILY, s[1])))], hasMissingFont: false, charCount: t[5].reduce((n, s) => n + s[0].length, 0) })),
  }))
}
function state() {
  const needed = new Map(), chars = {}
  for (const f of FRAMES) for (const t of f.texts) for (const s of t[5]) {
    const id = fid(FAMILY, s[1]); needed.set(id, { family: FAMILY, style: s[1] })
    chars[id] = [...new Set([...(chars[id] || ''), ...s[0]])].join('')
  }
  return { fileName: FILE.name, pageName: FILE.page, scopedAll: true, frames: summaries(), neededFonts: [...needed.values()], charsByFont: chars,
    settings: { filenameName: '', filenameFile: '', author: 'Max Mustermann', language: 'de-DE', dpi: 96 }, storedFonts: [] }
}
function exportResult(req) {
  const frames = req.frames.map((rf) => {
    const f = FRAMES.find((x) => x.id === rf.id)
    return { id: f.id, name: f.name, width: f.w, height: f.h, background: { kind: 'solid', fill: { r: 1, g: 1, b: 1, opacity: 1 } }, readingOrder: rf.textOrder,
      texts: f.texts.map((t) => {
        let x = 0
        const lines = []
        t[5].forEach((s) => s[0].split('\n').forEach((part, i) => lines.push({ part, i, s })))
        let lineIndex = 0, runs = []
        for (const { part, i, s } of lines) {
          if (i > 0) { lineIndex++; x = 0 }
          runs.push({ text: part, x, y: s[2] * 0.95 + lineIndex * s[2] * 1.3, transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, lineIndex,
            style: { font: { family: FAMILY, style: s[1] }, fontSize: s[2], fill: colorOf(t[6]), letterSpacingPt: 0, hyperlink: null, underline: false, strikethrough: false } })
          x += part.length * s[2] * 0.48
        }
        return { id: t[0], name: t[0], frameTransform: { a: 1, b: 0, c: 0, d: 1, e: t[1], f: t[2] }, width: t[3], height: t[4],
          characters: t[5].map((s) => s[0]).join(''), runs, fallback: null }
      }) }
  })
  return { frames, report: [] }
}
window.addEventListener('message', (e) => {
  const m = e.data && e.data.pluginMessage
  if (!Array.isArray(m)) return
  const [name, ...args] = m
  if (name === 'UI_READY') { post('STATE', state()); post('STORED_FONTS', []) }
  else if (name === 'EXPORT') { post('PROGRESS', { message: 'Extracting…', current: 1, total: 1 }); post('EXPORT_RESULT', exportResult(args[0])) }
  else window.__log.push({ name, args: name === 'STORE_FONT' ? [args[0]] : args })
})
// Capture the downloaded PDF instead of saving it.
const orig = URL.createObjectURL.bind(URL)
URL.createObjectURL = (blob) => { window.__pdfBlob = blob; return orig(blob) }
HTMLAnchorElement.prototype.click = function () { window.__downloadName = this.download }
// The UI's own outbound messages bounce back to its on() handler, which throws on unknown names.
window.addEventListener('load', () => { const h = window.onmessage; window.onmessage = (ev) => { try { h && h(ev) } catch (err) { /* expected for echoed messages */ } } })
