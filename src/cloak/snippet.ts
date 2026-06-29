/**
 * Cloak / anti-flicker.
 *
 * Subtractive transforms flash because the content is painted before the async decision returns.
 * The opt-in cloak is a small **synchronous** inline snippet in `<head>` that hides customer-declared
 * regions before paint; the async SDK reveals them after the decision. The cloak cannot live in the
 * async SDK bundle (an `async`/`defer` script runs after paint), so it ships as a separate snippet —
 * the Optimizely/VWO anti-flicker pattern.
 *
 * Subtractive gating client-side is **visual only, not enforcement** — the content is in
 * the DOM regardless. State this plainly to customers.
 */

export const CLOAK_GLOBAL = '__mosCloak'
export const CLOAK_STYLE_ID = 'mos-cloak-style'
export const DEFAULT_CLOAK_SELECTOR = '[data-mos-cloak]'
export const DEFAULT_CLOAK_TIMEOUT_MS = 5000

/** The shape the snippet installs at `window.__mosCloak`, used by the SDK's reveal transform. */
export interface CloakHandle {
    reveal(): void
    readonly revealed: boolean
    styleId: string
    selectors: string[]
    timeoutMs: number
}

export interface CloakSnippetOptions {
    selectors?: string[]
    timeoutMs?: number
}

const normalize = (options: CloakSnippetOptions | undefined): { selectors: string[]; timeoutMs: number } => ({
    selectors: options?.selectors?.length ? options.selectors : [DEFAULT_CLOAK_SELECTOR],
    timeoutMs: options?.timeoutMs ?? DEFAULT_CLOAK_TIMEOUT_MS,
})

/**
 * Generate the synchronous inline snippet (a JS string) the customer pastes inside a `<script>` in
 * `<head>`, before the async SDK tag. It hides the selectors via an injected `<style>` and installs
 * its **own** safety timeout that reveals them even if the SDK never loads — the single most
 * important resilience rule: content is never left hidden because the SDK failed.
 *
 * With default options this is the exact literal published in the README and `examples/static.html`;
 * a test pins those copies to this output so the copy-paste block can never drift from the SDK
 * contract. The two knobs (selectors, timeout) lead the body as editable constants behind a comment.
 *
 * Under a strict CSP, put a `nonce` on the pasted `<script>`; the snippet copies that nonce onto the
 * `<style>` it injects (via `document.currentScript.nonce`), so one nonce covers both. Without a
 * nonce this is a no-op.
 */
export const buildCloakSnippet = (options?: CloakSnippetOptions): string => {
    const { selectors, timeoutMs } = normalize(options)
    // Values are serialized as JSON so the snippet is self-contained and injection-safe.
    return `/* MOS anti-flicker (optional): edit the selector(s) and timeout below */
(function(){var S=${JSON.stringify(selectors)},T=${JSON.stringify(timeoutMs)};
var I=${JSON.stringify(CLOAK_STYLE_ID)};
var css=S.map(function(s){return s+'{visibility:hidden!important}';}).join('');
var st=document.createElement('style');st.id=I;st.textContent=css;
var n=document.currentScript&&document.currentScript.nonce;if(n)st.nonce=n;
(document.head||document.documentElement).appendChild(st);
var done=false,timer;function reveal(){if(done)return;done=true;var e=document.getElementById(I);if(e&&e.parentNode)e.parentNode.removeChild(e);if(timer)clearTimeout(timer);}
timer=setTimeout(reveal,T);
window[${JSON.stringify(CLOAK_GLOBAL)}]={reveal:reveal,get revealed(){return done;},styleId:I,selectors:S,timeoutMs:T};})();`
}

/**
 * Programmatically install the cloak from JS (ESM users who prefer not to paste the inline snippet).
 * NOTE: this only beats paint if it runs synchronously before the cloaked content paints — i.e. from
 * a synchronous (non-`async`/`defer`) script. From the async SDK it is effectively a no-op against
 * flicker; prefer {@link buildCloakSnippet} pasted in `<head>` for true anti-flicker.
 */
export const installCloak = (win: Window & typeof globalThis, options?: CloakSnippetOptions): CloakHandle | undefined => {
    const doc = win.document
    if (!doc) return undefined
    const { selectors, timeoutMs } = normalize(options)
    const existing = (win as unknown as Record<string, CloakHandle | undefined>)[CLOAK_GLOBAL]
    if (existing) return existing

    const css = selectors.map((s) => `${s}{visibility:hidden!important}`).join('')
    const style = doc.createElement('style')
    style.id = CLOAK_STYLE_ID
    style.textContent = css
    ;(doc.head || doc.documentElement).appendChild(style)

    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const reveal = (): void => {
        if (done) return
        done = true
        const el = doc.getElementById(CLOAK_STYLE_ID)
        el?.parentNode?.removeChild(el)
        if (timer) clearTimeout(timer)
    }
    timer = setTimeout(reveal, timeoutMs)
    const handle: CloakHandle = {
        reveal,
        get revealed() {
            return done
        },
        styleId: CLOAK_STYLE_ID,
        selectors,
        timeoutMs,
    }
    ;(win as unknown as Record<string, CloakHandle>)[CLOAK_GLOBAL] = handle
    return handle
}

/**
 * Best-effort reveal used by the default reveal transform. Calls the snippet's installed handle when
 * present; otherwise removes the cloak `<style>` by id directly. Idempotent.
 */
export const revealCloak = (win: Window & typeof globalThis): void => {
    const handle = (win as unknown as Record<string, CloakHandle | undefined>)[CLOAK_GLOBAL]
    if (handle?.reveal) {
        handle.reveal()
        return
    }
    const el = win.document?.getElementById(CLOAK_STYLE_ID)
    el?.parentNode?.removeChild(el)
}
