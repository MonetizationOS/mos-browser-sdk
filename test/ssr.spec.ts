// @vitest-environment node
import { describe, expect, it } from 'vitest'

// SSR-safe by contract: importing the SDK in a server bundle must not throw, and every
// method must no-op outside a browser. This file runs in the node environment (no window/document).

describe('SSR / non-browser safety', () => {
    it('imports without throwing in a server environment', async () => {
        const mod = await import('../src/index')
        expect(typeof mod.createMOS).toBe('function')
        expect(typeof mod.buildCloakSnippet).toBe('function')
    })

    it('createMOS().decide() no-ops (resolves undefined) with no DOM', async () => {
        const { createMOS } = await import('../src/index')
        const mos = createMOS({ publishableKey: 'pk', surface: 's' })
        await expect(mos.decide()).resolves.toBeUndefined()
        // Imperative methods are safe to call too.
        expect(() => mos.identify({ userJwt: 'x' })).not.toThrow()
        expect(() => mos.reveal()).not.toThrow()
    })

    it('buildCloakSnippet is pure and works without a DOM', async () => {
        const { buildCloakSnippet } = await import('../src/index')
        expect(buildCloakSnippet({ selectors: ['.x'] })).toContain('.x')
    })
})
