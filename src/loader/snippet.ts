/**
 * One-paste loader. A single synchronous `<script>` that:
 *   1. installs the stub-and-queue — so `MOS.identify()/decide()/page()/reveal()` calls made before
 *      the bundle arrives are captured, not thrown; and
 *   2. injects the async SDK bundle, carrying declarative config as `data-mos-*` attributes.
 *
 * This folds the two separate pastes (stub snippet + async `<script>` tag) into one. The bundle's
 * bootstrap ({@link ../iife}) drains the queue and replays it, so the mechanism is identical — this
 * is only a packaging convenience. Both sides share {@link ./constants} so they cannot drift.
 */
import { DEFAULT_SDK_SRC, MOS_GLOBAL, MOS_QUEUE_KEY, MOS_QUEUE_METHODS, MOS_SDK_SCRIPT_ID } from './constants'

export interface LoaderSnippetOptions {
    /** SDK bundle URL. Defaults to the hosted IIFE build ({@link DEFAULT_SDK_SRC}). */
    src?: string
    /**
     * Declarative config emitted as `data-mos-*` attributes on the injected script — keyed by the
     * attribute suffix (`{ pk, surface, 'jwt-global' }` → `data-mos-pk` etc.). **String values only**;
     * callbacks / `fetchImpl` can't ride on attributes — set `window.MOSConfig` for those.
     */
    config?: Record<string, string>
}

/**
 * Generate the synchronous inline loader (a JS string) the customer pastes inside a `<script>` in
 * `<head>`, above their page code. Values are serialized as JSON so the snippet is self-contained
 * and injection-safe. With default options the config object is the only thing worth editing.
 */
export const buildLoaderSnippet = (options?: LoaderSnippetOptions): string => {
    const src = options?.src ?? DEFAULT_SDK_SRC
    const config = options?.config ?? {}
    const G = JSON.stringify(MOS_GLOBAL)
    const Q = JSON.stringify(MOS_QUEUE_KEY)
    const M = JSON.stringify([...MOS_QUEUE_METHODS])
    const ID = JSON.stringify(MOS_SDK_SCRIPT_ID)
    const U = JSON.stringify(src)
    const C = JSON.stringify(config)
    return `/* MonetizationOS loader (queue + async SDK, one paste). Edit the config below. */
(function(c){var w=window,d=document,g=${G},q=${Q};
w[g]=w[g]||{};w[g][q]=w[g][q]||[];
${M}.forEach(function(m){w[g][m]=w[g][m]||function(){w[g][q].push([m,arguments]);};});
if(d.getElementById(${ID}))return;
var j=d.createElement('script');j.id=${ID};j.async=true;j.src=${U};j.setAttribute('fetchpriority','high');
for(var k in c)j.setAttribute('data-mos-'+k,c[k]);
(d.head||d.documentElement).appendChild(j);
})(${C});`
}
