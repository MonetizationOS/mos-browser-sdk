import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MOSLogEvent } from '../src/config/types'
import { createMOS } from '../src/createMOS'
import { createConsoleLogger } from '../src/logger'

const decision = (componentBehaviors: SurfaceDecisionResponse['componentBehaviors'] = {}): SurfaceDecisionResponse => ({
    status: 'success',
    identity: { identifier: 'anon-1', isAuthenticated: false, authType: 'anonymous', jwtClaims: {} },
    features: {},
    customer: { hasProducts: true },
    surfaceBehavior: {},
    componentsSkipped: false,
    componentBehaviors,
})

const okFetch = (d: SurfaceDecisionResponse) =>
    (async () =>
        new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

const base = { publishableKey: 'pk_test', surface: 's', apiBaseUrl: 'https://api.example.com' as const, manual: true as const }

const codes = (events: MOSLogEvent[]) => events.map((e) => e.code)

beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    localStorage.clear()
    for (const c of document.cookie.split(';')) {
        const name = c.split('=')[0]?.trim()
        if (name) document.cookie = `${name}=; Max-Age=0; Path=/`
    }
    ;(window as unknown as Record<string, unknown>).__mosCloak = undefined
})

describe('onLog structured trace', () => {
    it('emits start → success → cloak:revealed with latency and applied counts', async () => {
        document.body.innerHTML = '<div id="s">x</div>'
        const events: MOSLogEvent[] = []
        const mos = createMOS({
            ...base,
            onLog: (e) => events.push(e),
            fetchImpl: okFetch(decision({ k: { metadata: { cssSelector: '#s' }, content: { append: [{ type: 'text', content: '!' }] } } })),
        })
        await mos.decide()

        expect(codes(events)).toEqual(expect.arrayContaining(['decision:start', 'decision:success', 'cloak:revealed']))
        const success = events.find((e) => e.code === 'decision:success')!
        expect(success.level).toBe('info')
        expect(typeof success.context?.latencyMs).toBe('number')
        expect(success.context?.applied).toMatchObject({ components: 1, elements: 1 })
    })

    it('never logs the JWT — only the identity discriminant', async () => {
        const events: MOSLogEvent[] = []
        const mos = createMOS({
            ...base,
            identity: { jwtGlobal: () => 'SECRET.JWT.VALUE' },
            onLog: (e) => events.push(e),
            fetchImpl: okFetch(decision()),
        })
        await mos.decide()
        const start = events.find((e) => e.code === 'decision:start')!
        expect(start.context?.identity).toBe('userJwt')
        expect(JSON.stringify(events)).not.toContain('SECRET.JWT.VALUE')
    })

    it('emits decision:error on a failed decision', async () => {
        const events: MOSLogEvent[] = []
        const failing = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
        const mos = createMOS({ ...base, onLog: (e) => events.push(e), fetchImpl: failing })
        await mos.decide()
        const err = events.find((e) => e.code === 'decision:error')!
        expect(err.level).toBe('warn')
        expect(err.context?.status).toBe(500)
    })

    it('emits decision:timeout when the cloak mask expires before the decision returns', async () => {
        const events: MOSLogEvent[] = []
        const hanging = (() => new Promise<Response>(() => {})) as unknown as typeof fetch // never resolves
        const mos = createMOS({ ...base, decisionTimeoutMs: 20, onLog: (e) => events.push(e), fetchImpl: hanging })
        void mos.decide() // never resolves; decision:timeout is a side effect of the mask expiring
        await vi.waitFor(() => expect(codes(events)).toContain('decision:timeout'))
    })

    it('routes a throwing reveal transform to onLog (previously silent) without breaking reveal', async () => {
        const events: MOSLogEvent[] = []
        const mos = createMOS({
            ...base,
            revealTransforms: [
                () => {
                    throw new Error('decrypt boom')
                },
            ],
            onLog: (e) => events.push(e),
            fetchImpl: okFetch(decision()),
        })
        await mos.decide()
        const transformErr = events.find((e) => e.code === 'reveal:transform-error')!
        expect(transformErr.level).toBe('warn')
        // The default reveal still ran after the throwing transform.
        expect(codes(events)).toContain('cloak:revealed')
    })

    it('does not require onLog (no-op when absent)', async () => {
        const mos = createMOS({ ...base, fetchImpl: okFetch(decision()) })
        await expect(mos.decide()).resolves.toMatchObject({ ok: true })
    })
})

describe('consoleLogger', () => {
    it('maps level to the matching console method', () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const logger = createConsoleLogger()
        logger({ level: 'debug', code: 'a', message: 'm' })
        logger({ level: 'warn', code: 'b', message: 'm', context: { x: 1 } })
        expect(debug).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith('[mos] b: m', { x: 1 })
        debug.mockRestore()
        warn.mockRestore()
    })

    it('filters below the configured minimum level', () => {
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        const logger = createConsoleLogger({ level: 'error', prefix: '[x]' })
        logger({ level: 'debug', code: 'a', message: 'm' })
        logger({ level: 'error', code: 'b', message: 'm' })
        expect(debug).not.toHaveBeenCalled()
        expect(error).toHaveBeenCalledWith('[x] b: m')
        debug.mockRestore()
        error.mockRestore()
    })
})
