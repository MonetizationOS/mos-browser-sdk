import type { WebContentSurfaceBehavior } from '@monetizationos/proxy'
import type { RenderElementOptions } from '../render/renderElement'
import { buildNodes } from './buildNodes'
import { applyReplaceRange } from './replaceRange'

export interface ApplyContext {
    doc: Document
    render?: RenderElementOptions
    onWarn?: (info: { code: string; message: string }) => void
}

/**
 * Apply a {@link WebContentSurfaceBehavior} to one matched element, mirroring the proxy's operation
 * mapping. All insertion is non-destructive: new nodes are built off-document and
 * placed at boundaries with `before` / `prepend` / `append` / `after`; existing nodes are only ever
 * left in place or moved adjacent to, never re-rendered.
 *
 * Order follows the proxy: insert around/inside the element, then remove the element last (if asked).
 * When `remove` is set alongside `before`/`after`, those inserted siblings survive the removal —
 * giving "replace this element with new content" semantics, exactly as the proxy's
 * `ContentElementHandler` produces via `element.replace('')`.
 */
export const applyContentBehavior = (matched: Element, content: WebContentSurfaceBehavior, ctx: ApplyContext): void => {
    const { doc, render } = ctx

    if (content.before?.length) {
        matched.before(buildNodes(doc, content.before, render))
    }
    if (content.prepend?.length) {
        matched.prepend(buildNodes(doc, content.prepend, render))
    }
    if (content.replaceRange) {
        applyReplaceRange(matched, content.replaceRange, { doc, render, onWarn: ctx.onWarn })
    }
    if (content.append?.length) {
        matched.append(buildNodes(doc, content.append, render))
    }
    if (content.after?.length) {
        matched.after(buildNodes(doc, content.after, render))
    }
    if (content.remove) {
        matched.remove()
    }
}
