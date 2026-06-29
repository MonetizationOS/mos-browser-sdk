import type { WebElement } from '@monetizationos/proxy'

/**
 * Normalized render result the applicator knows how to insert into the DOM.
 *
 * Mirrors the proxy's `renderElement` return of `[content, { html }]`:
 *   - `html: false` → insert as escaped text (a text node).
 *   - `html: true`  → insert as parsed markup (a fragment), executing any `<script>` it contains
 *                     via the cloned-script technique.
 *   - `kind: 'empty'` → render nothing (unsupported type, or a failed/handled custom element).
 */
export type RenderedElement = { kind: 'content'; html: boolean; content: string } | { kind: 'empty' }

const EMPTY: RenderedElement = { kind: 'empty' }

/**
 * Host-providable renderer for `custom` web elements. Unsupported by default, matching the
 * proxy. Returning `null`/`undefined` falls back to rendering nothing.
 */
export type CustomElementRenderer = (element: Extract<WebElement, { type: 'custom' }>) => RenderedElement | null | undefined

export interface RenderElementOptions {
    /** Optional host renderer for `custom` elements. */
    renderCustom?: CustomElementRenderer
    /** Called when an element fails to render or is an unsupported type, for host observability. */
    onUnsupported?: (info: { type: unknown; reason: 'error' | 'unsupported'; error?: unknown }) => void
}

/**
 * Browser analogue of the proxy's `renderElement`. The proxy version takes a `PipelineContext` only
 * for logging; here we accept an optional `onUnsupported` callback and otherwise stay pure.
 *
 * Branching matches the proxy: lowercase the type, then `html` / `text` / `custom`. Any other type
 * falls through to `onUnsupported`.
 */
export const renderElement = (element: WebElement, options: RenderElementOptions = {}): RenderedElement => {
    try {
        const type = element.type?.toLowerCase()

        if (type === 'html') {
            return { kind: 'content', html: true, content: (element as { content: string }).content }
        }
        if (type === 'text') {
            return { kind: 'content', html: false, content: (element as { content: string }).content }
        }
        if (type === 'custom') {
            const rendered = options.renderCustom?.(element as Extract<WebElement, { type: 'custom' }>)
            if (rendered) return rendered
            options.onUnsupported?.({ type: element.type, reason: 'unsupported' })
            return EMPTY
        }
    } catch (error) {
        options.onUnsupported?.({ type: element.type, reason: 'error', error })
        return EMPTY
    }

    options.onUnsupported?.({ type: element.type, reason: 'unsupported' })
    return EMPTY
}
