import { afterEach, describe, expect, it } from 'vitest'
import { readScriptAttributes } from '../../src/config/readScriptAttributes'
import { MOS_SDK_SCRIPT_ID } from '../../src/loader/constants'
import { buildLoaderSnippet } from '../../src/loader/snippet'

// Real-browser verification (acceptance criterion): the one-paste loader injects the bundle <script>
// dynamically, and the bundle reads its config off that tag on boot. jsdom can't tell us whether
// `document.currentScript` is set for a dynamically-injected script — only a real browser can — so we
// exercise both discovery paths `readScriptAttributes()` relies on: currentScript, and the fallback.

// biome-ignore lint/suspicious/noExplicitAny: test globals + window pokes
const w = window as any

afterEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    w.MOS = undefined
    w.__readAttrs = undefined
    w.__cfg = undefined
})

describe('one-paste loader — config discovery in a real browser', () => {
    it('injects a config-bearing tag readScriptAttributes() can recover (querySelector fallback)', () => {
        // Harmless empty data: URL src so nothing is actually fetched.
        // biome-ignore lint/security/noGlobalEval: exercising the generated synchronous loader snippet
        window.eval(buildLoaderSnippet({ src: 'data:text/javascript,', config: { pk: 'pk_live_x', surface: 'article' } }))

        expect(document.getElementById(MOS_SDK_SCRIPT_ID)).toBeTruthy()
        // From test context `document.currentScript` is null → the `querySelector('script[data-mos-pk]')`
        // fallback finds the injected tag and reads its config.
        expect(readScriptAttributes()).toEqual({ publicKey: 'pk_live_x', surface: 'article' })
    })

    it('a dynamically-injected script recovers its own data-mos-* config via document.currentScript', () => {
        // This is the path the real bundle takes on boot: it reads config off the very script that is
        // executing. A dynamically-inserted classic script sets `document.currentScript` to itself
        // during execution — the behaviour jsdom cannot reproduce.
        w.__readAttrs = readScriptAttributes
        const s = document.createElement('script')
        s.setAttribute('data-mos-pk', 'pk_inj')
        s.setAttribute('data-mos-surface', 'sfc')
        s.textContent = 'window.__cfg = window.__readAttrs()'
        document.head.appendChild(s) // executes synchronously; document.currentScript = s

        expect(w.__cfg).toEqual({ publicKey: 'pk_inj', surface: 'sfc' })
    })
})
