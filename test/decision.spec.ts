import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildResource, readPageMetadata } from '../src/decision/buildResource'
import { type DirectiveHandler, dispatchDirectives } from '../src/decision/dispatch'
import { fetchDecision } from '../src/decision/fetchDecision'
import { isSurfaceDecisionError, isSurfaceDecisionResponse } from '../src/decision/guards'
import { BROWSER_PACKAGE_VERSION, BROWSER_PACKAGE_VERSION_HEADER } from '../src/version'

const goodResponse: SurfaceDecisionResponse = {
    status: 'success',
    identity: { identifier: 'a', isAuthenticated: false, authType: 'anonymous', jwtClaims: {} },
    features: {},
    customer: { hasProducts: true },
    surfaceBehavior: {},
    componentsSkipped: false,
    componentBehaviors: {},
}

const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('guards', () => {
    it('recognizes a valid success response', () => {
        expect(isSurfaceDecisionResponse(goodResponse)).toBe(true)
    })
    it('rejects malformed responses', () => {
        expect(isSurfaceDecisionResponse({ status: 'success' })).toBe(false)
        expect(isSurfaceDecisionResponse(null)).toBe(false)
    })
    it('recognizes an error response', () => {
        expect(isSurfaceDecisionError({ status: 'error', message: 'no', statusCode: 403 })).toBe(true)
    })
})

describe('buildResource', () => {
    beforeEach(() => {
        document.head.innerHTML = ''
    })

    it('derives id from location.pathname and meta from <meta> tags', () => {
        document.head.innerHTML = '<meta name="author" content="Jane"><meta property="og:type" content="article">'
        const r = buildResource()
        expect(r.id).toBe(window.location.pathname)
        expect(r.meta).toEqual({ author: 'Jane', 'og:type': 'article' })
    })

    it('readPageMetadata keys on name ?? property, matching the proxy', () => {
        document.head.innerHTML = '<meta name="n" content="1"><meta property="p" content="2"><meta content="ignored">'
        expect(readPageMetadata(document)).toEqual({ n: '1', p: '2' })
    })

    it('merges defaults < provider < override', () => {
        const r = buildResource({ provider: () => ({ tier: 'gold', id: 'from-provider' }), override: { id: '/override' } })
        expect(r.id).toBe('/override')
        expect((r as Record<string, unknown>).tier).toBe('gold')
    })

    it('survives a throwing provider', () => {
        const r = buildResource({
            provider: () => {
                throw new Error('x')
            },
        })
        expect(r.id).toBe(window.location.pathname)
    })
})

describe('fetchDecision (pk_ request)', () => {
    it('omits http and cloudflare; sends only surfaceSlug/identity/resource, Bearer pk_, and the client version header', async () => {
        let captured: { url: string; init: RequestInit } | undefined
        const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            captured = { url: String(url), init: init! }
            return jsonResponse(goodResponse)
        }) as unknown as typeof fetch

        const res = await fetchDecision({
            apiBaseUrl: 'https://api.example.com',
            publicKey: 'pk_live_123',
            surfaceSlug: 'article-paywall',
            identity: { createAnonymousIdentifier: true },
            resource: { id: '/x', meta: {} },
            fetchImpl,
        })

        expect(res.ok).toBe(true)
        expect(captured!.url).toBe('https://api.example.com/api/v1/surface-decisions')
        const body = JSON.parse(captured!.init.body as string)
        expect(body).toEqual({
            surfaceSlug: 'article-paywall',
            identity: { createAnonymousIdentifier: true },
            resource: { id: '/x', meta: {} },
        })
        expect(body).not.toHaveProperty('http')
        expect(body).not.toHaveProperty('cloudflare')
        const headers = captured!.init.headers as Record<string, string>
        expect(headers.Authorization).toBe('Bearer pk_live_123')
        expect(headers[BROWSER_PACKAGE_VERSION_HEADER]).toBe(BROWSER_PACKAGE_VERSION)
    })

    it('returns api-error for a structured error body', async () => {
        const fetchImpl = (async () =>
            jsonResponse({ status: 'error', message: 'forbidden', statusCode: 403 }, 403)) as unknown as typeof fetch
        const res = await fetchDecision({
            apiBaseUrl: 'https://a.co',
            publicKey: 'pk_x',
            surfaceSlug: 's',
            identity: { createAnonymousIdentifier: true },
            resource: { id: '/', meta: {} },
            fetchImpl,
        })
        expect(res).toMatchObject({ ok: false, reason: 'api-error', statusCode: 403 })
    })

    it('returns http-error for a non-2xx non-structured response', async () => {
        const fetchImpl = (async () => new Response('oops', { status: 500 })) as unknown as typeof fetch
        const res = await fetchDecision({
            apiBaseUrl: 'https://a.co',
            publicKey: 'pk_x',
            surfaceSlug: 's',
            identity: { createAnonymousIdentifier: true },
            resource: { id: '/', meta: {} },
            fetchImpl,
        })
        expect(res).toMatchObject({ ok: false })
    })

    it('returns request-failed when fetch throws', async () => {
        const fetchImpl = (async () => {
            throw new Error('network down')
        }) as unknown as typeof fetch
        const res = await fetchDecision({
            apiBaseUrl: 'https://a.co',
            publicKey: 'pk_x',
            surfaceSlug: 's',
            identity: { createAnonymousIdentifier: true },
            resource: { id: '/', meta: {} },
            fetchImpl,
        })
        expect(res).toMatchObject({ ok: false, reason: 'request-failed' })
    })

    it('returns aborted when the signal aborts', async () => {
        const controller = new AbortController()
        const fetchImpl = ((_u: unknown, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
            })) as unknown as typeof fetch
        const p = fetchDecision({
            apiBaseUrl: 'https://a.co',
            publicKey: 'pk_x',
            surfaceSlug: 's',
            identity: { createAnonymousIdentifier: true },
            resource: { id: '/', meta: {} },
            signal: controller.signal,
            fetchImpl,
        })
        controller.abort()
        expect(await p).toMatchObject({ ok: false, reason: 'aborted' })
    })
})

describe('dispatchDirectives (extensible, forward-compatible)', () => {
    it('runs handlers and isolates a throwing one (fail-open)', () => {
        const calls: string[] = []
        const good: DirectiveHandler = {
            name: 'good',
            apply: () => {
                calls.push('good')
                return { applied: true }
            },
        }
        const bad: DirectiveHandler = {
            name: 'bad',
            apply: () => {
                throw new Error('boom')
            },
        }
        const report = dispatchDirectives([bad, good], { doc: document, decision: goodResponse })
        expect(calls).toEqual(['good'])
        expect(report.good).toEqual({ applied: true })
        expect(report.bad!.applied).toBe(false)
        expect(report.bad!.error).toBeInstanceOf(Error)
    })

    it('ignores unknown response fields by virtue of no handler claiming them', () => {
        const withUnknown = { ...goodResponse, futureBlock: { redirect: '/x' } } as unknown as SurfaceDecisionResponse
        const seen: DirectiveHandler = { name: 'comp', apply: (c) => ({ applied: true, detail: Object.keys(c.decision) }) }
        const report = dispatchDirectives([seen], { doc: document, decision: withUnknown })
        // The handler ran; the unknown field was simply not consumed (no error).
        expect(report.comp!.applied).toBe(true)
    })
})
