import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultRevealTransform, type RevealTransform, runRevealPipeline } from '../src/cloak/revealPipeline'
import {
    buildCloakSnippet,
    CLOAK_GLOBAL,
    CLOAK_STYLE_ID,
    DEFAULT_CLOAK_SELECTOR,
    DEFAULT_CLOAK_TIMEOUT_MS,
    installCloak,
    revealCloak,
} from '../src/cloak/snippet'

beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    ;(window as unknown as Record<string, unknown>)[CLOAK_GLOBAL] = undefined
})

describe('cloak snippet', () => {
    it('builds a self-contained synchronous snippet referencing the selectors and timeout', () => {
        const snippet = buildCloakSnippet({ selectors: ['[data-mos-cloak]', '.paywalled'], timeoutMs: 3000 })
        expect(snippet).toContain('[data-mos-cloak]')
        expect(snippet).toContain('.paywalled')
        expect(snippet).toContain('3000')
        expect(snippet).toContain('visibility:hidden')
        // Leads with a guiding comment for copy-pasters, then a self-contained IIFE (no imports / refs).
        expect(snippet.trimStart().startsWith('/*')).toBe(true)
        expect(snippet).toContain('(function(){')
        // Propagates a strict-CSP nonce from the pasted <script> onto the injected <style>.
        expect(snippet).toContain('document.currentScript&&document.currentScript.nonce')
    })

    it('executing the snippet hides regions via an injected <style> and installs window.__mosCloak', () => {
        // biome-ignore lint/security/noGlobalEval: exercising the generated synchronous snippet
        window.eval(buildCloakSnippet({ selectors: ['.x'], timeoutMs: 9000 }))
        const style = document.getElementById(CLOAK_STYLE_ID)
        expect(style?.textContent).toContain('.x{visibility:hidden!important}')
        const handle = (window as unknown as Record<string, { revealed: boolean; reveal: () => void }>)[CLOAK_GLOBAL]!
        expect(handle.revealed).toBe(false)
        handle.reveal()
        expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull()
        expect(handle.revealed).toBe(true)
    })
})

describe('canonical snippet drift guard', () => {
    // The docs embed the copy-paste snippet by hand, and a Markdown/HTML formatter may reflow the
    // fenced code (whitespace, quote style, trailing commas). So rather than pin the exact bytes,
    // assert each doc still carries the load-bearing pieces of the SDK contract — the same constants
    // revealCloak() depends on, plus the hiding rule and the strict-CSP nonce hook. Rename any of
    // these in the source and the docs must be updated in lockstep.
    const invariants = [
        CLOAK_GLOBAL, // the window handle the SDK reveals against
        CLOAK_STYLE_ID, // the <style> id revealCloak removes
        DEFAULT_CLOAK_SELECTOR, // default cloaked region
        String(DEFAULT_CLOAK_TIMEOUT_MS), // default safety timeout
        'visibility:hidden!important', // the hiding rule
        'currentScript', // nonce propagation for strict CSP
    ]
    // Resolve from the repo root (vitest's cwd) — under jsdom `import.meta.url` isn't a file: URL.
    const readRepoFile = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8')

    it.each(['README.md', 'examples/static.html'])('%s carries the canonical cloak-snippet invariants', (rel) => {
        const doc = readRepoFile(rel)
        const missing = invariants.filter((token) => !doc.includes(token))
        expect(missing).toEqual([])
    })
})

describe('installCloak / revealCloak', () => {
    it('installs and reveals idempotently', () => {
        const handle = installCloak(window, { selectors: ['.y'] })!
        expect(document.getElementById(CLOAK_STYLE_ID)).toBeTruthy()
        expect(handle.revealed).toBe(false)
        revealCloak(window)
        expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull()
        expect(handle.revealed).toBe(true)
        // Second reveal is a no-op.
        revealCloak(window)
        expect(handle.revealed).toBe(true)
    })

    it('revealCloak removes the style directly when no handle is present', () => {
        const style = document.createElement('style')
        style.id = CLOAK_STYLE_ID
        document.head.appendChild(style)
        revealCloak(window)
        expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull()
    })
})

describe('reveal pipeline', () => {
    it('runs transforms in order; the default transform reveals', async () => {
        installCloak(window, { selectors: ['.z'] })
        const order: string[] = []
        const decrypt: RevealTransform = () => {
            order.push('decrypt')
        }
        const reveal: RevealTransform = (ctx) => {
            order.push('reveal')
            void defaultRevealTransform(ctx)
        }
        await runRevealPipeline([decrypt, reveal], { win: window, doc: document, reason: 'success' })
        expect(order).toEqual(['decrypt', 'reveal'])
        expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull()
    })

    it('isolates a throwing transform so later ones (the reveal) still run', async () => {
        installCloak(window, { selectors: ['.z'] })
        const boom: RevealTransform = () => {
            throw new Error('decrypt failed')
        }
        await runRevealPipeline([boom, defaultRevealTransform], { win: window, doc: document, reason: 'error' })
        expect(document.getElementById(CLOAK_STYLE_ID)).toBeNull()
    })
})
