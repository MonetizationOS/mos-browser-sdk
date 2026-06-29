import { afterEach, describe, expect, it } from 'vitest'
import { buildNodes } from '../../src/applicator/buildNodes'

// Real-browser verification (acceptance criterion): injected `html` must EXECUTE its scripts
// via the cloned-script technique. jsdom can't do this faithfully — only a real browser runs scripts.

// biome-ignore lint/suspicious/noExplicitAny: test globals set by injected scripts
const w = window as any

afterEach(() => {
    document.body.innerHTML = ''
    w.__exec = undefined
    w.__order = undefined
})

describe('injected html executes scripts (cloned-script technique)', () => {
    it('runs an inline script from injected html', () => {
        w.__exec = false
        const frag = buildNodes(document, [{ type: 'html', content: '<div>hi</div><script>window.__exec = true</script>' }])
        document.body.appendChild(frag)
        expect(w.__exec).toBe(true)
    })

    it('runs multiple inline scripts in document order', () => {
        w.__order = []
        const frag = buildNodes(document, [
            { type: 'html', content: '<script>window.__order.push("a")</script>' },
            { type: 'html', content: '<script>window.__order.push("b")</script>' },
        ])
        document.body.appendChild(frag)
        expect(w.__order).toEqual(['a', 'b'])
    })

    it('does NOT re-execute scripts already present in the DOM', () => {
        w.__exec = 0
        // A pre-existing inert/ran script — simulate one already in the document.
        document.body.innerHTML = '<div id="host"><span>existing</span></div>'
        const host = document.getElementById('host')!
        // Inserting new html next to it must not touch the existing subtree's scripts.
        host.after(buildNodes(document, [{ type: 'html', content: '<script>window.__exec = (window.__exec||0)+1</script>' }]))
        expect(w.__exec).toBe(1) // ran exactly once (the newly injected one)
    })
})
