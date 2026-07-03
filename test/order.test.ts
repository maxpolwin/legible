import { describe, expect, it } from 'vitest'
import { computeReadingOrder, rowMajorOrder, type OrderBox } from '../src/lib/order'

function box(id: string, x: number, y: number, w: number, h: number): OrderBox {
  return { id, x, y, w, h }
}

describe('computeReadingOrder (FR-1, column-aware)', () => {
  it('orders a clean two-column CV column-first, left column complete before right', () => {
    // Sidebar (x 20..160), main column (x 200..560) — classic CV layout.
    const boxes = [
      box('main-1', 200, 40, 360, 20),
      box('side-1', 20, 40, 140, 20),
      box('main-2', 200, 80, 360, 60),
      box('side-2', 20, 90, 140, 30),
      box('main-3', 200, 160, 360, 40),
      box('side-3', 20, 200, 140, 20),
    ]
    expect(computeReadingOrder(boxes)).toEqual(['side-1', 'side-2', 'side-3', 'main-1', 'main-2', 'main-3'])
  })

  it('reads a full-width header before the columns underneath it', () => {
    const boxes = [
      box('col-left', 20, 120, 200, 300),
      box('header', 20, 20, 540, 60),
      box('col-right', 300, 120, 260, 300),
    ]
    expect(computeReadingOrder(boxes)).toEqual(['header', 'col-left', 'col-right'])
  })

  it('does not split label/value pairs with small gaps into columns', () => {
    // Rows of label (x 20..100) + value (x 112..300): 12pt gap, below the
    // default hard gutter, and no wider than 1.5x the median gap.
    const boxes = [
      box('label-1', 20, 20, 80, 14),
      box('value-1', 112, 20, 188, 14),
      box('label-2', 20, 44, 80, 14),
      box('value-2', 112, 44, 188, 14),
    ]
    expect(computeReadingOrder(boxes, { hardColumnGap: 24 })).toEqual([
      'label-1',
      'value-1',
      'label-2',
      'value-2',
    ])
  })

  it('orders a single column strictly top-to-bottom', () => {
    const boxes = [box('c', 20, 200, 300, 20), box('a', 20, 20, 300, 20), box('b', 20, 60, 300, 20)]
    expect(computeReadingOrder(boxes)).toEqual(['a', 'b', 'c'])
  })

  it('handles nested columns inside a lower band', () => {
    const boxes = [
      box('title', 20, 10, 560, 30),
      box('intro', 20, 60, 560, 40),
      box('left-a', 20, 140, 240, 30),
      box('left-b', 20, 190, 240, 30),
      box('right-a', 320, 140, 240, 30),
      box('right-b', 320, 190, 240, 30),
    ]
    expect(computeReadingOrder(boxes)).toEqual(['title', 'intro', 'left-a', 'left-b', 'right-a', 'right-b'])
  })

  it('is stable for empty and single-item input', () => {
    expect(computeReadingOrder([])).toEqual([])
    expect(computeReadingOrder([box('only', 0, 0, 10, 10)])).toEqual(['only'])
  })
})

describe('rowMajorOrder (FR-2 default page order)', () => {
  it('orders frames left-to-right within a row, then top-to-bottom', () => {
    const boxes = [
      box('page-3', 0, 900, 595, 842),
      box('page-2', 700, 0, 595, 842),
      box('page-1', 0, 0, 595, 842),
    ]
    expect(rowMajorOrder(boxes)).toEqual(['page-1', 'page-2', 'page-3'])
  })

  it('treats vertically offset but overlapping frames as one row', () => {
    const boxes = [box('b', 700, 60, 595, 842), box('a', 0, 0, 595, 842)]
    expect(rowMajorOrder(boxes)).toEqual(['a', 'b'])
  })
})
