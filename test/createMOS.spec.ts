import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOAK_STYLE_ID, installCloak } from '../src/cloak/snippet'
import { createMOS } from '../src/createMOS'
import type { IdentityStore } from '../src/identity/types'

const decisionWith = (
    componentBehaviors: SurfaceDecisionResponse['componentBehaviors'],
    over: Partial<SurfaceDecisionResponse> = {},
): SurfaceDecisionResponse => ({
    status: 'success',
    identity: { identifier: 'anon-1', isAuthenticated: false, authType: 'anonymous', jwtClaims: {} },
    features: {},
    customer: { hasProducts: true },
    surfaceBehavior: {},
    componentsSkipped: false,
    componentBehaviors,
    ...over,
})

const jsonOk = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

const okFetch = (decision: SurfaceDecisionResponse, capture?: (body: unknown) => void) =>
    vi.fn(async (_url: unknown, init?: RequestInit) => {
        capture?.(JSON.parse(init?.body as string))
        return jsonOk(decision)
    }) as unknown as typeof fetch

const base = { publishableKey: 'pk_test', surface: 'article-paywall', apiBaseUrl: 'https://api.example.com' as const }

beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    localStorage.clear()
    // The default store also writes a first-party cookie; clear it so anon-id state doesn't leak between tests.
    for (const c of document.cookie.split(';')) {
        const name = c.split('=')[0]?.trim()
        if (name) document.cookie = `${name}=; Max-Age=0; Path=/`
    }
    ;(window as unknown as Record<string, unknown>).__mosCloak = undefined
})

