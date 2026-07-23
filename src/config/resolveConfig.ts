import { getWindow } from '../env'
import { readScriptAttributes } from './readScriptAttributes'
import { DEFAULT_API_BASE_URL, DEFAULT_DECISION_TIMEOUT_MS, type MOSClientConfig, type MOSLogger, type ResolvedConfig } from './types'

const readWindowConfig = (): Partial<MOSClientConfig> => {
    const win = getWindow() as (Window & { MOSConfig?: Partial<MOSClientConfig> }) | undefined
    const cfg = win?.MOSConfig
    return cfg && typeof cfg === 'object' ? cfg : {}
}

/**
 * Resolve config with this precedence: explicit `createMOS(config)` args > `window.MOSConfig`
 * > `data-mos-*` attributes. Applies defaults to produce a {@link ResolvedConfig}. Never throws —
 * missing required fields (publicKey/surface) are validated later so importing stays SSR-safe.
 * `onLog` receives resolution warnings (e.g. a dropped invalid attribute); it can't be read off the
 * config being resolved here, so the caller supplies it.
 */
export const resolveConfig = (explicit: Partial<MOSClientConfig> = {}, onLog?: MOSLogger): ResolvedConfig => {
    const attributes = readScriptAttributes(onLog)
    const global = readWindowConfig()
    const merged: Partial<MOSClientConfig> = { ...attributes, ...global, ...explicit }

    // `publishableKey` is the deprecated v1 alias for `publicKey`. Resolve the key per source rather
    // than off `merged`, so source precedence stays intact (an explicit `publishableKey` still beats
    // a `data-mos-pk` attribute); within one source the new name wins.
    const keyOf = (cfg: Partial<MOSClientConfig>): string | undefined => cfg.publicKey ?? cfg.publishableKey

    // `cloak.timeoutMs` doubles as the cloak-reveal max-wait when `decisionTimeoutMs` isn't set.
    const cloakTimeout = typeof merged.cloak === 'object' && merged.cloak !== null ? merged.cloak.timeoutMs : undefined

    return {
        publicKey: keyOf(explicit) ?? keyOf(global) ?? keyOf(attributes) ?? '',
        surface: merged.surface ?? '',
        apiBaseUrl: merged.apiBaseUrl ?? DEFAULT_API_BASE_URL,
        manual: merged.manual ?? false,
        decisionTimeoutMs: merged.decisionTimeoutMs ?? cloakTimeout ?? DEFAULT_DECISION_TIMEOUT_MS,
        identity: merged.identity ?? {},
        render: merged.render ?? {},
        resourceProvider: merged.resourceProvider,
        revealTransforms: merged.revealTransforms ?? [],
        fetchImpl: merged.fetchImpl,
        onReady: merged.onReady,
        onDecision: merged.onDecision,
        onError: merged.onError,
        onWarn: merged.onWarn,
        onLog: merged.onLog,
    }
}
