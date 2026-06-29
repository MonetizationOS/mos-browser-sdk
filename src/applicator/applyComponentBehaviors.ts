import type { SubSurfaceBehaviorApi } from '@monetizationos/proxy'
import type { RenderElementOptions } from '../render/renderElement'
import { applyContentBehavior } from './applyContentBehavior'

export interface ApplyComponentBehaviorsOptions {
    doc: Document
    /** Element render options (custom renderer hook, unsupported callback). */
    render?: RenderElementOptions
    onWarn?: (info: { code: string; message: string; componentKey?: string }) => void
}

export interface ApplyComponentBehaviorsResult {
    /** Number of component behaviours that matched at least one element. */
    appliedComponents: number
    /** Total matched elements transformed across all behaviours. */
    appliedElements: number
    /** Component keys skipped for lacking a selector or content. */
    skipped: string[]
}

/**
 * The v1 component block handler. `componentBehaviors` is a
 * `Record<componentKey, SubSurfaceBehaviorApi>`; for each entry we resolve `metadata.cssSelector`,
 * match all elements (`querySelectorAll`, same match-all semantics as the rewriter, and a selector
 * superset — `:last-child` etc. are fine here), and apply `content` to each.
 *
 * Behaviours with no selector or no content are skipped, matching the proxy.
 */
export const applyComponentBehaviors = (
    componentBehaviors: Record<string, SubSurfaceBehaviorApi>,
    options: ApplyComponentBehaviorsOptions,
): ApplyComponentBehaviorsResult => {
    const { doc } = options
    const result: ApplyComponentBehaviorsResult = { appliedComponents: 0, appliedElements: 0, skipped: [] }

    for (const [componentKey, behavior] of Object.entries(componentBehaviors ?? {})) {
        const selector = behavior?.metadata?.cssSelector
        const content = behavior?.content
        if (!selector || !content) {
            result.skipped.push(componentKey)
            continue
        }

        let matches: NodeListOf<Element>
        try {
            matches = doc.querySelectorAll(selector)
        } catch {
            // Invalid selector: skip this behaviour, don't break the rest (fail-open).
            options.onWarn?.({ code: 'invalid-selector', message: `Invalid cssSelector "${selector}"`, componentKey })
            result.skipped.push(componentKey)
            continue
        }

        if (matches.length === 0) continue

        result.appliedComponents++
        // Snapshot to an array: applying `remove`/`replaceRange` mutates the DOM, and we must not
        // re-process newly inserted nodes that happen to match the same selector.
        for (const matched of Array.from(matches)) {
            applyContentBehavior(matched, content, {
                doc,
                render: options.render,
                onWarn: (info) => options.onWarn?.({ ...info, componentKey }),
            })
            result.appliedElements++
        }
    }

    return result
}
