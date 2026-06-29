import type { SubSurfaceBehaviorApi } from '@monetizationos/proxy'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyComponentBehaviors } from '../src/applicator/applyComponentBehaviors'
import { applyContentBehavior } from '../src/applicator/applyContentBehavior'
import { applyReplaceRange } from '../src/applicator/replaceRange'

const ctx = () => ({ doc: document })

beforeEach(() => {
    document.body.innerHTML = ''
})

describe('applyContentBehavior — non-destructive insertion', () => {
    it('inserts before/prepend/append/after in source order around a target', () => {
        document.body.innerHTML = '<div id="t"><span id="child">C</span></div>'
        const target = document.getElementById('t')!
        applyContentBehavior(
            target,
            {
                before: [{ type: 'html', content: '<b id="b">B</b>' }],
                prepend: [{ type: 'text', content: 'P' }],
                append: [{ type: 'text', content: 'A' }],
                after: [{ type: 'html', content: '<i id="af">AF</i>' }],
            },
            ctx(),
        )
        expect(document.getElementById('b')?.nextElementSibling?.id).toBe('t')
        expect(target.firstChild?.textContent).toBe('P')
        expect(target.lastChild?.textContent).toBe('A')
        expect(target.nextElementSibling?.id).toBe('af')
        // The original child node was never recreated.
        expect(document.getElementById('child')?.textContent).toBe('C')
    })

    it('preserves attached event listeners on existing nodes across insertion (DOM preservation)', () => {
        document.body.innerHTML = '<div id="t"><button id="btn">go</button></div>'
        const btn = document.getElementById('btn')!
        const handler = vi.fn()
        btn.addEventListener('click', handler)

        applyContentBehavior(
            document.getElementById('t')!,
            { prepend: [{ type: 'html', content: '<p>x</p>' }], append: [{ type: 'text', content: 'y' }] },
            ctx(),
        )

        // Same node identity → listener still attached.
        expect(document.getElementById('btn')).toBe(btn)
        btn.dispatchEvent(new Event('click'))
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it('remove deletes the matched element but leaves before/after siblings (replace semantics)', () => {
        document.body.innerHTML = '<section><div id="t">x</div></section>'
        applyContentBehavior(
            document.getElementById('t')!,
            {
                before: [{ type: 'html', content: '<b id="before">B</b>' }],
                after: [{ type: 'html', content: '<i id="after">A</i>' }],
                remove: true,
            },
            ctx(),
        )
        expect(document.getElementById('t')).toBeNull()
        expect(document.getElementById('before')).toBeTruthy()
        expect(document.getElementById('after')).toBeTruthy()
    })
})

describe('replaceRange', () => {
    it('removes nodes strictly between markers and inserts replacement, retaining the markers', () => {
        document.body.innerHTML =
            '<article id="a"><span class="start"></span><p id="p1">one</p><p id="p2">two</p><span class="end"></span></article>'
        applyReplaceRange(
            document.getElementById('a')!,
            { fromMarker: '.start', toMarker: '.end', replaceWith: [{ type: 'html', content: '<div id="rep">REPLACED</div>' }] },
            ctx(),
        )
        expect(document.getElementById('p1')).toBeNull()
        expect(document.getElementById('p2')).toBeNull()
        expect(document.getElementById('rep')?.textContent).toBe('REPLACED')
        // Markers retained (matching the proxy).
        expect(document.querySelector('#a .start')).toBeTruthy()
        expect(document.querySelector('#a .end')).toBeTruthy()
    })

    it('removes stateful nodes inside the range like any other content (truncation wins)', () => {
        document.body.innerHTML =
            '<article id="a"><span class="start"></span><p id="p1">one</p><div id="adwrap"><iframe id="ad" src="about:blank"></iframe></div><p id="p2">two</p><span class="end"></span></article>'
        applyReplaceRange(
            document.getElementById('a')!,
            { fromMarker: '.start', toMarker: '.end', replaceWith: [{ type: 'text', content: 'NEW' }] },
            ctx(),
        )
        expect(document.getElementById('p1')).toBeNull()
        expect(document.getElementById('adwrap')).toBeNull()
        expect(document.getElementById('p2')).toBeNull()
    })

    it('keeps identity of nodes straddling a range boundary (only fully-contained nodes are removed)', () => {
        // The end marker is nested one level deep, so #wrap straddles the range's end boundary:
        // its pre-marker children are fully in range, #wrap itself is not.
        document.body.innerHTML =
            '<article id="a"><span class="start"></span><p id="p1">one</p><div id="wrap"><p id="p2">two</p><span class="end"></span><p id="p3">three</p></div></article>'
        const wrap = document.getElementById('wrap')!
        applyReplaceRange(document.getElementById('a')!, { fromMarker: '.start', toMarker: '.end', replaceWith: [] }, ctx())
        expect(document.getElementById('p1')).toBeNull()
        expect(document.getElementById('p2')).toBeNull()
        // The straddling ancestor was operated *within*, never removed or rebuilt.
        expect(document.getElementById('wrap')).toBe(wrap)
        expect(document.getElementById('p3')).toBeTruthy()
    })

    it('skips entirely when a specified fromMarker is missing (fail safe)', () => {
        document.body.innerHTML = '<article id="a"><p id="p1">one</p><span class="end"></span></article>'
        const warn = vi.fn()
        applyReplaceRange(
            document.getElementById('a')!,
            { fromMarker: '.nope', toMarker: '.end', replaceWith: [{ type: 'text', content: 'X' }] },
            { ...ctx(), onWarn: warn },
        )
        expect(document.getElementById('p1')).toBeTruthy()
        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ code: 'replace-range-from-marker-missing' }))
    })

    it('truncates from the start when there is no fromMarker', () => {
        document.body.innerHTML = '<article id="a"><p id="p1">one</p><p id="p2">two</p><span class="end"></span></article>'
        applyReplaceRange(
            document.getElementById('a')!,
            { toMarker: '.end', replaceWith: [{ type: 'html', content: '<b id="rep">R</b>' }] },
            ctx(),
        )
        expect(document.getElementById('p1')).toBeNull()
        expect(document.getElementById('p2')).toBeNull()
        expect(document.querySelector('#a #rep')).toBeTruthy()
        expect(document.getElementById('a')?.firstElementChild?.id).toBe('rep')
    })
})

