import { describe, expect, it } from 'vitest'
import { buildFragment, buildNodes } from '../src/applicator/buildNodes'
import { renderElement } from '../src/render/renderElement'

describe('renderElement', () => {
    it('renders text as escaped (html: false)', () => {
        expect(renderElement({ type: 'text', content: '<b>x</b>' })).toEqual({ kind: 'content', html: false, content: '<b>x</b>' })
    })

    it('renders html as raw markup (html: true)', () => {
        expect(renderElement({ type: 'html', content: '<p>x</p>' })).toEqual({ kind: 'content', html: true, content: '<p>x</p>' })
    })

    it('treats the deprecated element type as unsupported (empty + onUnsupported)', () => {
        const seen: unknown[] = []
        const out = renderElement({ type: 'element', schema: 'mos:p@1', props: { a: 1 } }, { onUnsupported: (i) => seen.push(i) })
        expect(out).toEqual({ kind: 'empty' })
        expect(seen).toEqual([{ type: 'element', reason: 'unsupported' }])
    })

    it('lowercases the type, matching the proxy', () => {
        // biome-ignore lint/suspicious/noExplicitAny: exercising case-insensitive type handling
        expect(renderElement({ type: 'HTML', content: '<i>x</i>' } as any)).toEqual({ kind: 'content', html: true, content: '<i>x</i>' })
    })

    it('returns empty and calls onUnsupported for custom without a renderer', () => {
        const seen: unknown[] = []
        const out = renderElement({ type: 'custom', foo: 1 }, { onUnsupported: (i) => seen.push(i) })
        expect(out).toEqual({ kind: 'empty' })
        expect(seen).toEqual([{ type: 'custom', reason: 'unsupported' }])
    })

    it('uses a host-provided custom renderer when present', () => {
        const out = renderElement({ type: 'custom', foo: 1 }, { renderCustom: () => ({ kind: 'content', html: false, content: 'CUSTOM' }) })
        expect(out).toEqual({ kind: 'content', html: false, content: 'CUSTOM' })
    })
})

describe('buildNodes / buildFragment', () => {
    it('builds a text node for text elements (escaped by construction)', () => {
        const frag = buildNodes(document, [{ type: 'text', content: '<script>alert(1)</script>' }])
        expect(frag.childNodes).toHaveLength(1)
        expect(frag.childNodes[0]?.nodeType).toBe(Node.TEXT_NODE)
        expect(frag.textContent).toBe('<script>alert(1)</script>')
        // No actual <script> element was created.
        expect((frag as unknown as DocumentFragment).querySelector?.('script')).toBeFalsy()
    })

    it('revives <script> elements as fresh, executable nodes (not the inert parsed ones)', () => {
        const frag = buildFragment(document, '<div>hi</div><script>window.__x=1</script>')
        const script = frag.querySelector('script')
        expect(script).toBeTruthy()
        // The revived script is a brand-new element (its "already started" flag is unset), so when
        // inserted into a live document it will execute. We assert structural revival here; real
        // execution is covered by the browser smoke suite.
        expect(script?.textContent).toBe('window.__x=1')
        expect(frag.querySelector('div')?.textContent).toBe('hi')
    })

    it('copies script attributes (src etc.) onto the revived node', () => {
        const frag = buildFragment(document, '<script src="https://cdn.example/x.js" data-k="v" async></script>')
        const script = frag.querySelector('script')
        expect(script?.getAttribute('src')).toBe('https://cdn.example/x.js')
        expect(script?.getAttribute('data-k')).toBe('v')
        expect(script?.hasAttribute('async')).toBe(true)
    })
})
