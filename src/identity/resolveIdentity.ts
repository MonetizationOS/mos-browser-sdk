import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import { readDeclarativeToken } from './declarativeSources'
import { createCookieStore, createDefaultStore, createLocalStorageStore } from './stores'
import type { ExplicitIdentity, Identity, IdentityConfig, IdentityStore } from './types'

const tokenFromExplicit = (explicit: ExplicitIdentity | undefined): string | undefined => explicit?.userJwt || undefined

/** Turn a token into an {@link Identity}, attaching the anon-fallback flag unless disabled. */
const buildJwtIdentity = (userJwt: string, config: IdentityConfig | undefined): Identity =>
    config?.createAnonymousIdentifierFallback === false ? { userJwt } : { userJwt, createAnonymousIdentifierFallback: true }

/** Resolve the store from config: explicit store > storeKind > localStorage-with-cookie-fallback default. */
export const resolveStore = (config: IdentityConfig | undefined): IdentityStore => {
    if (config?.store) return config.store
    const key = config?.storeKey
    if (config?.storeKind === 'cookie') return createCookieStore(key)
    if (config?.storeKind === 'localStorage') return createLocalStorageStore(key)
    return createDefaultStore(key)
}

export interface ResolveIdentityArgs {
    explicit?: ExplicitIdentity
    config?: IdentityConfig
    store: IdentityStore
}

/**
 * Identity resolution order, highest precedence first:
 *   1. an explicit `identify()` value,
 *   2. the single configured declarative source (`jwtGlobal` / `jwtCookie`),
 *   3. anonymous — an existing persisted anon id, else `createAnonymousIdentifier`.
 *
 * A missing/expired token simply falls through to anonymous, so staleness degrades gracefully.
 */
export const resolveIdentity = async ({ explicit, config, store }: ResolveIdentityArgs): Promise<Identity> => {
    const explicitToken = tokenFromExplicit(explicit)
    if (explicitToken) return buildJwtIdentity(explicitToken, config)

    const declarativeToken = await readDeclarativeToken(config)
    if (declarativeToken) return buildJwtIdentity(declarativeToken, config)

    const anon = await store.get()
    if (anon) return { anonymousIdentifier: anon }

    return { createAnonymousIdentifier: true }
}

/**
 * Persist the anonymous identifier the server returned, so the next page load sends
 * `{ anonymousIdentifier }`. We persist whenever the resolved identity is not authenticated and an
 * identifier came back — covering both a freshly minted anon and a JWT that fell back to anonymous.
 */
export const persistAnonymousIdentifier = async (store: IdentityStore, decision: SurfaceDecisionResponse): Promise<void> => {
    const identifier = decision.identity?.identifier
    if (!identifier || decision.identity?.isAuthenticated) return
    await store.set(identifier)
}
