import type { WebComponentRangeReplacement } from '@monetizationos/proxy'
import type { RenderElementOptions } from '../render/renderElement'
import { buildNodes } from './buildNodes'

/**
 * `replaceRange` via the Range API (the proxy's streaming marker pre-scan has no DOM
 * equivalent). `fromMarker` / `toMarker` are CSS selectors resolved within the matched element; the
 * nodes strictly between them are removed (the markers themselves are kept, matching the proxy) and
 * `replaceWith` is inserted at the start boundary.
 *
 * DOM preservation applies to *surviving* nodes: only whole nodes fully contained in the range are
 * removed, so markers, everything outside the range, and any ancestor straddling a boundary keep
 * their identity — never cloned or rebuilt (`deleteContents`/`extractContents` would split and
 * recreate straddling nodes). Content inside the range is what the caller asked to remove,
 * stateful or not.
 */
export interface ReplaceRangeContext {
    doc: Document
    render?: RenderElementOptions
    onWarn?: (info: { code: string; message: string }) => void
}

// Whether `node` is fully contained within `range` (both its boundaries lie inside the range).
// `scratch` is reused across calls via `selectNode` to avoid allocating a Range per node.
const rangeFullyContains = (range: Range, scratch: Range, node: Node): boolean => {
    try {
        scratch.selectNode(node)
    } catch {
        return false
    }
    return range.compareBoundaryPoints(Range.START_TO_START, scratch) <= 0 && range.compareBoundaryPoints(Range.END_TO_END, scratch) >= 0
}

// Top-level nodes fully inside the range, in document order (descendants of a captured node skipped).
const topLevelNodesInRange = (doc: Document, range: Range): Node[] => {
    const root = range.commonAncestorContainer
    const result: Node[] = []
    const scratch = doc.createRange()
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ALL)
    let node: Node | null = walker.currentNode === root ? walker.nextNode() : walker.currentNode
    while (node) {
        if (rangeFullyContains(range, scratch, node)) {
            result.push(node)
            // Skip the captured node's subtree — we only want the topmost contained nodes.
            const next = walker.nextSibling()
            if (next) {
                node = next
                continue
            }
            // No next sibling: climb until we find one or exhaust the tree.
            let climbed: Node | null = null
            while (walker.parentNode()) {
                const sib = walker.nextSibling()
                if (sib) {
                    climbed = sib
                    break
                }
            }
            node = climbed
        } else {
            node = walker.nextNode()
        }
    }
    return result
}

export const applyReplaceRange = (matched: Element, replacement: WebComponentRangeReplacement, ctx: ReplaceRangeContext): void => {
    const { doc } = ctx
    const { fromMarker, toMarker, replaceWith } = replacement

    let fromEl: Element | null = null
    if (fromMarker) {
        fromEl = matched.querySelector(fromMarker)
        if (!fromEl) {
            // Can't anchor the start: fail safe and do nothing, matching the proxy staying in SCANNING.
            ctx.onWarn?.({
                code: 'replace-range-from-marker-missing',
                message: `fromMarker "${fromMarker}" not found; skipping replaceRange.`,
            })
            return
        }
    }

    let toEl: Element | null = null
    if (toMarker) {
        toEl = matched.querySelector(toMarker)
        if (!toEl) {
            // Proxy removes to end when the end marker is never seen; mirror that, but flag it.
            ctx.onWarn?.({
                code: 'replace-range-to-marker-missing',
                message: `toMarker "${toMarker}" not found; removing to end of element.`,
            })
        }
    }

    const range = doc.createRange()
    if (fromEl) {
        range.setStartAfter(fromEl)
    } else {
        range.setStart(matched, 0)
    }
    if (toEl) {
        range.setEndBefore(toEl)
    } else {
        range.setEnd(matched, matched.childNodes.length)
    }

    for (const node of topLevelNodesInRange(doc, range)) {
        ;(node as ChildNode).remove?.()
    }

    if (replaceWith?.length) {
        const fragment = buildNodes(doc, replaceWith, ctx.render)
        if (fromEl) {
            fromEl.after(fragment)
        } else {
            matched.prepend(fragment)
        }
    }
}
