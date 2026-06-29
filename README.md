<div align="center">
  <a href="https://monetizationos.com">
  <img alt="MonetizationOS logo" src="https://app.monetizationos.com/static/monetizationos-logo.png" height="48">
  </a>
  <h1>MonetizationOS Browser SDK</h1>
</div>

A client-side MonetizationOS SDK. It runs in a user's browser, makes a surface decision against the MOS
Webscale API with a **publishable key**, and applies the resulting component transformations
directly to the live DOM.

## Install

```sh
npm i @monetizationos/browser
```

The package lists `@monetizationos/proxy` as a dependency for the shared contract **types** only; no
code from it runs at runtime.

## Two front doors, one core

### ESM (bundler / SPA)

```ts
import { createMOS } from "@monetizationos/browser";

const mos = createMOS({
    publishableKey: "pk_live_...",
    surface: "article-paywall",
    identity: { jwtGlobal: () => authClient.getToken() }, // or { jwtCookie: 'name' }
    onDecision: (decision) => {}, // full response: features, properties, identity
    onError: (err) => {},
});

mos.identify({ userJwt }); // optional; otherwise anonymous
await mos.decide(); // auto-fires once on load unless `manual: true`
// On SPA route change, re-call decide() only after the targeted DOM has been re-rendered —
// insertions are not idempotent and removed content is never restored.
```

### Configuration

All keys are optional except the first two. Set them via `createMOS(config)`, `window.MOSConfig`, or
`data-mos-*` attributes (script tag) — precedence in that order.

