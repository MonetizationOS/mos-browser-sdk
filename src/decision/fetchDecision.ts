import type { Resource, SurfaceDecisionResponse } from '@monetizationos/proxy'
import type { Identity } from '../identity/types'
import { asError } from '../internal'
import { BROWSER_PACKAGE_VERSION, BROWSER_PACKAGE_VERSION_HEADER } from '../version'
import { isSurfaceDecisionError, isSurfaceDecisionResponse } from './guards'

export const SURFACE_DECISIONS_PATH = '/api/v1/surface-decisions'

export type FetchImpl = typeof fetch

export type DecisionFailureReason = 'request-failed' | 'invalid-json' | 'api-error' | 'http-error' | 'invalid-response' | 'aborted'

export type DecisionResult =
    | { ok: true; data: SurfaceDecisionResponse }
    | { ok: false; reason: DecisionFailureReason; error: Error; status?: number; statusCode?: number }

export interface FetchDecisionArgs {
    apiBaseUrl: string
    /** Public key (`pk_*`), safe to ship in page source. */
    publicKey: string
    surfaceSlug: string
    identity: Identity
    resource: Resource
    /**
     * Optional abort signal — supported for a custom `fetchImpl` that implements its own cancellation.
     * The SDK itself no longer passes one: the cloak timeout reveals but never aborts the request.
     */
    signal?: AbortSignal
    /** Override `fetch` (tests / custom transport). Defaults to the global. */
    fetchImpl?: FetchImpl
}

/**
 * The browser, `pk_`-keyed surface-decision request.
 *
 * Unlike the proxy's `fetchSurfaceDecisions`, the body **omits `http` and `cloudflare` entirely** —
 * the public key cannot assert those, and the server observes the real User-Agent/Referer from
 * the browser request anyway. We send only `surfaceSlug`, `identity`, and `resource`, plus a client
 * version header so the server can reason about client capability.
 *
 * Fail-open by contract: every failure returns a discriminated `{ ok: false }` and there is **no
 * retry** — `surface-decisions` consumes and exposes no idempotency key, so a retry risks
 * double-consuming.
 */
export const fetchDecision = async (args: FetchDecisionArgs): Promise<DecisionResult> => {
    const { apiBaseUrl, publicKey, surfaceSlug, identity, resource, signal } = args
    const doFetch = args.fetchImpl ?? fetch

    const body = JSON.stringify({ surfaceSlug, identity, resource })

    let url: string
    try {
        url = new URL(SURFACE_DECISIONS_PATH, apiBaseUrl).toString()
    } catch (error) {
        return { ok: false, reason: 'request-failed', error: asError(error) }
    }

    let response: Response
    try {
        response = await doFetch(url, {
            method: 'POST',
            body,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${publicKey}`,
                [BROWSER_PACKAGE_VERSION_HEADER]: BROWSER_PACKAGE_VERSION,
            },
            signal,
        })
    } catch (error) {
        if (isAbortError(error)) return { ok: false, reason: 'aborted', error: asError(error) }
        return { ok: false, reason: 'request-failed', error: asError(error) }
    }

    let data: unknown
    try {
        data = await response.json()
    } catch (error) {
        return { ok: false, reason: 'invalid-json', error: asError(error), status: response.status }
    }

    if (isSurfaceDecisionError(data)) {
        return { ok: false, reason: 'api-error', error: new Error(data.message), status: response.status, statusCode: data.statusCode }
    }
    if (!response.ok) {
        return {
            ok: false,
            reason: 'http-error',
            error: new Error(`Surface decisions API returned HTTP ${response.status}`),
            status: response.status,
        }
    }
    if (!isSurfaceDecisionResponse(data)) {
        return {
            ok: false,
            reason: 'invalid-response',
            error: new Error('Surface decisions API returned an invalid response shape'),
            status: response.status,
        }
    }

    return { ok: true, data }
}

const isAbortError = (error: unknown): boolean =>
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
