import type { SurfaceDecisionError, SurfaceDecisionResponse } from '@monetizationos/proxy'

// Vendored from the proxy's fetchSurfaceDecisions guards — keep in sync with the response contract.
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const isSurfaceDecisionError = (value: unknown): value is SurfaceDecisionError =>
    isRecord(value) && value.status === 'error' && typeof value.message === 'string' && typeof value.statusCode === 'number'

export const isSurfaceDecisionResponse = (value: unknown): value is SurfaceDecisionResponse =>
    isRecord(value) &&
    value.status === 'success' &&
    isRecord(value.identity) &&
    isRecord(value.features) &&
    isRecord(value.customer) &&
    isRecord(value.surfaceBehavior) &&
    typeof value.componentsSkipped === 'boolean' &&
    isRecord(value.componentBehaviors)
