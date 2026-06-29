import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { revealCloak } from './snippet'

/**
 * Pluggable reveal pipeline. The reveal step is a transform pipeline, not a hardcoded
 * "remove hiding CSS", so the future decrypt transform slots in ahead of reveal without
 * rework: the lifecycle becomes hide → decide → decrypt → reveal. v1 ships exactly one transform.
 */
export type RevealReason = 'success' | 'error' | 'timeout'

export interface RevealContext {
    win: Window & typeof globalThis
    doc: Document
    reason: RevealReason
    decision?: SurfaceDecisionResponse
    /** Called when a transform throws (still swallowed so reveal continues) — for telemetry. */
    onTransformError?: (error: unknown) => void
}

export type RevealTransform = (ctx: RevealContext) => void | Promise<void>

/** v1's only transform: reveal cloaked regions. A future decrypt transform runs before this one. */
export const defaultRevealTransform: RevealTransform = ({ win }) => {
    revealCloak(win)
}

/**
 * Run reveal transforms in order. Each is isolated so a throwing transform never blocks the reveal
 * that follows it — reveal must happen on success, error, and timeout.
 */
export const runRevealPipeline = async (transforms: RevealTransform[], ctx: RevealContext): Promise<void> => {
    for (const transform of transforms) {
        try {
            await transform(ctx)
        } catch (error) {
            // Reveal is resilience-critical: report but swallow so later transforms still run.
            ctx.onTransformError?.(error)
        }
    }
}
