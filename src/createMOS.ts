import type { Resource, SurfaceDecisionResponse } from '@monetizationos/proxy'
import { defaultRevealTransform, type RevealReason, runRevealPipeline } from './cloak/revealPipeline'
import { resolveConfig } from './config/resolveConfig'
import type { MOSClientConfig, MOSLogEvent, MOSLogLevel, ResolvedConfig } from './config/types'
import { buildResource } from './decision/buildResource'
import { type DirectiveHandler, dispatchDirectives } from './decision/dispatch'
import { type DecisionResult, fetchDecision } from './decision/fetchDecision'
import { getDocument, getWindow, isBrowser } from './env'
import { componentBehaviorsHandler } from './handlers/componentBehaviorsHandler'
import { persistAnonymousIdentifier, resolveIdentity, resolveStore } from './identity/resolveIdentity'
import type { ExplicitIdentity, Identity } from './identity/types'
import { asError, now } from './internal'

/** The public client instance. Methods are safe to call before/outside a browser (no-op). */
export interface MOSClient {
    /** Set an explicit identity (highest-precedence source). Optional; otherwise anonymous. */
    identify(value: ExplicitIdentity): void
    /**
     * Run a live surface decision and apply it. Auto-fires once on load unless `manual`.
     *
     * Re-calling is only safe when the DOM regions the surface targets have been freshly
     * re-rendered since the last decision: insertions are not idempotent and removed content is
     * never restored, so a second decision over an already-transformed DOM duplicates inserts.
     */
    decide(resource?: Partial<Resource> & Record<string, unknown>): Promise<DecisionResult | undefined>
    /** Manually reveal cloaked regions (rarely needed; reveal is automatic). */
    reveal(): void
    /** The resolved configuration, for inspection. */
    readonly config: ResolvedConfig
}

// v1 dispatch registry. New block handlers (browser-control, counter-instruction, decrypt) append here.
const HANDLERS: DirectiveHandler[] = [componentBehaviorsHandler]

/** Invoke a host callback, swallowing any error it throws — host callbacks are never fatal. */
const emit = <T>(fn: ((value: T) => void) | undefined, value: T): void => {
    try {
        fn?.(value)
    } catch {
        /* never fatal */
    }
}

/** The identity discriminant for tracing — never the token value itself. */
const identityKind = (id: Identity): string =>
    'userJwt' in id ? 'userJwt' : 'anonymousIdentifier' in id ? 'anonymousIdentifier' : 'createAnonymousIdentifier'

/**
 * Create a MonetizationOS browser client. One core, used by both the ESM
 * `createMOS` export and the IIFE script-tag bootstrap.
 *
 * Per page view: resolve identity → build resource → call `surface-decisions` with the public
 * key → dispatch each understood directive block → reveal cloaked regions (on success, error, or
 * timeout) → expose the full decision to host callbacks. Fail-open throughout.
 */
