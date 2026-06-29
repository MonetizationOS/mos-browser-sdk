import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readScriptAttributes } from '../src/config/readScriptAttributes'
import { resolveConfig } from '../src/config/resolveConfig'
import { DEFAULT_API_BASE_URL, DEFAULT_DECISION_TIMEOUT_MS } from '../src/config/types'

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
        const c = resolveConfig({ publishableKey: 'pk_1', surface: 's' })
        expect(c.apiBaseUrl).toBe(DEFAULT_API_BASE_URL)
        expect(c.manual).toBe(false)
        expect(c.decisionTimeoutMs).toBe(DEFAULT_DECISION_TIMEOUT_MS)
    })

    it('cloak.timeoutMs feeds the decision/reveal timeout', () => {
        const c = resolveConfig({ publishableKey: 'pk', surface: 's', cloak: { timeoutMs: 2500 } })
        expect(c.decisionTimeoutMs).toBe(2500)
    })

    it('cloak: true falls back to the default timeout', () => {
        const c = resolveConfig({ publishableKey: 'pk', surface: 's', cloak: true })
        expect(c.decisionTimeoutMs).toBe(DEFAULT_DECISION_TIMEOUT_MS)
    })
})

describe('config precedence: createMOS args > window.MOSConfig > data-mos-*', () => {
    it('explicit args beat window.MOSConfig beat attributes', () => {
        document.head.innerHTML =
            '<script data-mos-pk="pk_attr" data-mos-surface="surf_attr" data-mos-api-base-url="https://attr.example"></script>'
        win.MOSConfig = { surface: 'surf_global', apiBaseUrl: 'https://global.example' }
        const c = resolveConfig({ surface: 'surf_explicit' })
        expect(c.publishableKey).toBe('pk_attr') // only in attributes
        expect(c.apiBaseUrl).toBe('https://global.example') // global beats attr
        expect(c.surface).toBe('surf_explicit') // explicit beats global
    })
})

describe('readScriptAttributes', () => {
    it('parses data-mos-* attributes including booleans and identity', () => {
        document.head.innerHTML =
            '<script data-mos-pk="pk_x" data-mos-surface="s" data-mos-manual="true" data-mos-jwt-global="provider.jwt" data-mos-timeout="1234"></script>'
        const c = readScriptAttributes()
        expect(c.publishableKey).toBe('pk_x')
        expect(c.surface).toBe('s')
        expect(c.manual).toBe(true)
        expect(c.identity).toEqual({ jwtGlobal: 'provider.jwt' })
        expect(c.decisionTimeoutMs).toBe(1234)
    })

    it('jwtCookie maps to identity.jwtCookie', () => {
        document.head.innerHTML = '<script data-mos-pk="pk" data-mos-surface="s" data-mos-jwt-cookie="tok"></script>'
        expect(readScriptAttributes().identity).toEqual({ jwtCookie: 'tok' })
    })

    it('ignores a blank, whitespace, or non-positive data-mos-timeout', () => {
        for (const bad of ['', '   ', '0', '-5', 'abc']) {
            document.head.innerHTML = `<script data-mos-pk="pk" data-mos-surface="s" data-mos-timeout="${bad}"></script>`
            expect(readScriptAttributes().decisionTimeoutMs).toBeUndefined()
        }
    })

    it('data-mos-cloak enables cloak; data-mos-cloak-selectors sets the list', () => {
        document.head.innerHTML = '<script data-mos-pk="pk" data-mos-surface="s" data-mos-cloak-selectors=".a, .b"></script>'
        expect(readScriptAttributes().cloak).toEqual({ selectors: ['.a', '.b'] })
    })
})
