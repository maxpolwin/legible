/**
 * Legible PDF — plugin UI.
 *
 * Runs in the iframe: font management (drop TTF/OTF files, match against
 * the fonts used in the design, fsType + glyph-coverage checks), page/frame
 * ordering (drag AND keyboard move buttons, FR-2), filename pattern (FR-3),
 * DPI control with zone badge + live size estimate (FR-4), and the PDF
 * build + download. Fully offline — no request leaves this iframe.
 */

import '!./styles.css'
import fontkitModule from '@pdf-lib/fontkit'
import {
  Banner,
  Bold,
  Button,
  Container,
  Divider,
  FileUploadButton,
  IconDragHandle16,
  IconInfo16,
  IconWarning16,
  LoadingIndicator,
  Muted,
  Text,
  Textbox,
  Toggle,
  VerticalSpace,
  render,
} from '@create-figma-plugin/ui'
import { emit, on } from '@create-figma-plugin/utilities'
import { Fragment, h, type JSX } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { classifyDpi, DPI_MAX, DPI_MIN, estimateSizeBytes, formatBytes, type DpiZone } from './lib/estimate'
import type {
  DeleteFontHandler,
  ExportErrorHandler,
  ExportHandler,
  ExportResultHandler,
  NotifyHandler,
  ProgressHandler,
  SaveSettingsHandler,
  StateHandler,
  StoredFontsHandler,
  StoreFontHandler,
  UiReadyHandler,
} from './lib/events'
import { buildFilename, formatDatePrefix, sanitizeName } from './lib/filename'
import { checkEmbeddability, matchFont, type FontFileInfo } from './lib/fontmatch'
import { computeReadingOrder } from './lib/order'
import { buildPdf } from './lib/pdf/build'
import {
  fontId,
  type ExportResult,
  type FontId,
  type FrameSummary,
  type ProgressMessage,
  type ReportEntry,
  type StateMessage,
  type StoredFontMeta,
} from './lib/types'

const FRAME_CONFIRM_THRESHOLD = 20

interface LoadedFont {
  meta: StoredFontMeta
  info: FontFileInfo
  bytes: Uint8Array
  source: 'stored' | 'upload'
  fkFont: FontkitFont
}

interface FontkitFont {
  familyName: string
  subfamilyName: string
  postscriptName: string
  'OS/2': { fsType: number } | null
  hasGlyphForCodePoint: (codePoint: number) => boolean
}

type FontStatus =
  | { kind: 'ok'; font: LoadedFont; missingGlyphs: string }
  | { kind: 'blocked'; font: LoadedFont; reason: string }
  | { kind: 'missing' }

function parseFontFile(bytes: Uint8Array): FontkitFont[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = (fontkitModule as any).create(bytes)
  if (parsed && Array.isArray(parsed.fonts)) return parsed.fonts as FontkitFont[]
  return [parsed as FontkitFont]
}

function fontInfo(fk: FontkitFont): FontFileInfo {
  return {
    familyName: String(fk.familyName ?? ''),
    subfamilyName: String(fk.subfamilyName ?? ''),
    postscriptName: String(fk.postscriptName ?? ''),
    fsType: fk['OS/2'] ? fk['OS/2'].fsType : 0,
  }
}

function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const ZONE_LABEL: Record<DpiZone, { icon: string; label: string; css: string; hint: string }> = {
  ats: { icon: '●', label: 'ATS', css: 'badge badge-ats', hint: 'small files, ideal for parsers' },
  balanced: { icon: '◆', label: 'Balanced', css: 'badge badge-balanced', hint: 'screen-quality images' },
  print: { icon: '■', label: 'Print', css: 'badge badge-print', hint: 'large files, print-quality images' },
}

function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