describe('createMOS — lifecycle', () => {
    it('manual decide() applies componentBehaviors and calls onDecision', async () => {
        document.body.innerHTML = '<div id="slot">orig</div>'
        const onDecision = vi.fn()
        const decision = decisionWith({
            paywall: { metadata: { cssSelector: '#slot' }, content: { append: [{ type: 'text', content: '!' }] } },
        })
        const mos = createMOS({ ...base, manual: true, onDecision, fetchImpl: okFetch(decision) })
        const res = await mos.decide()
        expect(res?.ok).toBe(true)
        expect(document.getElementById('slot')?.textContent).toBe('orig!')
        expect(onDecision).toHaveBeenCalledWith(decision)
    })

    it('auto-fires exactly one decision on load when not manual', async () => {
        document.body.innerHTML = '<div id="slot">x</div>'
        const fetchImpl = okFetch(
            decisionWith({ k: { metadata: { cssSelector: '#slot' }, content: { append: [{ type: 'text', content: 'Y' }] } } }),
        )
        const onReady = vi.fn()
        createMOS({ ...base, onReady, fetchImpl })
        await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
        expect(document.getElementById('slot')?.textContent).toBe('xY')
        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('auto-fire starts the request before DOMContentLoaded, then applies once the DOM is ready', async () => {
        // Force "still parsing" so the fetch fires early but the apply is gated on DOMContentLoaded.
        Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' })
        try {
            document.body.innerHTML = '<div id="slot">x</div>'
            const fetchImpl = okFetch(
                decisionWith({ k: { metadata: { cssSelector: '#slot' }, content: { append: [{ type: 'text', content: 'Y' }] } } }),
            )
            createMOS({ ...base, fetchImpl })

            // The request fires without waiting for DOMContentLoaded (it needs no DOM)…
            await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
            // …but the decision is not applied while the document is still parsing.
            expect(document.getElementById('slot')?.textContent).toBe('x')

            // Once the DOM is parsed, the already-fetched decision applies.
            Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'interactive' })
            await vi.waitFor(() => {
                document.dispatchEvent(new Event('DOMContentLoaded'))
                expect(document.getElementById('slot')?.textContent).toBe('xY')
            })
        } finally {
            Reflect.deleteProperty(document, 'readyState')
        }
    })

    it('manual mode does not auto-fire', async () => {
        const fetchImpl = okFetch(decisionWith({}))
        createMOS({ ...base, manual: true, fetchImpl })
        await new Promise((r) => setTimeout(r, 30))
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('identify() sets the JWT used by the next decide (highest precedence)', async () => {
        let sentIdentity: unknown
        const fetchImpl = okFetch(decisionWith({}), (body) => {
            sentIdentity = (body as { identity: unknown }).identity
        })
        const mos = createMOS({ ...base, manual: true, fetchImpl })
        mos.identify({ userJwt: 'JWT_ABC' })
        await mos.decide()
        expect(sentIdentity).toEqual({ userJwt: 'JWT_ABC', createAnonymousIdentifierFallback: true })
    })

    it('persists the anonymous identifier across decides', async () => {
        let lastIdentity: unknown
        const fetchImpl = okFetch(
            decisionWith({}, { identity: { identifier: 'anon-persist', isAuthenticated: false, authType: 'anonymous', jwtClaims: {} } }),
            (b) => {
                lastIdentity = (b as { identity: unknown }).identity
            },
        )
        const mos = createMOS({ ...base, manual: true, fetchImpl })
        await mos.decide()
        expect(lastIdentity).toEqual({ createAnonymousIdentifier: true }) // first call: nothing persisted
        await mos.decide()
        expect(lastIdentity).toEqual({ anonymousIdentifier: 'anon-persist' }) // second call: persisted id sent
    })
})

describe('createMOS — failure model (fail-open)', () => {
    it('leaves the page intact and reveals cloak on a decision failure, calling onError', async () => {
        document.body.innerHTML = '<div id="slot">untouched</div>'
        installCloak(window, { selectors: ['#slot'] })
        const onError = vi.fn()
        const fetchImpl = (async () => {
            throw new Error('network down')
        }) as unknown as typeof fetch
        const mos = createMOS({ ...base, manual: true, onError, fetchImpl })
        const res = await mos.decide()
        expect(res?.ok).toBe(false)
        expect(document.getElementById('slot')?.textContent).toBe('untouched') // no transforms applied
        expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull() // revealed
        expect(onError).toHaveBeenCalled()
    })

    it('reveals the cloak and calls onError on the max-wait timeout, without aborting the request', async () => {
        installCloak(window, { selectors: ['#slot'] })
        const onError = vi.fn()
        let fetchCalled = false
        let signalArg: AbortSignal | null | undefined
        const hangingFetch = ((_u: unknown, init?: RequestInit) => {
            fetchCalled = true
            signalArg = init?.signal
            return new Promise<Response>(() => {}) // never resolves: the request stays in flight
        }) as unknown as typeof fetch
        const mos = createMOS({ ...base, manual: true, decisionTimeoutMs: 20, onError, fetchImpl: hangingFetch })
        void mos.decide() // never resolves; the reveal + onError are side effects of the mask expiring
        await vi.waitFor(() => expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull())
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('exceeded') }))
        expect(fetchCalled).toBe(true)
        expect(signalArg == null).toBe(true) // issued without an abort signal — the request is never cancelled
    })

    it('still applies a slow decision that lands after the mask reveal (FOUC, then transform)', async () => {
        document.body.innerHTML = '<div id="slot">orig</div>'
        installCloak(window, { selectors: ['#slot'] })
        const onDecision = vi.fn()
        const decision = decisionWith({
            paywall: { metadata: { cssSelector: '#slot' }, content: { append: [{ type: 'text', content: '!' }] } },
        })
        let resolveFetch: (r: Response) => void = () => {}
        const slowFetch = (() =>
            new Promise<Response>((res) => {
                resolveFetch = res
            })) as unknown as typeof fetch
        const mos = createMOS({ ...base, manual: true, decisionTimeoutMs: 20, onDecision, fetchImpl: slowFetch })
        const done = mos.decide()
        await vi.waitFor(() => expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull()) // mask lifts first (FOUC window)
        expect(document.getElementById('slot')?.textContent).toBe('orig') // decision not applied yet
        resolveFetch(jsonOk(decision)) // decision lands late
        await done
        expect(document.getElementById('slot')?.textContent).toBe('orig!') // applied after the reveal
        expect(onDecision).toHaveBeenCalledWith(decision)
    })

    it('errors and reveals when publishableKey/surface are missing', async () => {
        installCloak(window, { selectors: ['#slot'] })
        const onError = vi.fn()
        const mos = createMOS({ manual: true, surface: '', publishableKey: '', onError })
        const res = await mos.decide()
        expect(res?.ok).toBe(false)
        expect(onError).toHaveBeenCalled()
        expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull()
    })

    it('still applies a successful decision when a custom store.set rejects (best-effort persist)', async () => {
        document.body.innerHTML = '<div id="slot">orig</div>'
        const onDecision = vi.fn()
        const onError = vi.fn()
        // A custom async store whose set() rejects must not abort the (already-consumed) decision.
        const store: IdentityStore = { get: () => undefined, set: () => Promise.reject(new Error('quota exceeded')) }
        const decision = decisionWith({
            paywall: { metadata: { cssSelector: '#slot' }, content: { append: [{ type: 'text', content: '!' }] } },
        })
        const mos = createMOS({ ...base, manual: true, onDecision, onError, identity: { store }, fetchImpl: okFetch(decision) })
        const res = await mos.decide()
        expect(res?.ok).toBe(true)
        expect(document.getElementById('slot')?.textContent).toBe('orig!') // directives still applied
        expect(onDecision).toHaveBeenCalledWith(decision)
        expect(onError).not.toHaveBeenCalled() // persist failure is swallowed, not surfaced as an error
    })
})