export const createMOS = (input: Partial<MOSClientConfig> = {}): MOSClient => {
    // Resolution warnings surface through `onLog`, which is itself part of the config being
    // resolved — so buffer them and replay once the resolved config (and its logger) exists.
    const resolutionEvents: MOSLogEvent[] = []
    const config = resolveConfig(input, (event) => resolutionEvents.push(event))
    let explicit: ExplicitIdentity | undefined

    const store = resolveStore(config.identity)

    const log = (level: MOSLogLevel, code: string, message: string, context?: Record<string, unknown>): void =>
        emit(config.onLog, { level, code, message, context })

    for (const event of resolutionEvents) emit(config.onLog, event)

    const revealNow = (reason: RevealReason, decision?: SurfaceDecisionResponse): void => {
        const win = getWindow()
        const doc = getDocument()
        if (!win || !doc) return
        void runRevealPipeline([...config.revealTransforms, defaultRevealTransform], {
            win,
            doc,
            reason,
            decision,
            onTransformError: (error) =>
                log('warn', 'reveal:transform-error', 'A reveal transform threw; continuing.', { error: String(error) }),
        })
        log('debug', 'cloak:revealed', `Cloak revealed (${reason}).`, { reason })
    }

    const decide: MOSClient['decide'] = async (resourceArg) => {
        const doc = getDocument()
        const win = getWindow()
        if (!doc || !win) return undefined // SSR / non-browser: no-op.

        if (!config.publicKey || !config.surface) {
            const error = new Error('@monetizationos/browser: `publicKey` and `surface` are required.')
            log('error', 'config:invalid', error.message)
            emit(config.onError, error)
            revealNow('error')
            return { ok: false, reason: 'request-failed', error }
        }

        const startedAt = now()
        const latency = (): number => Math.round(now() - startedAt)

        // Reveal happens exactly once — on whichever comes first: the decision resolving, or the
        // cloak mask expiring. revealCloak is itself idempotent, so this guard exists only to avoid
        // re-running the reveal transform pipeline (and double-logging) the second time around.
        let revealed = false
        const revealOnce = (reason: RevealReason, decision?: SurfaceDecisionResponse): void => {
            if (revealed) return
            revealed = true
            revealNow(reason, decision)
        }

        // The cloak masks only *fast* decisions. If the mask expires first, lift it — the page may
        // FOUC (e.g. flash the full article before a paywall) — but do NOT abort the request: a slow
        // decision still applies when it lands. onError fires so hosts can observe the slow request;
        // it may fire again if that same request ultimately fails.
        const timer = setTimeout(() => {
            log('warn', 'decision:timeout', `Decision exceeded ${config.decisionTimeoutMs}ms; cloak revealed, decision still pending.`, {
                timeoutMs: config.decisionTimeoutMs,
            })
            emit(
                config.onError,
                new Error(`@monetizationos/browser: decision exceeded ${config.decisionTimeoutMs}ms; cloak revealed early`),
            )
            revealOnce('timeout')
        }, config.decisionTimeoutMs)

        try {
            const identity = await resolveIdentity({ explicit, config: config.identity, store })
            const resource = buildResource({ override: resourceArg, provider: config.resourceProvider })
            log('debug', 'decision:start', 'Surface decision started.', {
                surface: config.surface,
                resourceId: resource.id,
                identity: identityKind(identity),
            })

            const result = await fetchDecision({
                apiBaseUrl: config.apiBaseUrl,
                publicKey: config.publicKey,
                surfaceSlug: config.surface,
                identity,
                resource,
                fetchImpl: config.fetchImpl,
            })

            clearTimeout(timer) // decision is here; stop the mask timer (no-op if it already fired)

            if (!result.ok) {
                log('warn', 'decision:error', `Decision failed (${result.reason}).`, {
                    reason: result.reason,
                    status: result.status,
                    latencyMs: latency(),
                })
                emit(config.onError, result.error)
                revealOnce('error')
                return result
            }

            const decision = result.data
            // Persisting the anon id is best-effort: a failing (custom, async) store must never
            // abort an otherwise-successful decision, so swallow any rejection and carry on.
            try {
                await persistAnonymousIdentifier(store, decision)
            } catch (error) {
                log('warn', 'identity:persist-failed', 'Persisting the anonymous identifier failed; continuing.', {
                    error: String(error),
                })
            }

            // The decision request needs no DOM — only applying it does. When the SDK loads while the
            // page is still parsing (a cached/preloaded bundle), the fetch above has already run
            // concurrently with that parse; wait for the DOM here, right before we touch it.
            await whenDomReady(doc)

            const report = dispatchDirectives(HANDLERS, {
                doc,
                decision,
                render: config.render,
                onWarn: (info) => emit(config.onWarn, info),
            })

            const applied = report.componentBehaviors?.detail as
                | { appliedComponents?: number; appliedElements?: number; skipped?: string[] }
                | undefined
            log('info', 'decision:success', 'Decision applied.', {
                latencyMs: latency(),
                isAuthenticated: decision.identity?.isAuthenticated,
                applied: applied && {
                    components: applied.appliedComponents,
                    elements: applied.appliedElements,
                    skipped: applied.skipped?.length,
                },
            })
            emit(config.onDecision, decision)
            revealOnce('success', decision)
            return result
        } catch (error) {
            clearTimeout(timer)
            const err = asError(error)
            log('error', 'decision:error', 'Decision threw.', { latencyMs: latency(), error: err.message })
            emit(config.onError, err)
            revealOnce('error')
            return { ok: false, reason: 'request-failed', error: err }
        }
    }

    const client: MOSClient = {
        config,
        identify(value) {
            explicit = value
        },
        decide,
        reveal() {
            revealNow('success')
        },
    }

    // onReady fires once the instance exists, on a microtask so handlers attach first.
    if (isBrowser()) {
        queueMicrotask(() => emit(config.onReady, undefined))

        // Auto-fire exactly one decision per page view, unless manual. Start the request now — it
        // needs no DOM, so it runs concurrently with HTML parsing when the SDK loads mid-parse;
        // decide() awaits DOMContentLoaded internally before applying the result. createMOS runs once
        // per client, so this fires at most once; no re-entrancy guard is needed.
        if (!config.manual) {
            queueMicrotask(() => {
                void decide()
            })
        }
    }

    return client
}

/** Resolve once the DOM is safe to mutate — immediately, unless the document is still parsing. */
const whenDomReady = (doc: Document): Promise<void> =>
    doc.readyState === 'loading'
        ? new Promise<void>((resolve) => {
              doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
          })
        : Promise.resolve()
