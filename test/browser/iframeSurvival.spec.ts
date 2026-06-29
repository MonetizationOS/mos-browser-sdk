import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyContentBehavior } from '../../src/applicator/applyContentBehavior'
import { applyReplaceRange } from '../../src/applicator/replaceRange'

// Real-browser verification (acceptance criterion): every node that survives a transformation keeps
// its identity — live iframes/players keep state and attached listeners survive across operations.
// In a real browser an iframe has a real contentWindow whose state is destroyed on recreation — so
// surviving state proves the node was preserved, not rebuilt.

const ctx = () => ({ doc: document })

afterEach(() => {
    document.body.innerHTML = ''
})

describe('iframe / listener survival across operations', () => {
    it('keeps an iframe live (contentWindow state intact) across insertion ops', () => {
        document.body.innerHTML = '<div id="t"><iframe id="f" src="about:blank"></iframe></div>'
        const iframe = document.getElementById('f') as HTMLIFrameElement
        // biome-ignore lint/suspicious/noExplicitAny: stashing state on the real contentWindow
        ;(iframe.contentWindow as any).__state = 42

        applyContentBehavior(
            document.getElementById('t')!,
            { prepend: [{ type: 'html', content: '<p>x</p>' }], after: [{ type: 'text', content: 'y' }] },
            ctx(),
        )

        const after = document.getElementById('f') as HTMLIFrameElement
        expect(after).toBe(iframe) // same node identity
        // biome-ignore lint/suspicious/noExplicitAny: reading state back
        expect((after.contentWindow as any).__state).toBe(42) // not reloaded
    })

    it('keeps a live iframe outside the range intact across a replaceRange (never reloaded)', () => {
        document.body.innerHTML =
            '<article id="a"><iframe id="ad" src="about:blank"></iframe><span class="start"></span><p id="p1">one</p><p id="p2">two</p><span class="end"></span></article>'
        const iframe = document.getElementById('ad') as HTMLIFrameElement
        // biome-ignore lint/suspicious/noExplicitAny: stashing state on the real contentWindow
        ;(iframe.contentWindow as any).__ad = 'loaded'

        applyReplaceRange(
            document.getElementById('a')!,
            { fromMarker: '.start', toMarker: '.end', replaceWith: [{ type: 'text', content: 'NEW' }] },
            ctx(),
        )

        const after = document.getElementById('ad') as HTMLIFrameElement
        expect(document.getElementById('p1')).toBeNull()
        expect(document.getElementById('p2')).toBeNull()
        expect(after).toBe(iframe)
        // biome-ignore lint/suspicious/noExplicitAny: reading state back
        expect((after.contentWindow as any).__ad).toBe('loaded') // iframe never reloaded
    })

    it('removes an iframe inside the range — truncation is intentional, not vetoed', () => {
        document.body.innerHTML =
            '<article id="a"><span class="start"></span><iframe id="ad" src="about:blank"></iframe><span class="end"></span></article>'
        applyReplaceRange(document.getElementById('a')!, { fromMarker: '.start', toMarker: '.end', replaceWith: [] }, ctx())
        expect(document.getElementById('ad')).toBeNull()
    })

    it('keeps attached event listeners working after surrounding inserts', () => {
        document.body.innerHTML = '<div id="t"><button id="b">go</button></div>'
        const btn = document.getElementById('b')!
        const handler = vi.fn()
        btn.addEventListener('click', handler)
        applyContentBehavior(document.getElementById('t')!, { append: [{ type: 'html', content: '<span>added</span>' }] }, ctx())
        btn.click()
        expect(handler).toHaveBeenCalledTimes(1)
    })
})
