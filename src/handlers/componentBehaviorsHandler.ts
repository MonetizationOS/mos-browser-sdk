import { applyComponentBehaviors } from '../applicator/applyComponentBehaviors'
import type { DirectiveContext, DirectiveHandler, DirectiveResult } from '../decision/dispatch'

/**
 * The v1 component block handler. Consumes `decision.componentBehaviors` and applies
 * each behaviour's `content` to the live DOM via the non-destructive applicator.
 */
export const componentBehaviorsHandler: DirectiveHandler = {
    name: 'componentBehaviors',
    apply(ctx: DirectiveContext): DirectiveResult {
        const behaviors = ctx.decision.componentBehaviors
        if (!behaviors || Object.keys(behaviors).length === 0) {
            return { applied: false }
        }
        const result = applyComponentBehaviors(behaviors, {
            doc: ctx.doc,
            render: ctx.render,
            onWarn: ctx.onWarn,
        })
        return { applied: result.appliedElements > 0, detail: result }
    },
}
