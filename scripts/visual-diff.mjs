/**
 * Visual regression check (§8, §11).
 *
 * Compares PDF pages (rendered to PNG via pdf.js + @napi-rs/canvas) against
 * reference PNGs exported from Figma. Fails when more than 0.1% of pixels
 * differ.
 *
 * Usage:
 *   node scripts/visual-diff.mjs <file.pdf> <references-dir> [out-dir]
 *
 * References are named page-1.png, page-2.png, … and must be exported from
 * Figma at the same scale the script renders (RENDER_SCALE below, 2x = 144
 * dpi). Missing references are skipped with a notice, so the check is a
 * no-op until references are checked in.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RENDER_SCALE = 2
const MAX_DIFF_RATIO = 0.001

const [, , pdfPath, referencesDir, outDir = 'visual-diff-out'] = process.argv
if (!pdfPath || !referencesDir) {
  console.error('usage: node scripts/visual-diff.mjs <file.pdf> <references-dir> [out-dir]')
  process.exit(2)
}

// pdf.js renders glyphs through the browser canvas API surface; expose the
// @napi-rs/canvas equivalents as globals before pdf.js loads.
const canvasModule = await import('@napi-rs/canvas')
const { createCanvas } = canvasModule
globalThis.Path2D ??= canvasModule.Path2D
globalThis.DOMMatrix ??= canvasModule.DOMMatrix
globalThis.ImageData ??= canvasModule.ImageData

const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
const pixelmatch = (await import('pixelmatch')).default
const { PNG } = await import('pngjs')

// Note: do NOT pass disableFontFace here — in Node, pdf.js defaults it to
// true and renders embedded glyphs as vector paths, which is what we want.
const data = new Uint8Array(readFileSync(pdfPath))
const doc = await getDocument({ data, verbosity: 0 }).promise

mkdirSync(outDir, { recursive: true })
let failures = 0
let compared = 0

for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
  const referencePath = join(referencesDir, `page-${pageNumber}.png`)
  if (!existsSync(referencePath)) {
    console.log(`page ${pageNumber}: no reference at ${referencePath} — skipped`)
    continue
  }

  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: RENDER_SCALE })
  const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: context, viewport }).promise

  const rendered = PNG.sync.read(canvas.toBuffer('image/png'))
  const reference = PNG.sync.read(readFileSync(referencePath))
  if (rendered.width !== reference.width || rendered.height !== reference.height) {
    console.error(
      `page ${pageNumber}: size mismatch (rendered ${rendered.width}x${rendered.height}, reference ${reference.width}x${reference.height})`
    )
    failures++
    continue
  }

  const diff = new PNG({ width: rendered.width, height: rendered.height })
  const differing = pixelmatch(rendered.data, reference.data, diff.data, rendered.width, rendered.height, {
    threshold: 0.15,
  })
  const ratio = differing / (rendered.width * rendered.height)
  compared++

  const status = ratio <= MAX_DIFF_RATIO ? 'ok' : 'FAIL'
  console.log(`page ${pageNumber}: ${(ratio * 100).toFixed(4)}% differing pixels — ${status}`)
  if (ratio > MAX_DIFF_RATIO) {
    failures++
    writeFileSync(join(outDir, `page-${pageNumber}-diff.png`), PNG.sync.write(diff))
    writeFileSync(join(outDir, `page-${pageNumber}-rendered.png`), canvas.toBuffer('image/png'))
  }
}

if (compared === 0) console.log('No references compared — add PNGs exported from Figma to enable this check.')
process.exit(failures > 0 ? 1 : 0)
