import { getWindow } from '../env'
import { readCookie } from './stores'
import type { IdentityConfig, JwtGlobalSource } from './types'

/** Resolve a dotted path (`'provider.jwt'`) off `window`, guarding each hop. Returns undefined if any hop misses. */
const readDottedPath = (path: string): unknown => {
    const win = getWindow()
    if (!win) return undefined
    let current: unknown = win
    for (const key of path.split('.')) {
        if (current == null || typeof current !== 'object') return undefined
        current = (current as Record<string, unknown>)[key]
    }
    return current
}

/** Read a JWT from a `window` dotted path or getter thunk. Thunks are read fresh each call. */
export const readJwtFromGlobal = async (source: JwtGlobalSource): Promise<string | undefined> => {
    try {
        const value = typeof source === 'function' ? await source() : readDottedPath(source)
        return typeof value === 'string' && value.length > 0 ? value : undefined
    } catch {
        // A throwing host getter must fall through to anonymous (fail-open), never crash.
        return undefined
    }
}

/** Read a JWT from a named non-HttpOnly cookie. */
export const readJwtFromCookie = (name: string): string | undefined => {
    const value = readCookie(name)
    return value && value.length > 0 ? value : undefined
}

/**
 * Read the configured declarative token (at most one source). Prefers `jwtGlobal` when both are set
 * (the preferred SPA path) and the caller is responsible for not configuring both.
 */
export const readDeclarativeToken = async (config: IdentityConfig | undefined): Promise<string | undefined> => {
    if (!config) return undefined
    if (config.jwtGlobal !== undefined) return readJwtFromGlobal(config.jwtGlobal)
    if (config.jwtCookie) return readJwtFromCookie(config.jwtCookie)
    return undefined
}
