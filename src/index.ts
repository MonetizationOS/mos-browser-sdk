// Public ESM entry. One core; the IIFE script-tag build wraps the same `createMOS`.

// Contract types re-exported from the proxy; tsdown inlines them into the emitted .d.ts so consumers
// don't need the proxy installed to use them.
export type {
    Feature,
    Resource,
    SubSurfaceBehaviorApi,
    SubSurfaceMetadataApi,
    SurfaceBehaviorApi,
    SurfaceDecisionResponse,
    WebComponentRangeReplacement,
    WebContentSurfaceBehavior,
    WebElement,
} from '@monetizationos/proxy'
export { type ApplyComponentBehaviorsResult, applyComponentBehaviors } from './applicator/applyComponentBehaviors'
export { applyContentBehavior } from './applicator/applyContentBehavior'
export { buildFragment, buildNodes } from './applicator/buildNodes'
export { applyReplaceRange } from './applicator/replaceRange'
export {
    defaultRevealTransform,
    type RevealContext,
    type RevealReason,
    type RevealTransform,
    runRevealPipeline,
} from './cloak/revealPipeline'
export {
    buildCloakSnippet,
    CLOAK_GLOBAL,
    CLOAK_STYLE_ID,
    type CloakHandle,
    type CloakSnippetOptions,
    DEFAULT_CLOAK_SELECTOR,
    DEFAULT_CLOAK_TIMEOUT_MS,
    installCloak,
    revealCloak,
} from './cloak/snippet'
export {
    type CloakConfig,
    DEFAULT_API_BASE_URL,
    DEFAULT_DECISION_TIMEOUT_MS,
    type MOSClientConfig,
    type MOSLogEvent,
    type MOSLogger,
    type MOSLogLevel,
    type MOSWarning,
    type ResolvedConfig,
} from './config/types'
export { createMOS, type MOSClient } from './createMOS'
export { buildResource, type ResourceProviderFn, readPageMetadata } from './decision/buildResource'
export { type DirectiveContext, type DirectiveHandler, type DirectiveResult, dispatchDirectives } from './decision/dispatch'
export {
    type DecisionFailureReason,
    type DecisionResult,
    type FetchImpl,
    fetchDecision,
    SURFACE_DECISIONS_PATH,
} from './decision/fetchDecision'
export { isSurfaceDecisionError, isSurfaceDecisionResponse } from './decision/guards'
export { componentBehaviorsHandler } from './handlers/componentBehaviorsHandler'
export { createCookieStore, createDefaultStore, createLocalStorageStore, DEFAULT_STORE_KEY, readCookie } from './identity/stores'
export type { ExplicitIdentity, Identity, IdentityConfig, IdentityStore, JwtGlobalSource } from './identity/types'
export {
    DEFAULT_SDK_SRC,
    MOS_GLOBAL,
    MOS_QUEUE_KEY,
    MOS_QUEUE_METHODS,
    MOS_SDK_SCRIPT_ID,
} from './loader/constants'
export { buildLoaderSnippet, type LoaderSnippetOptions } from './loader/snippet'
export { type ConsoleLoggerOptions, consoleLogger, createConsoleLogger } from './logger'
export { type CustomElementRenderer, type RenderElementOptions, type RenderedElement, renderElement } from './render/renderElement'
export { BROWSER_PACKAGE_VERSION, BROWSER_PACKAGE_VERSION_HEADER } from './version'