| Key                    | Default                          | What it does                                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publishableKey`       | —                                | **Required.** `pk_*` key; safe to ship in page source.                                                                                                                                                                                                        |
| `surface`              | —                                | **Required.** Surface slug, sent as `surfaceSlug`.                                                                                                                                                                                                            |
| `apiBaseUrl`           | `https://api.monetizationos.com` | MOS API base URL.                                                                                                                                                                                                                                             |
| `manual`               | `false`                          | Disable the auto-fire decision on load.                                                                                                                                                                                                                       |
| `cloak`                | —                                | Anti-flicker reveal timeout/selectors — see [Cloak / anti-flicker](#cloak--anti-flicker).                                                                                                                                                                     |
| `decisionTimeoutMs`    | `5000`                           | How long the cloak mask stays up awaiting the decision. On expiry the cloak reveals (the page may FOUC); the request is **not** aborted and still applies when it lands.                                                                                      |
| `identity`             | anonymous                        | One declarative identity source — see [Identity](#identity).                                                                                                                                                                                                  |
| `render`               | —                                | Element render options: `renderCustom` hook for `custom` elements, `onUnsupported(info)` callback.                                                                                                                                                            |
| `resourceProvider`     | derived from page                | Hook merged over the derived `{ id, meta }` resource.                                                                                                                                                                                                         |
| `revealTransforms`     | `[]`                             | Extra reveal transforms run before the default reveal.                                                                                                                                                                                                        |
| `fetchImpl`            | global `fetch`                   | Bring your own transport — attach auth, route through an edge proxy, add retries, or mock it in tests. Standard `(input, init)` signature; the SDK never passes `init.signal`. A function, so settable via config or `window.MOSConfig` but not `data-mos-*`. |
| `onReady()`            | —                                | Called once the SDK is initialized.                                                                                                                                                                                                                           |
| `onDecision(decision)` | —                                | Called with the full decision: features, properties, identity.                                                                                                                                                                                                |
| `onError(err)`         | —                                | Decision failure (network, non-2xx, malformed, missing config) — or the max-wait timeout (slow request; the decision still applies later).                                                                                                                    |
| `onWarn(w)`            | —                                | Non-fatal applicator issues (invalid selector, missing `replaceRange` marker).                                                                                                                                                                                |
| `onLog(event)`         | —                                | Structured lifecycle/telemetry trace — see [Logging & observability](#logging--observability).                                                                                                                                                                |

### Script tag (static sites)

One synchronous paste in `<head>` — a combined loader that installs a call
queue **and** injects the async SDK. The queue means `MOS.identify()/decide()/reveal()` calls made
before the bundle loads aren't lost — they're captured and replayed on boot. Edit the config object
at the bottom; its keys become `data-mos-*` attributes on the injected tag (`pk` → `data-mos-pk`,
`surface` → `data-mos-surface`, `jwt-global` → `data-mos-jwt-global`, …).

<!-- prettier-ignore -->
```html
<script>
/* MonetizationOS loader (queue + async SDK, one paste). Edit the config below. */
(function(c){var w=window,d=document,g="MOS",q="q";
w[g]=w[g]||{};w[g][q]=w[g][q]||[];
["identify","decide","reveal"].forEach(function(m){w[g][m]=w[g][m]||function(){w[g][q].push([m,arguments]);};});
if(d.getElementById("mos-sdk"))return;
var j=d.createElement('script');j.id="mos-sdk";j.async=true;j.src="https://assets.monetizationos.com/browser/v1.js";j.setAttribute('fetchpriority','high');
for(var k in c)j.setAttribute('data-mos-'+k,c[k]);
(d.head||d.documentElement).appendChild(j);
})({"pk":"pk_live_...","surface":"article-paywall"});
</script>
```

- Self-initializes (one decision on load) and exposes `window.MOS` with the imperative methods
  (`identify`, `decide`, `reveal`).
- **String config only.** `data-mos-*` attributes carry strings — for callbacks or a custom
  `fetchImpl`, set `window.MOSConfig = { … }` above this block.
- **Place the tag after your `<meta>` tags** — the SDK derives the decision's `resource` from page
  metadata and starts the request as early as it can.
- ESM users can mint this string from code with `buildLoaderSnippet({ config: { pk, surface } })`.

### Faster first decision (preconnect)

The bundle comes from `assets.monetizationos.com`; the decision request then goes to
`api.monetizationos.com` — a second origin the browser can't connect to until the bundle has run.
Warming it up front is the single biggest win. Add one preconnect in `<head>`, before the MOS tag:

```html
<link rel="preconnect" href="https://api.monetizationos.com" crossorigin />
<link rel="dns-prefetch" href="https://api.monetizationos.com" /><!-- fallback for old browsers -->
```

- **`crossorigin` is required.** The decision is an anonymous CORS `fetch`; omit it and the browser
  warms a connection the request never uses.
- The bundle itself needs no hint — it's a static `<script async fetchpriority="high">` in `<head>`,
  already discovered early by the browser's preload scanner.

## Identity

Resolution order, highest precedence first:

1. an explicit `mos.identify({ userJwt })` value;
2. one configured declarative source;
3. anonymous — an existing persisted anonymous id, else the SDK requests one and persists what the
   server mints (in `localStorage`, falling back to a first-party cookie, via a pluggable
   `IdentityStore`). The SDK never relies on a server-set MOS-domain `Set-Cookie`.

Declarative sources (configure one):

- **`jwtGlobal`** — a `window` dotted path (`'provider.jwt'`, script-tag form) **or** a getter thunk
  (`() => authClient.getToken()`, ESM form, read fresh at each `decide()`). Preferred for SPAs: the
  token lives in memory, sidestepping HttpOnly entirely.
- **`jwtCookie`** — a named **non-HttpOnly** cookie read via `document.cookie`. Carries an
  XSS-exposure caveat — only the named token is exposed to page JS; weigh that for your threat model.

## Component rendering

`componentBehaviors` is applied to the live DOM. The target is `metadata.cssSelector` (matched with
`querySelectorAll`, so the full CSS selector range works — `:last-child` etc.). Operations:
`before` / `after` / `prepend` / `append`, `remove`, and `replaceRange` (`fromMarker` / `toMarker`
CSS selectors).

Web elements:

- **`text`** — inserted as escaped text.
- **`html`** — inserted as parsed markup, **and its scripts execute** (via the cloned-script
  technique). This means decision `html` is fully trusted (customer-authored workflow output, never
  end-user input). There is no sanitizer in v1.
- **`custom`** — unsupported by default; provide `render.renderCustom` to handle it.

**Transformations never recreate existing elements.** New nodes are built off-document and inserted
at boundaries; existing nodes are only ever left in place or moved adjacent to — so live ad iframes,
players, analytics-bound nodes, and attached listeners keep working. `replaceRange` deletes only
nodes fully inside the range; the markers and any node straddling a boundary survive.

## Cloak / anti-flicker

**Optional.** Skip this entire section unless you do _subtractive_ transforms (removing or truncating
content). Those flash because the content paints before the async decision returns. The cloak hides
declared regions before paint and reveals them after the decision — the Optimizely/VWO anti-flicker
pattern. Additive-only surfaces don't need it.

It's a **synchronous inline snippet** you paste in `<head>`, **above** the MOS tag. Copy this whole
block — it works as-is; the only things you'd change are the selector(s) and the timeout on the first
line of the IIFE:

<!-- prettier-ignore -->
```html
<!-- MOS anti-flicker: paste in <head>, ABOVE the MOS script tag -->
<script>
/* MOS anti-flicker (optional): edit the selector(s) and timeout below */
(function(){var S=["[data-mos-cloak]"],T=5000;
var I="mos-cloak-style";
var css=S.map(function(s){return s+'{visibility:hidden!important}';}).join('');
var st=document.createElement('style');st.id=I;st.textContent=css;
var n=document.currentScript&&document.currentScript.nonce;if(n)st.nonce=n;
(document.head||document.documentElement).appendChild(st);
var done=false,timer;function reveal(){if(done)return;done=true;var e=document.getElementById(I);if(e&&e.parentNode)e.parentNode.removeChild(e);if(timer)clearTimeout(timer);}
timer=setTimeout(reveal,T);
window["__mosCloak"]={reveal:reveal,get revealed(){return done;},styleId:I,selectors:S,timeoutMs:T};})();
</script>
```

- **Mark your regions:** add `data-mos-cloak` to the elements to hide until the decision returns, or
  change the `S` array to your own selectors.
- **It always reveals** — a built-in safety timeout lifts the mask even if the SDK is slow, blocked,
  or never loads; content is never left hidden because MOS failed.
- **Strict CSP:** put a `nonce` on the cloak `<script>` — the snippet copies it onto the `<style>` it
  injects, so one nonce covers both.

Bundler users can mint the same string from code:
`import { buildCloakSnippet } from "@monetizationos/browser"` and paste the result of
`buildCloakSnippet({ selectors: ["[data-mos-cloak]"], timeoutMs: 5000 })` inside a `<script>`.

## Failure model — fail-open

- Any decision _failure_ (network, non-2xx, malformed) leaves the page intact, no transforms.
- Cloaked regions are **always** revealed — on success, error, and a max-wait timeout (default 5s,
  configurable via `decisionTimeoutMs` / `cloak.timeoutMs`).
- The max-wait timeout only lifts the cloak mask; it does **not** abort the request. A slow decision
  still applies when it lands (the page may FOUC first), and `onError` fires so it stays observable.
- **No automatic retry** of `surface-decisions` — it consumes and has no idempotency key, so a retry
  risks double-consuming.

## Logging & observability

The SDK **never writes to `console`.** Everything is surfaced through the host callbacks in the
[configuration table](#configuration), so nothing lands in your users' consoles unless you put it
there.

`onLog` receives structured `{ level, code, message, context }` trace events with stable codes —
e.g. `decision:success` (with `latencyMs` and applied counts), `decision:timeout`. Tokens are never
logged — identity appears only as its discriminant. Pipe events to your own logger, or use the
bundled, opt-in console logger for quick local debugging:

```ts
import { createMOS, consoleLogger } from '@monetizationos/browser'

createMOS({ /* … */, onLog: (e) => myLogger.log(e.level, e.code, e.context) })
createMOS({ /* … */, onLog: consoleLogger })
```

`consoleLogger` is the **only** path that writes to `console`, and only when you explicitly pass it.

## Known limitations

- **Soft-gating, not enforcement.** Anything delivered to the browser is extractable, and metering is
  honor-system — this SDK hides and rearranges; hard enforcement remains a server-side concern.
- **No DOM restoration between decisions.** Re-calling `decide()` is only safe once the targeted DOM
  regions have been re-rendered — insertions are not idempotent and removed content is never
  restored.
- **No HttpOnly-token declarative source yet** — use `jwtGlobal` or an explicit `identify()`.
- **No HTTP response manipulation** (`surfaceBehavior.http`): redirects, status, body, header/cookie
  application are out of scope for v1 (deferred to a future browser-control block).
- **No `surfaceDecisionsCookies` forwarding.** Arbitrary matched-cookie pass-through is unavailable
  in `pk_` mode. If your decisioning depends on forwarded cookies, that input is absent.

## Contributing

Local sandbox, dev proxy, and package scripts: see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
