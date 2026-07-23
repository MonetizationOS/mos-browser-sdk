import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readScriptAttributes } from '../src/config/readScriptAttributes'
import { resolveConfig } from '../src/config/resolveConfig'
import { DEFAULT_API_BASE_URL, DEFAULT_DECISION_TIMEOUT_MS, type MOSLogEvent } from '../src/config/types'
import { createMOS } from '../src/createMOS'

const win = window as unknown as Record<string, unknown>

beforeEach(() => {
    document.head.innerHTML = ''
    win.MOSConfig = undefined
})
afterEach(() => {
    win.MOSConfig = undefined
})

describe('resolveConfig defaults', () => {
    it('applies sensible defaults', () => {
        const c = resolveConfig({ publicKey: 'pk_1', surface: 's' })
        expect(c.apiBaseUrl).toBe(DEFAULT_API_BASE_URL)
        expect(c.manual).toBe(false)
        expect(c.decisionTimeoutMs).toBe(DEFAULT_DECISION_TIMEOUT_MS)
    })

    it('cloak.timeoutMs feeds the decision/reveal timeout', () => {
        const c = resolveConfig({ publicKey: 'pk', surface: 's', cloak: { timeoutMs: 2500 } })
        expect(c.decisionTimeoutMs).toBe(2500)
    })

    it('cloak: true falls back to the default timeout', () => {
        const c = resolveConfig({ publicKey: 'pk', surface: 's', cloak: true })
        expect(c.decisionTimeoutMs).toBe(DEFAULT_DECISION_TIMEOUT_MS)
    })
})

describe('publishableKey deprecated alias', () => {
    it('still resolves as publicKey', () => {
        const c = resolveConfig({ publishableKey: 'pk_old', surface: 's' })
        expect(c.publicKey).toBe('pk_old')
    })

    it('publicKey wins when both are set in one source', () => {
        const c = resolveConfig({ publicKey: 'pk_new', publishableKey: 'pk_old', surface: 's' })
        expect(c.publicKey).toBe('pk_new')
    })

    it('an explicit publishableKey still beats a lower-precedence data-mos-pk', () => {
        document.head.innerHTML = '<script data-mos-pk="pk_attr" data-mos-surface="s"></script>'
        const c = resolveConfig({ publishableKey: 'pk_explicit' })
        expect(c.publicKey).toBe('pk_explicit')
    })
})

describe('config precedence: createMOS args > window.MOSConfig > data-mos-*', () => {
    it('explicit args beat window.MOSConfig beat attributes', () => {
        document.head.innerHTML =
            '<script data-mos-pk="pk_attr" data-mos-surface="surf_attr" data-mos-api-base-url="https://attr.example"></script>'
        win.MOSConfig = { surface: 'surf_global', apiBaseUrl: 'https://global.example' }
        const c = resolveConfig({ surface: 'surf_explicit' })
        expect(c.publicKey).toBe('pk_attr') // only in attributes
        expect(c.apiBaseUrl).toBe('https://global.example') // global beats attr
        expect(c.surface).toBe('surf_explicit') // explicit beats global
    })
})

describe('readScriptAttributes', () => {
    it('parses data-mos-* attributes including booleans and identity', () => {
        document.head.innerHTML =
            '<script data-mos-pk="pk_x" data-mos-surface="s" data-mos-manual="true" data-mos-jwt-global="provider.jwt" data-mos-timeout="1234"></script>'
        const c = readScriptAttributes()
        expect(c.publicKey).toBe('pk_x')
        expect(c.surface).toBe('s')
        expect(c.manual).toBe(true)
        expect(c.identity).toEqual({ jwtGlobal: 'provider.jwt' })
        expect(c.decisionTimeoutMs).toBe(1234)
    })

    it('jwtCookie maps to identity.jwtCookie', () => {
        document.head.innerHTML = '<script data-mos-pk="pk" data-mos-surface="s" data-mos-jwt-cookie="tok"></script>'
        expect(readScriptAttributes().identity).toEqual({ jwtCookie: 'tok' })
    })

    it('ignores a blank, whitespace, or non-positive data-mos-timeout, warning via onLog', () => {
        for (const bad of ['', '   ', '0', '-5', 'abc']) {
            document.head.innerHTML = `<script data-mos-pk="pk" data-mos-surface="s" data-mos-timeout="${bad}"></script>`
            const events: MOSLogEvent[] = []
            expect(readScriptAttributes((e) => events.push(e)).decisionTimeoutMs).toBeUndefined()
            expect(events).toEqual([
                expect.objectContaining({
                    level: 'warn',
                    code: 'config:invalid-timeout',
                    context: { attribute: 'data-mos-timeout', value: bad },
                }),
            ])
        }
    })

    it('reports an invalid data-mos-cloak-timeout under its own attribute name', () => {
        document.head.innerHTML = '<script data-mos-pk="pk" data-mos-surface="s" data-mos-cloak-timeout="soon"></script>'
        const events: MOSLogEvent[] = []
        expect(readScriptAttributes((e) => events.push(e)).decisionTimeoutMs).toBeUndefined()
        expect(events[0]?.context).toEqual({ attribute: 'data-mos-cloak-timeout', value: 'soon' })
    })

    it('a valid data-mos-timeout emits no log event', () => {
        document.head.innerHTML = '<script data-mos-pk="pk" data-mos-surface="s" data-mos-timeout="1234"></script>'
        const events: MOSLogEvent[] = []
        expect(readScriptAttributes((e) => events.push(e)).decisionTimeoutMs).toBe(1234)
        expect(events).toEqual([])
    })

    it('createMOS surfaces the invalid-timeout warning through config.onLog', () => {
        document.head.innerHTML = '<script data-mos-pk="pk" data-mos-surface="s" data-mos-timeout="soon"></script>'
        const events: MOSLogEvent[] = []
        createMOS({ manual: true, onLog: (e) => events.push(e) })
        expect(events.map((e) => e.code)).toContain('config:invalid-timeout')
    })

    it('data-mos-cloak enables cloak; data-mos-cloak-selectors sets the list', () => {
        document.head.innerHTML = '<script data-mos-pk="pk" data-mos-surface="s" data-mos-cloak-selectors=".a, .b"></script>'
        expect(readScriptAttributes().cloak).toEqual({ selectors: ['.a', '.b'] })
    })
})
