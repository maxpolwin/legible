/**
 * Hand-built tagged-PDF structure tree (FR-1 reading order, §12 risk item).
 *
 * pdf-lib has no structure-tree API, so this module writes the objects
 * directly: StructTreeRoot -> Document -> (P | Figure)* with Link children,
 * a ParentTree number tree mapping every marked-content id and link
 * annotation back to its structure element, and catalog wiring
 * (/MarkInfo /Marked true, /Lang, /ViewerPreferences /DisplayDocTitle).
 *
 * Shape produced (per ISO 32000-1 §14.7/14.8):
 *
 *   /StructTreeRoot
 *     /K  -> Document
 *              /K [ P, P, Figure, ... ]   (reading order)
 *   P      /K [ mcid, Link, mcid, ... ]   (mcids are integers)
 *   Link   /K [ mcid, OBJR -> annot ]
 *   Figure /Alt (source text)  /K [ mcid ]  (outline-fallback nodes)
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFRef,
  PDFString,
} from 'pdf-lib'

export interface PageStructContext {
  page: PDFPage
  structParentsKey: number
  /** elem ref (assigned in finish) per MCID, index == MCID. */
  mcidOwners: Array<ParagraphRecord | LinkRecord | FigureRecord>
  nextMcid: number
}

export type ParagraphKid =
  | { kind: 'mcid'; mcid: number }
  | { kind: 'link'; mcid: number; annotRef: PDFRef; url: string }

interface ParagraphRecord {
  type: 'P'
  pageRef: PDFRef
  kids: ParagraphKid[]
  actualText: string | null
  ref: PDFRef
  linkRefs: Map<number, PDFRef>
}

interface LinkRecord {
  type: 'Link'
  ref: PDFRef
}

interface FigureRecord {
  type: 'Figure'
  pageRef: PDFRef
  mcid: number
  alt: string
  ref: PDFRef
}

export class StructTreeBuilder {
  private readonly doc: PDFDocument
  private readonly pages: PageStructContext[] = []
  /** Document-order children of the Document element. */
  private readonly content: Array<ParagraphRecord | FigureRecord> = []
  /** ParentTree entries for annotations: key -> struct elem ref. */
  private readonly annotEntries: Array<{ key: number; ref: PDFRef }> = []
  private nextParentKey = 0

  constructor(doc: PDFDocument) {
    this.doc = doc
  }

  page(page: PDFPage): PageStructContext {
    const ctx: PageStructContext = {
      page,
      structParentsKey: this.nextParentKey++,
      mcidOwners: [],
      nextMcid: 0,
    }
    page.node.set(PDFName.of('StructParents'), PDFNumber.of(ctx.structParentsKey))
    this.pages.push(ctx)
    return ctx
  }

  takeMcid(ctx: PageStructContext): number {
    return ctx.nextMcid++
  }

  /** Reserve a /StructParent key for a link annotation. */
  takeAnnotParentKey(): number {
    return this.nextParentKey++
  }

  paragraph(ctx: PageStructContext, kids: ParagraphKid[], actualText: string | null): void {
    const record: ParagraphRecord = {
      type: 'P',
      pageRef: ctx.page.ref,
      kids,
      actualText,
      ref: this.doc.context.nextRef(),
      linkRefs: new Map(),
    }
    for (const kid of kids) {
      if (kid.kind === 'mcid') {
        ctx.mcidOwners[kid.mcid] = record
      } else {
        const linkRecord: LinkRecord = { type: 'Link', ref: this.doc.context.nextRef() }
        record.linkRefs.set(kid.mcid, linkRecord.ref)
        ctx.mcidOwners[kid.mcid] = linkRecord
      }
    }
    this.content.push(record)
  }

  /** Register the ParentTree entry for a link annotation's StructParent. */
  annotParent(key: number, ctx: PageStructContext, mcid: number): void {
    const owner = ctx.mcidOwners[mcid]
    if (owner) this.annotEntries.push({ key, ref: owner.ref })
  }

  figure(ctx: PageStructContext, mcid: number, alt: string): void {
    const record: FigureRecord = {
      type: 'Figure',
      pageRef: ctx.page.ref,
      mcid,
      alt,
      ref: this.doc.context.nextRef(),
    }
    ctx.mcidOwners[mcid] = record
    this.content.push(record)
  }

  finish(): void {
    const context = this.doc.context
    const rootRef = context.nextRef()
    const documentRef = context.nextRef()

    // Structure elements, in reading order.
    for (const record of this.content) {
      if (record.type === 'Figure') {
        const dict = context.obj({
          Type: 'StructElem',
          S: 'Figure',
          P: documentRef,
          Pg: record.pageRef,
          K: PDFNumber.of(record.mcid),
        })
        dict.set(PDFName.of('Alt'), PDFHexString.fromText(record.alt))
        context.assign(record.ref, dict)
        continue
      }

      const kidObjects: Array<PDFNumber | PDFRef> = []
      for (const kid of record.kids) {
        if (kid.kind === 'mcid') {
          kidObjects.push(PDFNumber.of(kid.mcid))
        } else {
          const linkRef = record.linkRefs.get(kid.mcid) as PDFRef
          const objr = context.obj({ Type: 'OBJR', Obj: kid.annotRef })
          const linkDict = context.obj({
            Type: 'StructElem',
            S: 'Link',
            P: record.ref,
            Pg: record.pageRef,
            K: context.obj([PDFNumber.of(kid.mcid), objr]),
          })
          linkDict.set(PDFName.of('Alt'), PDFString.of(kid.url))
          context.assign(linkRef, linkDict)
          kidObjects.push(linkRef)
        }
      }
      const dict = context.obj({
        Type: 'StructElem',
        S: 'P',
        P: documentRef,
        Pg: record.pageRef,
        K: context.obj(kidObjects),
      })
      if (record.actualText !== null) {
        dict.set(PDFName.of('ActualText'), PDFHexString.fromText(record.actualText))
      }
      context.assign(record.ref, dict)
    }

    // Document element.
    context.assign(
      documentRef,
      context.obj({
        Type: 'StructElem',
        S: 'Document',
        P: rootRef,
        K: context.obj(this.content.map((r) => r.ref)),
      })
    )

    // ParentTree: pages (MCID arrays) + annotations (direct refs), sorted.
    const entries: Array<{ key: number; value: PDFArray | PDFRef }> = []
    for (const ctx of this.pages) {
      const arr = context.obj(ctx.mcidOwners.map((owner) => owner.ref)) as PDFArray
      entries.push({ key: ctx.structParentsKey, value: arr })
    }
    for (const e of this.annotEntries) entries.push({ key: e.key, value: e.ref })
    entries.sort((p, q) => p.key - q.key)
    const nums: Array<PDFNumber | PDFArray | PDFRef> = []
    for (const e of entries) {
      nums.push(PDFNumber.of(e.key))
      nums.push(e.value)
    }
    const parentTreeRef = context.register(context.obj({ Nums: context.obj(nums) }))

    context.assign(
      rootRef,
      context.obj({
        Type: 'StructTreeRoot',
        K: documentRef,
        ParentTree: parentTreeRef,
        ParentTreeNextKey: PDFNumber.of(this.nextParentKey),
      })
    )

    // Catalog wiring.
    this.doc.catalog.set(PDFName.of('StructTreeRoot'), rootRef)
    this.doc.catalog.set(PDFName.of('MarkInfo'), context.obj({ Marked: true }))
    this.doc.catalog.getOrCreateViewerPreferences().setDisplayDocTitle(true)
  }
}