function Plugin(): JSX.Element {
  const [state, setState] = useState<StateMessage | null>(null)
  const [fonts, setFonts] = useState<LoadedFont[]>([])
  const [frameOrder, setFrameOrder] = useState<string[]>([])
  const [textOrders, setTextOrders] = useState<Record<string, string[]>>({})
  const [expandedFrame, setExpandedFrame] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [language, setLanguage] = useState('de-DE')
  const [dpi, setDpi] = useState(96)
  const [remember, setRemember] = useState(true)
  const [phase, setPhase] = useState<'idle' | 'working' | 'done'>('idle')
  const [progress, setProgress] = useState<ProgressMessage | null>(null)
  const [report, setReport] = useState<ReportEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const settingsLoaded = useRef(false)

  const frames = useMemo(() => {
    if (!state) return []
    const byId = new Map(state.frames.map((f) => [f.id, f]))
    return frameOrder.map((id) => byId.get(id)).filter((f): f is FrameSummary => f !== undefined)
  }, [state, frameOrder])

  const defaultTextOrder = useCallback(
    (frame: FrameSummary): string[] =>
      computeReadingOrder(frame.texts.map((t) => ({ id: t.id, x: t.box.x, y: t.box.y, w: t.box.w, h: t.box.h }))),
    []
  )

  const textOrderFor = useCallback(
    (frame: FrameSummary): string[] => {
      const stored = textOrders[frame.id]
      if (stored && stored.length === frame.texts.length && stored.every((id) => frame.texts.some((t) => t.id === id))) {
        return stored
      }
      return defaultTextOrder(frame)
    },
    [textOrders, defaultTextOrder]
  )

  /* Font resolution (FR-5): match, license-check, glyph-coverage-check. */
  const fontStatuses = useMemo(() => {
    const map = new Map<FontId, FontStatus>()
    if (!state) return map
    const candidates = fonts.map((f) => ({ info: f.info, value: f }))
    for (const needed of state.neededFonts) {
      const id = fontId(needed)
      const match = matchFont(needed, candidates)
      if (!match) {
        map.set(id, { kind: 'missing' })
        continue
      }
      const embeddable = checkEmbeddability(match.value.info.fsType)
      if (!embeddable.ok) {
        map.set(id, { kind: 'blocked', font: match.value, reason: embeddable.reason ?? 'not embeddable' })
        continue
      }
      const chars = state.charsByFont[id] ?? ''
      let missingGlyphs = ''
      for (const ch of new Set([...chars])) {
        const cp = ch.codePointAt(0) as number
        if (cp <= 0x20 || cp === 0x2028 || cp === 0x2029 || cp === 0xa0) continue
        try {
          if (!match.value.fkFont.hasGlyphForCodePoint(cp)) missingGlyphs += ch
        } catch {
          // treat as present; the embedder maps to .notdef at worst
        }
      }
      map.set(id, { kind: 'ok', font: match.value, missingGlyphs })
    }
    return map
  }, [state, fonts])

  const unembeddableFonts = useMemo(
    () =>
      state
        ? state.neededFonts.map(fontId).filter((id) => {
            const status = fontStatuses.get(id)
            return !status || status.kind !== 'ok'
          })
        : [],
    [state, fontStatuses]
  )

  const estimate = useMemo(() => {
    if (!state) return 0
    return estimateSizeBytes({
      pages: frames.map((f) => ({
        widthPt: f.width,
        heightPt: f.height,
        hasRasterBackground: f.hasNonTextContent,
        imageAreaPt2: f.imageAreaPt2,
        charCount: f.texts.reduce((sum, t) => sum + t.charCount, 0),
      })),
      fontCount: state.neededFonts.map(fontId).filter((id) => fontStatuses.get(id)?.kind === 'ok').length,
      dpi,
    })
  }, [state, frames, fontStatuses, dpi])

  const filename = buildFilename(new Date(), name)

  /* Latest values for the async EXPORT_RESULT handler. */
  const exportContext = useRef({ fontStatuses, name, author, language, remember, fonts })
  exportContext.current = { fontStatuses, name, author, language, remember, fonts }

  const handleExportResult = useCallback(async (result: ExportResult) => {
    const ctx = exportContext.current
    try {
      setProgress({ message: 'Building PDF…', current: 1, total: 1 })
      const fontBytes = new Map<FontId, Uint8Array>()
      const fontReport: ReportEntry[] = []
      for (const [id, status] of ctx.fontStatuses) {
        if (status.kind === 'ok') {
          fontBytes.set(id, status.font.bytes)
          if (status.missingGlyphs.length > 0) {
            fontReport.push({
              severity: 'warning',
              frameName: '—',
              message: `“${status.font.info.familyName} ${status.font.info.subfamilyName}” is missing glyphs for: ${status.missingGlyphs}`,
            })
          }
        }
      }
      const title = sanitizeName(ctx.name) || 'Export'
      const { bytes, report: buildReport } = await buildPdf({
        frames: result.frames,
        meta: { title: `${formatDatePrefix(new Date())} - ${title}`, author: ctx.author, language: ctx.language },
        fonts: fontBytes,
      })
      downloadPdf(bytes, buildFilename(new Date(), ctx.name))
      emit<SaveSettingsHandler>('SAVE_SETTINGS', {
        filenameName: ctx.name,
        author: ctx.author,
        language: ctx.language,
        dpi,
      })
      setReport([...result.report, ...fontReport, ...buildReport])
      setPhase('done')
      setProgress(null)
    } catch (err) {
      setError(String(err))
      setPhase('idle')
      setProgress(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const offState = on<StateHandler>('STATE', (next) => {
      setState(next)
      setFrameOrder((previous) => {
        const ids = next.frames.map((f) => f.id)
        const kept = previous.filter((id) => ids.includes(id))
        const added = ids.filter((id) => !kept.includes(id))
        return [...kept, ...added]
      })
      if (!settingsLoaded.current) {
        settingsLoaded.current = true
        setName(next.settings.filenameName || sanitizeName(next.fileName))
        setAuthor(next.settings.author)
        setLanguage(next.settings.language)
        setDpi(next.settings.dpi)
      }
    })
    const offStored = on<StoredFontsHandler>('STORED_FONTS', (entries) => {
      setFonts((previous) => {
        const uploads = previous.filter((f) => f.source === 'upload')
        const loaded: LoadedFont[] = []
        for (const entry of entries) {
          try {
            for (const fk of parseFontFile(entry.bytes)) {
              loaded.push({ meta: entry.meta, info: fontInfo(fk), bytes: entry.bytes, source: 'stored', fkFont: fk })
            }
          } catch {
            // Corrupt stored font: drop it.
            emit<DeleteFontHandler>('DELETE_FONT', entry.meta.id)
          }
        }
        return [...loaded, ...uploads]
      })
    })
    const offProgress = on<ProgressHandler>('PROGRESS', (p) => setProgress(p))
    const offResult = on<ExportResultHandler>('EXPORT_RESULT', (result) => {
      void handleExportResult(result)
    })
    const offErr = on<ExportErrorHandler>('EXPORT_ERROR', (message) => {
      setError(message)
      setPhase('idle')
      setProgress(null)
    })
    emit<UiReadyHandler>('UI_READY')
    return () => {
      offState()
      offStored()
      offProgress()
      offResult()
      offErr()
    }
  }, [handleExportResult])

  const handleFontFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer())
          for (const fk of parseFontFile(bytes)) {
            const info = fontInfo(fk)
            const meta: StoredFontMeta = {
              id: info.postscriptName || `${info.familyName}-${info.subfamilyName}`,
              family: info.familyName,
              style: info.subfamilyName,
              postscriptName: info.postscriptName,
              byteLength: bytes.byteLength,
            }
            setFonts((previous) => [
              ...previous.filter((f) => f.meta.id !== meta.id),
              { meta, info, bytes, source: 'upload', fkFont: fk },
            ])
            if (remember) emit<StoreFontHandler>('STORE_FONT', meta, bytes)
          }
        } catch {
          emit<NotifyHandler>('NOTIFY', `Could not read font file "${file.name}"`, true)
        }
      }
    },
    [remember]
  )

  const startExport = useCallback(() => {
    if (!state || frames.length === 0) return
    if (state.scopedAll && frames.length > FRAME_CONFIRM_THRESHOLD && !needsConfirm) {
      setNeedsConfirm(true)
      return
    }
    setNeedsConfirm(false)
    setPhase('working')
    setError(null)
    setReport([])
    setProgress({ message: 'Extracting…', current: 0, total: frames.length })
    emit<ExportHandler>('EXPORT', {
      frames: frames.map((f) => ({ id: f.id, textOrder: textOrderFor(f) })),
      dpi,
      unembeddableFonts,
    })
  }, [state, frames, needsConfirm, dpi, unembeddableFonts, textOrderFor])

  if (!state) {
    return (
      <Container space="medium">
        <VerticalSpace space="large" />
        <LoadingIndicator />
        <VerticalSpace space="large" />
      </Container>
    )
  }

  const zone = ZONE_LABEL[classifyDpi(dpi)]

  return (
    <Container space="medium" style={{ paddingBottom: '16px' }}>
      <VerticalSpace space="medium" />
      <Text>
        <Bold>Frames to export</Bold>{' '}
        <Muted>
          {state.scopedAll ? `— whole file (${frames.length})` : `— selection (${frames.length})`}
        </Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      {frames.length === 0 ? (
        <Text>
          <Muted>No frames found. Select one or more frames, or add frames to the file.</Muted>
        </Text>
      ) : (
        <div role="list" aria-label="Export page order">
          {frames.map((frame, index) => (
            <Fragment key={frame.id}>
              <div
                role="listitem"
                class={`row${dragIndex === index ? ' drag-over' : ''}`}
                draggable
                onDragStart={(event) => {
                  setDragIndex(index)
                  event.dataTransfer?.setData('text/plain', String(index))
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const from = Number(event.dataTransfer?.getData('text/plain'))
                  if (Number.isInteger(from) && from !== index) {
                    setFrameOrder((previous) => moveItem(previous, from, index))
                  }
                  setDragIndex(null)
                }}
                onDragEnd={() => setDragIndex(null)}
              >
                <span aria-hidden="true" class="muted">
                  {index + 1}.
                </span>
                <span class="grow">{frame.name}</span>
                <span class="muted small">
                  {Math.round(frame.width)}×{Math.round(frame.height)}
                </span>
                <button
                  type="button"
                  class="textbtn"
                  aria-expanded={expandedFrame === frame.id}
                  onClick={() => setExpandedFrame(expandedFrame === frame.id ? null : frame.id)}
                >
                  Reading order
                </button>
                <button
                  type="button"
                  class="iconbtn"
                  aria-label={`Reorder ${frame.name}. Drag, or press Arrow Up or Arrow Down while focused, to move.`}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp' && index > 0) {
                      event.preventDefault()
                      setFrameOrder((previous) => moveItem(previous, index, index - 1))
                    } else if (event.key === 'ArrowDown' && index < frames.length - 1) {
                      event.preventDefault()
                      setFrameOrder((previous) => moveItem(previous, index, index + 1))
                    }
                  }}
                >
                  <IconDragHandle16 />
                </button>
              </div>
              {expandedFrame === frame.id && (
                <ol class="sublist" aria-label={`Reading order in ${frame.name}`}>
                  {textOrderFor(frame).map((textId, textIndex, order) => {
                    const text = frame.texts.find((t) => t.id === textId)
                    if (!text) return null
                    return (
                      <li key={textId} class="row">
                        <span aria-hidden="true" class="muted small">
                          {textIndex + 1}.
                        </span>
                        <span class="grow small" title={text.preview}>
                          {text.preview || text.name}
                        </span>
                        <button
                          type="button"
                          class="iconbtn"
                          aria-label={`Read "${text.preview.slice(0, 24)}" earlier`}
                          disabled={textIndex === 0}
                          onClick={() =>
                            setTextOrders((previous) => ({
                              ...previous,
                              [frame.id]: moveItem(order, textIndex, textIndex - 1),
                            }))
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          class="iconbtn"
                          aria-label={`Read "${text.preview.slice(0, 24)}" later`}
                          disabled={textIndex === order.length - 1}
                          onClick={() =>
                            setTextOrders((previous) => ({
                              ...previous,
                              [frame.id]: moveItem(order, textIndex, textIndex + 1),
                            }))
                          }
                        >
                          ↓
                        </button>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Fragment>
          ))}
        </div>
      )}

      <VerticalSpace space="small" />
      <Divider />
      <VerticalSpace space="small" />

      <Text>
        <Bold>Fonts</Bold>
      </Text>
      <VerticalSpace space="extraSmall" />
      {state.neededFonts.length === 0 ? (
        <Text>
          <Muted>No text found in the selected frames.</Muted>
        </Text>
      ) : (
        state.neededFonts.map((needed) => {
          const id = fontId(needed)
          const status = fontStatuses.get(id)
          return (
            <div key={id} class="font-status">
              <span aria-hidden="true">{status?.kind === 'ok' ? '✓' : '⚠'}</span>
              <span class="grow small">
                {needed.family} {needed.style}
              </span>
              <span class="muted small">
                {status?.kind === 'ok'
                  ? status.missingGlyphs
                    ? `missing glyphs: ${status.missingGlyphs.slice(0, 8)}`
                    : status.font.source === 'stored'
                      ? 'remembered'
                      : 'ready'
                  : status?.kind === 'blocked'
                    ? status.reason
                    : 'no font file — will outline'}
              </span>
            </div>
          )
        })
      )}
      <VerticalSpace space="extraSmall" />
      <FileUploadButton
        acceptedFileTypes={['font/ttf', 'font/otf', '.ttf', '.otf']}
        multiple
        secondary
        onSelectedFiles={(files) => void handleFontFiles(files)}
      >
        Add font files (.ttf / .otf)…
      </FileUploadButton>
      {state.neededFonts.some((needed) => fontStatuses.get(fontId(needed))?.kind !== 'ok') && (
        <Fragment>
          <VerticalSpace space="extraSmall" />
          <Text>
            <Muted>
              Missing a font file? Most open-source fonts (Inter, Lato, Roboto…) are free at{' '}
              <a href="https://fonts.google.com" target="_blank" rel="noreferrer">
                fonts.google.com ↗
              </a>
              . Licensed fonts need their own source.
            </Muted>
          </Text>
        </Fragment>
      )}
      <VerticalSpace space="extraSmall" />
      <Toggle value={remember} onValueChange={setRemember}>
        <Text>Remember fonts on this machine</Text>
      </Toggle>

      <VerticalSpace space="small" />
      <Divider />
      <VerticalSpace space="small" />

      <Text>
        <Bold>File</Bold>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Textbox
        placeholder="Filename (e.g. Bewerbung Mustermann)"
        value={name}
        onValueInput={setName}

      />
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted class="small">Saves as "{filename}".</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Textbox placeholder="Author (PDF metadata)" value={author} onValueInput={setAuthor} />
      <VerticalSpace space="extraSmall" />
      <Textbox placeholder="Language (e.g. de-DE)" value={language} onValueInput={setLanguage} />

      <VerticalSpace space="small" />
      <Divider />
      <VerticalSpace space="small" />

      <Text>
        <Bold>Resolution</Bold>
      </Text>
      <VerticalSpace space="extraSmall" />
      <div class="dpi-row">
        <input
          type="range"
          aria-label="Image resolution in DPI"
          min={DPI_MIN}
          max={DPI_MAX}
          step={1}
          value={dpi}
          onInput={(event) => setDpi(Number((event.target as HTMLInputElement).value))}
        />
        <input
          type="number"
          aria-label="Image resolution in DPI"
          min={DPI_MIN}
          max={DPI_MAX}
          value={dpi}
          onInput={(event) => {
            const value = Number((event.target as HTMLInputElement).value)
            if (Number.isFinite(value)) setDpi(Math.min(DPI_MAX, Math.max(DPI_MIN, value)))
          }}
        />
        <span class={zone.css} role="status">
          <span aria-hidden="true">{zone.icon}</span> {zone.label}
        </span>
      </div>
      <VerticalSpace space="extraSmall" />
      <Text>
        <Muted class="small">
          {zone.hint} · estimated size ≈ {formatBytes(estimate)} (text stays vector at any DPI)
        </Muted>
      </Text>

      <VerticalSpace space="small" />
      <Divider />
      <VerticalSpace space="small" />

      {needsConfirm && (
        <Fragment>
          <Banner icon={<IconWarning16 />} variant="warning">
            Nothing is selected, so all {frames.length} frames in this file will be exported. Continue?
          </Banner>
          <VerticalSpace space="extraSmall" />
        </Fragment>
      )}
      {error !== null && (
        <Fragment>
          <Banner icon={<IconWarning16 />} variant="warning">
            Export failed: {error}
          </Banner>
          <VerticalSpace space="extraSmall" />
        </Fragment>
      )}

      {phase === 'working' && progress ? (
        <div class="row" role="status" aria-live="polite">
          <LoadingIndicator />
          <span class="grow small">{progress.message}</span>
        </div>
      ) : (
        <Button fullWidth onClick={startExport} disabled={frames.length === 0}>
          {needsConfirm ? `Export all ${frames.length} frames` : `Export ${frames.length === 1 ? '1 page' : `${frames.length} pages`} as PDF`}
        </Button>
      )}

      {phase === 'done' && (
        <Fragment>
          <VerticalSpace space="small" />
          {report.length === 0 ? (
            <Banner icon={<IconInfo16 />} variant="success">
              Exported with no warnings — all text is real, selectable text.
            </Banner>
          ) : (
            <Fragment>
              <Text>
                <Bold>Export report</Bold> <Muted>({report.length})</Muted>
              </Text>
              <VerticalSpace space="extraSmall" />
              <div class="report">
                {report.map((entry, index) => (
                  <div key={index} class="report-entry">
                    <Text>
                      <span aria-hidden="true">{entry.severity === 'info' ? 'ℹ' : '⚠'}</span>{' '}
                      <Bold>{entry.severity}</Bold>{' '}
                      <Muted class="small">
                        {entry.frameName}
                        {entry.nodeName ? ` › ${entry.nodeName}` : ''}
                      </Muted>
                    </Text>
                    <Text>
                      <span class="small">{entry.message}</span>
                    </Text>
                  </div>
                ))}
              </div>
            </Fragment>
          )}
        </Fragment>
      )}
      <VerticalSpace space="medium" />
    </Container>
  )
}

export default render(Plugin)
