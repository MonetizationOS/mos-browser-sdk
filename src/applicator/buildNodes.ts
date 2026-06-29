import type { WebElement } from '@monetizationos/proxy'
import { type RenderElementOptions, renderElement } from '../render/renderElement'

// Off-document node construction: build detached nodes here; the insertion helpers place
// them. This module never touches the live DOM.

/**
 * Re-create a `<script>` as a fresh, executable element (the cloned-script technique).
 *
 * Scripts parsed via `<template>`/`innerHTML` are inert — the parser marks them "already started" so
 * they never run even once moved into the document. A brand-new `createElement('script')` has that
 * flag unset, so copying the attributes and inline text onto a fresh element and swapping it in makes
 * injected scripts run (matching the proxy). Only runs over freshly-built fragments, so scripts
 * already in the live DOM are never re-executed.
 */
const reviveScript = (doc: Document, original: HTMLScriptElement): HTMLScriptElement => {
    const fresh = doc.createElement('script')
    for (const attr of Array.from(original.attributes)) {
        fresh.setAttribute(attr.name, attr.value)
    }
    if (original.textContent) fresh.textContent = original.textContent
    return fresh
}

/**
 * Parse trusted markup into a detached `DocumentFragment`, reviving any `<script>` so it will
 * execute when the fragment is inserted. Uses a `<template>` so the parse is fully inert until we
 * deliberately insert.
 */
export const buildFragment = (doc: Document, markup: string): DocumentFragment => {
    const template = doc.createElement('template')
    template.innerHTML = markup
    const fragment = template.content

    const scripts = fragment.querySelectorAll('script')
    for (const original of Array.from(scripts)) {
        original.replaceWith(reviveScript(doc, original as HTMLScriptElement))
    }

    return fragment
}

/**
 * Render a list of {@link WebElement}s into a single detached `DocumentFragment`, preserving order.
 * `text` elements become text nodes (escaped by construction); `html`/`element` become parsed markup
 * with revived scripts. Returns an empty fragment when nothing renders.
 *
 * Building one fragment and inserting it once (rather than inserting per element) means insertion
 * order matches source order with no reversal trick — unlike the proxy's streaming rewriter, which
 * must reverse `before`/`prepend` lists because it inserts each item adjacent to the element.
 */
export const buildNodes = (doc: Document, elements: WebElement[], options: RenderElementOptions = {}): DocumentFragment => {
    const out = doc.createDocumentFragment()
    for (const element of elements) {
        const rendered = renderElement(element, options)
        if (rendered.kind === 'empty') continue
        if (rendered.html) {
            out.appendChild(buildFragment(doc, rendered.content))
        } else {
            out.appendChild(doc.createTextNode(rendered.content))
        }
    }
    return out
}
