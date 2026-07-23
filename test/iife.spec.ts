import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLoaderSnippet } from '../src/loader/snippet'

// biome-ignore lint/suspicious/noExplicitAny: poking at window globals the IIFE manages
const win = window as any

const decision: SurfaceDecisionResponse = {
    status: 'success',
    identity: { identifier: 'a', isAuthenticated: false, authType: 'anonymous', jwtClaims: {} },
    features: {},
    customer: { hasProducts: true },
    surfaceBehavior: {},
    componentsSkipped: false,
    componentBehaviors: {},
}

const okFetch = (capture: (identity: unknown) => void) =>
    vi.fn(async (_u: unknown, init?: RequestInit) => {
        capture(JSON.parse(init?.body as string).identity)
        return new Response(JSON.stringify(decision), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch

beforeEach(() => {
    vi.resetModules()
    win.MOS = undefined
    win.MOSConfig = undefined
    document.head.innerHTML = ''
    document.body.innerHTML = ''
})

describe('IIFE stub-and-queue loader', () => {
    it('replays queued calls in order, then exposes the real client', async () => {
        let sentIdentity: unknown
        win.MOSConfig = {
            publicKey: 'pk',
            surface: 's',
            manual: true,
            fetchImpl: okFetch((id) => {
                sentIdentity = id
            }),
        }
        // A stub installed before the bundle queued an early identify() call.
        win.MOS = { q: [['identify', [{ userJwt: 'QUEUED_JWT' }]]] }

        await import('../src/iife')

        expect(typeof win.MOS.decide).toBe('function')
        expect(win.MOS.__mosReady).toBe(true)

        await win.MOS.decide()
        // The queued identify() was replayed before this decide resolved identity.
        expect(sentIdentity).toEqual({ userJwt: 'QUEUED_JWT', createAnonymousIdentifierFallback: true })
    })

    it('replays a call queued by the one-paste loader snippet', async () => {
        let sentIdentity: unknown
        // The combined loader installs the same stub the bundle drains, then injects the (inert, in
        // jsdom) bundle tag with config as data-mos-* attributes.
        // biome-ignore lint/security/noGlobalEval: exercising the generated synchronous loader snippet
        window.eval(buildLoaderSnippet({ config: { pk: 'pk', surface: 's' } }))
        win.MOS.identify({ userJwt: 'QUEUED_JWT' }) // early call, captured by the stub

        // MOSConfig (manual + fetchImpl) wins over the injected data-mos-* attrs for this test.
        win.MOSConfig = {
            publicKey: 'pk',
            surface: 's',
            manual: true,
            fetchImpl: okFetch((id) => {
                sentIdentity = id
            }),
        }
        await import('../src/iife')

        expect(win.MOS.__mosReady).toBe(true)
        await win.MOS.decide()
        expect(sentIdentity).toEqual({ userJwt: 'QUEUED_JWT', createAnonymousIdentifierFallback: true })
    })

    it('is safe with no prior stub', async () => {
        win.MOSConfig = { publicKey: 'pk', surface: 's', manual: true, fetchImpl: okFetch(() => {}) }
        await import('../src/iife')
        expect(typeof win.MOS.identify).toBe('function')
        expect(win.MOS.__mosReady).toBe(true)
    })

    it('ignores non-replayable queued method names', async () => {
        win.MOSConfig = { publicKey: 'pk', surface: 's', manual: true, fetchImpl: okFetch(() => {}) }
        win.MOS = { q: [['evilMethod', ['x']]] }
        // Must not throw on boot.
        await expect(import('../src/iife')).resolves.toBeDefined()
        expect(win.MOS.__mosReady).toBe(true)
    })
})
