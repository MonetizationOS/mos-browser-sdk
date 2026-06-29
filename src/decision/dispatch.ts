import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import type { RenderElementOptions } from '../render/renderElement'

/**
 * Extensible directive-block dispatch. The decision response is treated as a set of
 * declarative client-directive blocks; each registered handler consumes the block(s) it understands
 * and ignores the rest. New block handlers (a future browser-control block, a counter-instruction
 * block, a decrypt step) slot in here with no rework.
 *
 * v1 ships exactly one handler: `componentBehaviors`. `surfaceBehavior.http` is intentionally not
 * handled. Unknown response fields are ignored by virtue of no handler claiming them, which
 * is what makes a newer server safe against an older client.
 */
export interface DirectiveContext {
    doc: Document
    decision: SurfaceDecisionResponse
    render?: RenderElementOptions
    onWarn?: (info: { code: string; message: string; componentKey?: string }) => void
}

export interface DirectiveResult {
    applied: boolean
    detail?: unknown
}

export interface DirectiveHandler {
    /** Stable identifier, used as the key in the dispatch report and for telemetry. */
    name: string
    apply(ctx: DirectiveContext): DirectiveResult
}

/**
 * Run each handler over the decision. A handler that throws is isolated (fail-open): its error is
 * captured in the report and the remaining handlers still run.
 */
export const dispatchDirectives = (
    handlers: DirectiveHandler[],
    ctx: DirectiveContext,
): Record<string, DirectiveResult & { error?: unknown }> => {
    const report: Record<string, DirectiveResult & { error?: unknown }> = {}
    for (const handler of handlers) {
        try {
            report[handler.name] = handler.apply(ctx)
        } catch (error) {
            report[handler.name] = { applied: false, error }
        }
    }
    return report
}
