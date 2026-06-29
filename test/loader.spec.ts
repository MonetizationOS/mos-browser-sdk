import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SDK_SRC, MOS_GLOBAL, MOS_QUEUE_METHODS, MOS_SDK_SCRIPT_ID } from '../src/loader/constants'
import { buildLoaderSnippet } from '../src/loader/snippet'

// biome-ignore lint/suspicious/noExplicitAny: poking at the window globals the snippet manages
const win = window as any

beforeEach(() => {
    win.MOS = undefined
    win.MOSConfig = undefined
    document.head.innerHTML = ''
    document.body.innerHTML = ''
})

describe('buildLoaderSnippet', () => {
    it('builds a self-contained snippet with the queue, the injector, and the config', () => {
        const snippet = buildLoaderSnippet({ config: { pk: 'pk_live_x', surface: 'article' } })
        expect(snippet).toContain(MOS_GLOBAL)
        expect(snippet).toContain(MOS_SDK_SCRIPT_ID)
        expect(snippet).toContain(DEFAULT_SDK_SRC)
        expect(snippet).toContain('fetchpriority')
        expect(snippet).toContain('data-mos-')
        for (const method of MOS_QUEUE_METHODS) expect(snippet).toContain(method)
        expect(snippet).toContain('pk_live_x')
        expect(snippet).toContain('article')
        // Leads with a guiding comment, then a self-contained IIFE (no imports / external refs).
        expect(snippet.trimStart().startsWith('/*')).toBe(true)
        expect(snippet).toContain('(function(c){')
    })

    it('honors a custom bundle src', () => {
        expect(buildLoaderSnippet({ src: 'https://cdn.example.com/mos.js' })).toContain('https://cdn.example.com/mos.js')
    })
})

describe('executing the loader snippet', () => {
    it('installs the queue + shims and injects the async SDK tag with config as data-mos-* attributes', () => {
        // biome-ignore lint/security/noGlobalEval: exercising the generated synchronous snippet
        window.eval(buildLoaderSnippet({ config: { pk: 'pk_live_x', surface: 'article', 'jwt-global': 'provider.jwt' } }))

        const mos = win.MOS
        expect(Array.isArray(mos.q)).toBe(true)
        for (const method of MOS_QUEUE_METHODS) expect(typeof mos[method]).toBe('function')

        // A call made before the bundle loads is queued, not thrown.
        mos.decide({ path: '/x' })
        expect(mos.q.length).toBe(1)
        expect(mos.q[0][0]).toBe('decide')

        const tag = document.getElementById(MOS_SDK_SCRIPT_ID) as HTMLScriptElement
        expect(tag).toBeTruthy()
        expect(tag.src).toBe(DEFAULT_SDK_SRC)
        expect(tag.async).toBe(true)
        expect(tag.getAttribute('fetchpriority')).toBe('high')
        expect(tag.getAttribute('data-mos-pk')).toBe('pk_live_x')
        expect(tag.getAttribute('data-mos-surface')).toBe('article')
        expect(tag.getAttribute('data-mos-jwt-global')).toBe('provider.jwt')
    })

    it('does not inject the bundle twice', () => {
        // biome-ignore lint/security/noGlobalEval: exercising the generated synchronous snippet
        window.eval(buildLoaderSnippet({ config: { pk: 'p' } }))
        // biome-ignore lint/security/noGlobalEval: exercising the generated synchronous snippet
        window.eval(buildLoaderSnippet({ config: { pk: 'p' } }))
        expect(document.querySelectorAll(`#${MOS_SDK_SCRIPT_ID}`).length).toBe(1)
    })
})

describe('loader snippet drift guard', () => {
    // The README embeds the loader by hand and a formatter may reflow it, so assert the load-bearing
    // pieces are present (derived from the shared constants) rather than pinning the exact bytes.
    const invariants: string[] = [MOS_GLOBAL, MOS_SDK_SCRIPT_ID, DEFAULT_SDK_SRC, 'fetchpriority', 'data-mos-', ...MOS_QUEUE_METHODS]
    const readRepoFile = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8')

    it('README.md documents the loader-snippet invariants', () => {
        const doc = readRepoFile('README.md')
        const missing = invariants.filter((token) => !doc.includes(token))
        expect(missing).toEqual([])
    })
})
