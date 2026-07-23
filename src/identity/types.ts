import type { Identity } from '@monetizationos/proxy'

export type { Identity }

/**
 * Pluggable anonymous-identifier persistence. The SDK owns anon-id persistence client-side
 * and must NOT rely on the proxy's MOS-domain `Set-Cookie`, which won't land as a usable first-party
 * cookie on the customer origin. `get`/`set` may be sync or async.
 */
export interface IdentityStore {
    get(): string | undefined | Promise<string | undefined>
    set(value: string): void | Promise<void>
}

/** A token thunk (ESM form) read fresh at each `decide()`, or a dotted `window` path (script-tag form). */
export type JwtGlobalSource = string | (() => string | null | undefined | Promise<string | null | undefined>)

/**
 * Declarative identity configuration. Configure at most one declarative source at a time.
 * Both read identity from client-side runtime state the host already holds, synchronously.
 */
export interface IdentityConfig {
    /**
     * Read a JWT off `window`. Preferred for SPAs. Accepts a dotted-path string (`'provider.jwt'`,
     * zero-JS script-tag form) or a getter thunk (`() => authClient.getToken()`, ESM form) so the
     * current value is read at each `decide()` rather than a stale first-paint snapshot.
     */
    jwtGlobal?: JwtGlobalSource
    /**
     * Read the named cookie via `document.cookie`. Valid only for non-HttpOnly cookies — carries an
     * XSS-exposure caveat (documented in the README).
     */
    jwtCookie?: string
    /** Custom anon-id store. Defaults to localStorage with a first-party-cookie fallback. */
    store?: IdentityStore
    /**
     * Forces a single built-in store when `store` is not provided: plain `localStorage`, or a
     * first-party cookie. When unset, the default combined store applies — `localStorage` with a
     * first-party cookie fallback, writing to both.
     */
    storeKind?: 'localStorage' | 'cookie'
    /** Storage key / cookie name for the persisted anonymous identifier. Default `'mos_anon_id'`. */
    storeKey?: string
    /**
     * When a JWT is presented, also send `createAnonymousIdentifierFallback: true` so the server mints
     * an anonymous identifier if the JWT turns out to be unauthenticated. Default `true`.
     */
    createAnonymousIdentifierFallback?: boolean
}

/** An explicit identity supplied via `mos.identify(...)` — the highest-precedence source. */
export type ExplicitIdentity = { userJwt: string }