describe('applyComponentBehaviors', () => {
    const behaviors = (entries: Record<string, SubSurfaceBehaviorApi>) => entries

    it('applies to all matched elements (match-all) and reports stats', () => {
        document.body.innerHTML = '<div class="x">1</div><div class="x">2</div>'
        const result = applyComponentBehaviors(
            behaviors({ k: { metadata: { cssSelector: '.x' }, content: { append: [{ type: 'text', content: '!' }] } } }),
            { doc: document },
        )
        expect(result.appliedComponents).toBe(1)
        expect(result.appliedElements).toBe(2)
        expect(Array.from(document.querySelectorAll('.x')).map((e) => e.textContent)).toEqual(['1!', '2!'])
    })

    it('skips behaviours with no selector or no content', () => {
        const result = applyComponentBehaviors(
            behaviors({
                noSel: { metadata: {}, content: { remove: true } },
                noContent: { metadata: { cssSelector: '.y' } },
            }),
            { doc: document },
        )
        expect(result.skipped.sort()).toEqual(['noContent', 'noSel'])
    })

    it('supports a selector superset the proxy rejects (e.g. :last-child)', () => {
        document.body.innerHTML = '<ul><li>a</li><li id="last">b</li></ul>'
        applyComponentBehaviors(behaviors({ k: { metadata: { cssSelector: 'li:last-child' }, content: { remove: true } } }), {
            doc: document,
        })
        expect(document.getElementById('last')).toBeNull()
        expect(document.querySelectorAll('li')).toHaveLength(1)
    })

    it('fails open on an invalid selector and warns', () => {
        const warn = vi.fn()
        const result = applyComponentBehaviors(behaviors({ bad: { metadata: { cssSelector: ':::nope' }, content: { remove: true } } }), {
            doc: document,
            onWarn: warn,
        })
        expect(result.skipped).toContain('bad')
        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid-selector', componentKey: 'bad' }))
    })

    it('does not re-process newly inserted nodes that match the same selector', () => {
        document.body.innerHTML = '<div class="z">x</div>'
        applyComponentBehaviors(
            behaviors({
                k: { metadata: { cssSelector: '.z' }, content: { append: [{ type: 'html', content: '<div class="z">y</div>' }] } },
            }),
            { doc: document },
        )
        // Exactly 2 (.z appended inside the matched .z). A 3rd would mean the inserted node was
        // itself processed — the snapshot-to-array guard prevents that.
        expect(document.querySelectorAll('.z')).toHaveLength(2)
        const inner = document.querySelector('.z .z')
        expect(inner?.textContent).toBe('y')
        expect(inner?.children.length).toBe(0)
    })
})
