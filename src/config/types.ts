import type { SurfaceDecisionResponse } from '@monetizationos/proxy'
import type { RevealTransform } from '../cloak/revealPipeline'
import type { ResourceProviderFn } from '../decision/buildResource'
import type { FetchImpl } from '../decision/fetchDecision'
import type { IdentityConfig } from '../identity/types'
import type { RenderElementOptions } from '../render/renderElement'

export const DEFAULT_API_BASE_URL = 'https://api.monetizationos.com'
export const DEFAULT_DECISION_TIMEOUT_MS = 5000

/** Non-fatal observability event (invalid selector, missing marker, unsupported element, etc.). */
export interface MOSWarning {
    code: string
    message: string
    componentKey?: string
}

export type MOSLogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * A structured trace event (telemetry). Emitted to {@link MOSClientConfig.onLog}. The SDK
 * itself never writes to `console`; pipe these to your own logger (or use the bundled `consoleLogger`).
 */
export interface MOSLogEvent {
    level: MOSLogLevel
    /** Stable event code, e.g. `decision:start`, `decision:success`, `decision:timeout`. */
    code: string
    message: string
    /** Extra structured fields (latency, applied counts, reason). Never includes secrets/JWTs. */
    context?: Record<string, unknown>
}

export type MOSLogger = (event: MOSLogEvent) => void

/**
 * Cloak configuration. The SDK itself only consumes `timeoutMs` (the cloak-reveal max-wait); the
 * actual hiding is done by the synchronous inline snippet (see `buildCloakSnippet`), which is where
 * `selectors` apply. The shared shape lets one object feed both.
 */
export type CloakConfig = boolean | { timeoutMs?: number; selectors?: string[] }

export interface MOSClientConfig {
    /** Public key (`pk_*`). Safe to ship in page source. Required. */
    publicKey: string
    /** @deprecated Renamed to `publicKey`, which wins when both are set. This alias will be removed in a later release. */
    publishableKey?: string
    /** Surface slug (the `surface`), sent as `surfaceSlug`. Required. */
    surface: string
    /** MOS API base URL. Default `https://api.monetizationos.com`. */
    apiBaseUrl?: string
    /** Disable the auto-init fire on load for full host control. Default `false`. */
    manual?: boolean
    /** Cloak/anti-flicker behaviour and reveal timeout. */
    cloak?: CloakConfig
    /**
     * How long the cloak mask stays up while awaiting the decision. On expiry the cloak reveals (the
     * page may FOUC — e.g. flash the full article before a paywall), but the request is NOT aborted:
     * a slow decision still applies when it lands. Default 5000ms.
     */
    decisionTimeoutMs?: number
    /** Declarative identity configuration. */
    identity?: IdentityConfig
    /** Element render options — `custom` renderer hook, unsupported-element callback. */
    render?: RenderElementOptions
    /** Resource-provider hook merged over derived `{ id, meta }` defaults. */
    resourceProvider?: ResourceProviderFn
    /** Extra reveal transforms inserted before the default reveal (the decrypt-transform seam). */
    revealTransforms?: RevealTransform[]
    /**
     * Bring your own `fetch` — wrap auth, base-URL/transport, retries, or mock it in tests. Receives
     * the standard `(input, init)` signature. Defaults to the global `fetch`.
     */
    fetchImpl?: FetchImpl

    /** Called once the SDK is initialized and ready. */
    onReady?: () => void
    /** Called with the full decision: features, properties, identity. */
    onDecision?: (decision: SurfaceDecisionResponse) => void
    /** Called on any decision failure, for host observability. */
    onError?: (error: Error) => void
    /** Called for non-fatal warnings (invalid selector, missing marker). */
    onWarn?: (warning: MOSWarning) => void
    /**
     * Structured lifecycle/telemetry trace (decision latency, applied counts, timeout & reveal
     * events). Off unless provided. The SDK never writes to `console` — pipe events to your own
     * logger, or pass the bundled `consoleLogger`.
     */
    onLog?: MOSLogger
}

/** Config after precedence resolution and defaulting — what the runtime actually uses. */
export interface ResolvedConfig {
    publicKey: string
    surface: string
    apiBaseUrl: string
    manual: boolean
    decisionTimeoutMs: number
    identity: IdentityConfig
    render: RenderElementOptions
    resourceProvider?: ResourceProviderFn
    revealTransforms: RevealTransform[]
    fetchImpl?: FetchImpl
    onReady?: () => void
    onDecision?: (decision: SurfaceDecisionResponse) => void
    onError?: (error: Error) => void
    onWarn?: (warning: MOSWarning) => void
    onLog?: MOSLogger
}
