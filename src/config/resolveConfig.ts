import { getWindow } from '../env'
import { readScriptAttributes } from './readScriptAttributes'
import { DEFAULT_API_BASE_URL, DEFAULT_DECISION_TIMEOUT_MS, type MOSClientConfig, type ResolvedConfig } from './types'

const readWindowConfig = (): Partial<MOSClientConfig> => {
    const win = getWindow() as (Window & { MOSConfig?: Partial<MOSClientConfig> }) | undefined
    const cfg = win?.MOSConfig
    return cfg && typeof cfg === 'object' ? cfg : {}
}

/**
 * Resolve config with this precedence: explicit `createMOS(config)` args > `window.MOSConfig`
 * > `data-mos-*` attributes. Applies defaults to produce a {@link ResolvedConfig}. Never throws —
 * missing required fields (publishableKey/surface) are validated later so importing stays SSR-safe.
 */
export const resolveConfig = (explicit: Partial<MOSClientConfig> = {}): ResolvedConfig => {
    const merged: Partial<MOSClientConfig> = { ...readScriptAttributes(), ...readWindowConfig(), ...explicit }

    // `cloak.timeoutMs` doubles as the cloak-reveal max-wait when `decisionTimeoutMs` isn't set.
    const cloakTimeout = typeof merged.cloak === 'object' && merged.cloak !== null ? merged.cloak.timeoutMs : undefined

    return {
        publishableKey: merged.publishableKey ?? '',
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
