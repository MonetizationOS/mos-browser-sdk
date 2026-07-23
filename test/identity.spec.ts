import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { beforeEach, describe, expect, it } from 'vitest'
import { readDeclarativeToken, readJwtFromGlobal } from '../src/identity/declarativeSources'
import { persistAnonymousIdentifier, resolveIdentity, resolveStore } from '../src/identity/resolveIdentity'
import { createCookieStore, createLocalStorageStore } from '../src/identity/stores'
import type { IdentityStore } from '../src/identity/types'

beforeEach(() => {
    localStorage.clear()
    // Clear cookies
    for (const c of document.cookie.split(';')) {
        const name = c.split('=')[0]?.trim()
        if (name) document.cookie = `${name}=; Max-Age=0; Path=/`
    }
})

const memStore = (initial?: string): IdentityStore => {
    let v = initial
    return {
        get: () => v,
        set: (x) => {
            v = x
        },
    }
}

const decision = (over: Partial<SurfaceDecisionResponse['identity']>): SurfaceDecisionResponse =>
    ({
        identity: { identifier: 'anon-123', isAuthenticated: false, authType: 'anonymous', jwtClaims: {}, ...over },
    }) as SurfaceDecisionResponse

describe('stores', () => {
    it('localStorage store round-trips', async () => {
        const s = createLocalStorageStore('k1')
        await s.set('abc')
        expect(await s.get()).toBe('abc')
    })

    it('cookie store round-trips a readable first-party cookie', async () => {
        const s = createCookieStore('k2')
        await s.set('def')
        expect(await s.get()).toBe('def')
        expect(document.cookie).toContain('k2=def')
    })

    it('cookie store returns undefined for a malformed percent-encoded value (never throws)', () => {
        document.cookie = 'k3=%; Path=/' // a lone % is invalid percent-encoding → decodeURIComponent throws
        const s = createCookieStore('k3')
        expect(() => s.get()).not.toThrow()
        expect(s.get()).toBeUndefined()
    })
})

describe('declarative sources', () => {
    it('reads a JWT from a dotted window path', async () => {
        ;(window as unknown as Record<string, unknown>).provider = { jwt: 'TOK' }
        expect(await readJwtFromGlobal('provider.jwt')).toBe('TOK')
        ;(window as unknown as Record<string, unknown>).provider = undefined
    })

    it('reads a JWT from a getter thunk, fresh each call', async () => {
        let token = 'first'
        const thunk = () => token
        expect(await readJwtFromGlobal(thunk)).toBe('first')
        token = 'second'
        expect(await readJwtFromGlobal(thunk)).toBe('second')
    })

    it('a throwing thunk falls through to undefined (fail-open)', async () => {
        expect(
            await readJwtFromGlobal(() => {
                throw new Error('boom')
            }),
        ).toBeUndefined()
    })

    it('prefers jwtGlobal when both are configured', async () => {
        ;(window as unknown as Record<string, unknown>).g = { jwt: 'GLOBAL' }
        document.cookie = 'ck=COOKIE; Path=/'
        expect(await readDeclarativeToken({ jwtGlobal: 'g.jwt', jwtCookie: 'ck' })).toBe('GLOBAL')
        ;(window as unknown as Record<string, unknown>).g = undefined
    })

    it('reads a JWT from a cookie', async () => {
        document.cookie = 'authtok=ABC; Path=/'
        expect(await readDeclarativeToken({ jwtCookie: 'authtok' })).toBe('ABC')
    })
})

describe('resolveIdentity — precedence order', () => {
    it('1) explicit identify() wins', async () => {
        const id = await resolveIdentity({
            explicit: { userJwt: 'EXPLICIT' },
            config: { jwtGlobal: () => 'DECL' },
            store: memStore('anon'),
        })
        expect(id).toEqual({ userJwt: 'EXPLICIT', createAnonymousIdentifierFallback: true })
    })

    it('2) declarative source when no explicit', async () => {
        const id = await resolveIdentity({ config: { jwtGlobal: () => 'DECL' }, store: memStore('anon') })
        expect(id).toEqual({ userJwt: 'DECL', createAnonymousIdentifierFallback: true })
    })

    it('omits the fallback flag when disabled', async () => {
        const id = await resolveIdentity({
            explicit: { userJwt: 'T' },
            config: { createAnonymousIdentifierFallback: false },
            store: memStore(),
        })
        expect(id).toEqual({ userJwt: 'T' })
    })

    it('3a) persisted anonymous id when no token', async () => {
        const id = await resolveIdentity({ config: {}, store: memStore('anon-xyz') })
        expect(id).toEqual({ anonymousIdentifier: 'anon-xyz' })
    })

    it('3b) createAnonymousIdentifier when nothing persisted', async () => {
        const id = await resolveIdentity({ config: {}, store: memStore() })
        expect(id).toEqual({ createAnonymousIdentifier: true })
    })
})

describe('persistAnonymousIdentifier', () => {
    it('persists the returned identifier when unauthenticated', async () => {
        const store = memStore()
        await persistAnonymousIdentifier(store, decision({ isAuthenticated: false, identifier: 'anon-9' }))
        expect(await store.get()).toBe('anon-9')
    })

    it('does not persist when authenticated', async () => {
        const store = memStore()
        await persistAnonymousIdentifier(store, decision({ isAuthenticated: true, identifier: 'user-1' }))
        expect(await store.get()).toBeUndefined()
    })
})

describe('resolveStore', () => {
    it('returns a custom store as-is', () => {
        const custom = memStore()
        expect(resolveStore({ store: custom })).toBe(custom)
    })
    it('honors storeKind: cookie', async () => {
        const s = resolveStore({ storeKind: 'cookie', storeKey: 'kk' })
        await s.set('v')
        expect(document.cookie).toContain('kk=v')
    })
})
