import { getDocument } from '../env'
import type { MOSClientConfig } from './types'

/**
 * Read `data-mos-*` config off the SDK's own `<script>` tag. Prefers `document.currentScript`
 * (correct during the IIFE bundle's synchronous execution), falling back to the first script carrying
 * a `data-mos-pk`. Returns a partial config; absent attributes are simply omitted.
 */
export const readScriptAttributes = (): Partial<MOSClientConfig> => {
    const doc = getDocument()
    if (!doc) return {}

    const script = (doc.currentScript as HTMLScriptElement | null) ?? doc.querySelector<HTMLScriptElement>('script[data-mos-pk]')
    if (!script) return {}

    const get = (name: string): string | undefined => script.getAttribute(name) ?? undefined
    const getBool = (name: string): boolean | undefined => {
        const raw = get(name)
        if (raw === undefined) return undefined
        return raw !== 'false' && raw !== '0'
    }

    const config: Partial<MOSClientConfig> = {}
    const pk = get('data-mos-pk')
    if (pk) config.publishableKey = pk
    const surface = get('data-mos-surface')
    if (surface) config.surface = surface
    const apiBaseUrl = get('data-mos-api-base-url')
    if (apiBaseUrl) config.apiBaseUrl = apiBaseUrl

    const manual = getBool('data-mos-manual')
    if (manual !== undefined) config.manual = manual

    const timeout = get('data-mos-timeout') ?? get('data-mos-cloak-timeout')
    if (timeout !== undefined) {
        // Number('') and Number('   ') are both 0, so require a positive, finite value — a blank or
        // whitespace attribute must not silently set a 0ms timeout that reveals the cloak instantly.
        const ms = Number(timeout)
        if (Number.isFinite(ms) && ms > 0) config.decisionTimeoutMs = ms
    }

    const jwtGlobal = get('data-mos-jwt-global')
    const jwtCookie = get('data-mos-jwt-cookie')
    if (jwtGlobal || jwtCookie) {
        config.identity = jwtGlobal ? { jwtGlobal } : { jwtCookie: jwtCookie as string }
    }

    const cloak = get('data-mos-cloak')
    const cloakSelectors = get('data-mos-cloak-selectors')
    if (cloak !== undefined || cloakSelectors) {
        config.cloak = cloakSelectors
            ? {
                  selectors: cloakSelectors
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
              }
            : true
    }

    return config
}
