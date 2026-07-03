/**
 * Minimal, strict XML parser for Figma's SVG export output.
 *
 * Figma's plugin main thread has no DOMParser, and the exported SVG is
 * machine-generated and well-formed, so a small recursive parser is enough.
 * Supported: elements, attributes (single/double quoted), self-closing tags,
 * comments, XML declarations, DOCTYPE, CDATA, character/entity references.
 */

export interface XmlElement {
  tag: string
  attrs: Record<string, string>
  children: Array<XmlElement | string>
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(parseInt(body.slice(2), 16))
    }
    if (body.startsWith('#')) {
      return String.fromCodePoint(parseInt(body.slice(1), 10))
    }
    return NAMED_ENTITIES[body] ?? whole
  })
}

interface Cursor {
  src: string
  pos: number
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '')
  }
  return attrs
}

function skipNonElements(c: Cursor): void {
  for (;;) {
    const rest = c.src.slice(c.pos)
    if (rest.startsWith('<?')) {
      const end = c.src.indexOf('?>', c.pos)
      if (end === -1) throw new Error('Unterminated processing instruction')
      c.pos = end + 2
    } else if (rest.startsWith('<!--')) {
      const end = c.src.indexOf('-->', c.pos)
      if (end === -1) throw new Error('Unterminated comment')
      c.pos = end + 3
    } else if (rest.startsWith('<!DOCTYPE') || rest.startsWith('<!doctype')) {
      const end = c.src.indexOf('>', c.pos)
      if (end === -1) throw new Error('Unterminated DOCTYPE')
      c.pos = end + 1
    } else {
      return
    }
  }
}

function parseElement(c: Cursor): XmlElement {
  if (c.src[c.pos] !== '<') throw new Error(`Expected element at position ${c.pos}`)
  const tagEnd = c.src.indexOf('>', c.pos)
  if (tagEnd === -1) throw new Error('Unterminated tag')
  let tagBody = c.src.slice(c.pos + 1, tagEnd)
  const selfClosing = tagBody.endsWith('/')
  if (selfClosing) tagBody = tagBody.slice(0, -1)
  const nameMatch = /^[^\s/>]+/.exec(tagBody)
  if (!nameMatch) throw new Error(`Malformed tag at position ${c.pos}`)
  const tag = nameMatch[0]
  const attrs = parseAttrs(tagBody.slice(tag.length))
  const element: XmlElement = { tag, attrs, children: [] }
  c.pos = tagEnd + 1
  if (selfClosing) return element

  const closeTag = `</${tag}>`
  for (;;) {
    if (c.pos >= c.src.length) throw new Error(`Missing closing tag for <${tag}>`)
    if (c.src.startsWith(closeTag, c.pos)) {
      c.pos += closeTag.length
      return element
    }
    if (c.src.startsWith('<![CDATA[', c.pos)) {
      const end = c.src.indexOf(']]>', c.pos)
      if (end === -1) throw new Error('Unterminated CDATA')
      element.children.push(c.src.slice(c.pos + 9, end))
      c.pos = end + 3
      continue
    }
    if (c.src.startsWith('<!--', c.pos)) {
      const end = c.src.indexOf('-->', c.pos)
      if (end === -1) throw new Error('Unterminated comment')
      c.pos = end + 3
      continue
    }
    if (c.src.startsWith('</', c.pos)) {
      // A closing tag that is not ours: malformed for our purposes.
      throw new Error(`Unexpected closing tag inside <${tag}>`)
    }
    if (c.src[c.pos] === '<') {
      element.children.push(parseElement(c))
      continue
    }
    const nextTag = c.src.indexOf('<', c.pos)
    const end = nextTag === -1 ? c.src.length : nextTag
    const text = c.src.slice(c.pos, end)
    if (text.length > 0) element.children.push(decodeEntities(text))
    c.pos = end
  }
}

export function parseXml(src: string): XmlElement {
  const c: Cursor = { src, pos: 0 }
  for (;;) {
    // Skip whitespace and non-element preamble until the root element.
    while (c.pos < src.length && /\s/.test(src[c.pos])) c.pos++
    if (c.pos >= src.length) throw new Error('No root element found')
    if (src[c.pos] !== '<') throw new Error('Unexpected text before root element')
    skipNonElements(c)
    while (c.pos < src.length && /\s/.test(src[c.pos])) c.pos++
    if (src.startsWith('<?', c.pos) || src.startsWith('<!', c.pos)) continue
    return parseElement(c)
  }
}

/** Depth-first walk; `enter` may return false to skip a subtree. */
export function walkXml(
  el: XmlElement,
  enter: (el: XmlElement, ancestors: XmlElement[]) => boolean | void,
  ancestors: XmlElement[] = []
): void {
  if (enter(el, ancestors) === false) return
  for (const child of el.children) {
    if (typeof child !== 'string') walkXml(child, enter, [...ancestors, el])
  }
}

export function textContent(el: XmlElement): string {
  let out = ''
  for (const child of el.children) {
    out += typeof child === 'string' ? child : textContent(child)
  }
  return out
}
