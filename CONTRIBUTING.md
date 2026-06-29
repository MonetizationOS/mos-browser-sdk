# Contributing

## Scripts

| Script                        | What it does                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `pnpm build`                  | Dual build (ESM + IIFE) via tsdown                                           |
| `pnpm test` / `pnpm test:run` | jsdom unit suite                                                             |
| `pnpm test:browser`           | Real-Chromium smoke suite (run `pnpm exec playwright install chromium` once) |
| `pnpm typecheck`              | `tsc --noEmit`                                                               |
| `pnpm lint` / `pnpm format`   | biome                                                                        |

## Local sandbox

A playground for making **real** decision calls with a publishable key and watching them apply:

```sh
pnpm sandbox   # builds, then serves http://localhost:5173/examples/sandbox.html
```

Paste a `pk_*` key + surface slug and hit **Run**. The real demo page loads **styled, in an iframe**,
the SDK is injected **into** that iframe (so it runs in the page's own realm, like production), and the
decision applies to the real DOM — alongside the raw decision JSON and the `onLog` trace.

The dev server **proxies** so the browser never makes a cross-origin request:

- `/api/*` → the MOS API (`MOS_API`, default `https://api.monetizationos.com`) — real `pk_` decisions.
- `/origin/*` → the demo origin (`MOS_ORIGIN`, default `https://news.wingorigin.dev`), as a light
  **rewriting** proxy: it rewrites the page's root-relative asset URLs back through `/origin`, rewrites
  `url(...)` in its CSS, drops `X-Frame-Options`/CSP so it's framable, and strips the origin's own
  scripts so only the static content + CSS render and the injected SDK is the only script that runs.

```sh
MOS_ORIGIN=https://your-site.example MOS_API=https://api.monetizationos.com pnpm sandbox
```

Notes:

- **Publishable keys only** — `pk_*` is safe in page source; the sandbox rejects `sk_*`.
- **Proxy mode is on by default** and sidesteps CORS entirely (calls go same-origin to the dev server,
  which forwards them). Untick **Route through local proxy** to make the SDK call the API directly —
  that exercises the real browser CORS path a customer hits, and will fail unless the API sends
  `Access-Control-Allow-Origin` for `http://localhost:5173` (a server-side config, not an SDK issue).
- Served over `http://localhost` deliberately — a `file://` page sends `Origin: null`, which CORS rejects.

### Testing the cloak & slow responses

The cloak (anti-flicker mask) and the slow-decision path are only visible when the response is slower
than the timeout, so the sandbox can fake both:

- **Install cloak** hides the **Cloak selector** (default `article`) before the SDK boots; the SDK
  reveals it once the decision applies — or, if the **Decision / cloak timeout** elapses first, reveals
  it early.
- **Simulate API delay (ms)** delays the decision response (via a `fetchImpl` wrapper, in proxy or
  direct mode) so the mask window is observable.

Set the delay **above** the timeout to watch the behaviour the SDK guarantees: the cloak reveals at
the timeout (the page may FOUC), `onError` reports the slow request, the request keeps running, and
the decision still applies when it lands.
