/**
 * Low-level PDF content-stream operator helpers.
 *
 * pdf-lib's high-level draw API cannot emit marked-content operators
 * (BDC/EMC with MCIDs), which tagged PDF requires — so text and fallback
 * vectors are written as raw operators pushed onto the page content stream.
 */

import {
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames as Ops,
} from 'pdf-lib'
import type { Mat23 } from '../types'

const num = (n: number): PDFNumber => PDFNumber.of(round(n))

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}

export const beginText = (): PDFOperator => PDFOperator.of(Ops.BeginText)
export const endText = (): PDFOperator => PDFOperator.of(Ops.EndText)

export const setFont = (fontKey: PDFName, size: number): PDFOperator =>
  PDFOperator.of(Ops.SetFontAndSize, [fontKey, num(size)])

export const setTextMatrix = (m: Mat23): PDFOperator =>
  PDFOperator.of(Ops.SetTextMatrix, [num(m.a), num(m.b), num(m.c), num(m.d), num(m.e), num(m.f)])

export const showText = (hex: PDFHexString): PDFOperator => PDFOperator.of(Ops.ShowText, [hex])

export const setCharSpacing = (spacing: number): PDFOperator =>
  PDFOperator.of(Ops.SetCharacterSpacing, [num(spacing)])

export const setFillRgb = (r: number, g: number, b: number): PDFOperator =>
  PDFOperator.of(Ops.NonStrokingColorRgb, [num(clamp01(r)), num(clamp01(g)), num(clamp01(b))])

export const setStrokeRgb = (r: number, g: number, b: number): PDFOperator =>
  PDFOperator.of(Ops.StrokingColorRgb, [num(clamp01(r)), num(clamp01(g)), num(clamp01(b))])

export const setGraphicsState = (key: PDFName): PDFOperator =>
  PDFOperator.of(Ops.SetGraphicsStateParams, [key])

export const pushState = (): PDFOperator => PDFOperator.of(Ops.PushGraphicsState)
export const popState = (): PDFOperator => PDFOperator.of(Ops.PopGraphicsState)

export const setLineWidth = (w: number): PDFOperator => PDFOperator.of(Ops.SetLineWidth, [num(w)])

export const moveTo = (x: number, y: number): PDFOperator => PDFOperator.of(Ops.MoveTo, [num(x), num(y)])
export const lineTo = (x: number, y: number): PDFOperator => PDFOperator.of(Ops.LineTo, [num(x), num(y)])
export const curveTo = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): PDFOperator =>
  PDFOperator.of(Ops.AppendBezierCurve, [num(x1), num(y1), num(x2), num(y2), num(x3), num(y3)])
export const closePath = (): PDFOperator => PDFOperator.of(Ops.ClosePath)
export const stroke = (): PDFOperator => PDFOperator.of(Ops.StrokePath)
export const fillNonZero = (): PDFOperator => PDFOperator.of(Ops.FillNonZero)
export const fillEvenOdd = (): PDFOperator => PDFOperator.of(Ops.FillEvenOdd)

export const rectangle = (x: number, y: number, w: number, h: number): PDFOperator =>
  PDFOperator.of(Ops.AppendRectangle, [num(x), num(y), num(w), num(h)])

// pdf-lib's PDFOperatorArg union omits PDFDict, but inline property dicts
// are valid BDC operands (ISO 32000-1 §14.6.2) and serialize correctly —
// the writer only needs sizeInBytes/copyBytesInto, which PDFDict has.
type OperatorArg = Parameters<typeof PDFOperator.of>[1] extends Array<infer T> | undefined ? T : never

/** BDC with an inline properties dict carrying the MCID. */
export const beginMarkedContent = (tag: string, properties: PDFDict): PDFOperator =>
  PDFOperator.of(Ops.BeginMarkedContentSequence, [PDFName.of(tag), properties as unknown as OperatorArg])

/** BDC for artifacts (decorative/background content, skipped by AT). */
export const beginArtifact = (properties: PDFDict): PDFOperator =>
  PDFOperator.of(Ops.BeginMarkedContentSequence, [PDFName.of('Artifact'), properties as unknown as OperatorArg])

export const endMarkedContent = (): PDFOperator => PDFOperator.of(Ops.EndMarkedContent)

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
