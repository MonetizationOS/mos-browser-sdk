# @monetizationos/browser

## 1.0.0

### Major Changes

- [#1](https://github.com/MonetizationOS/mos-browser-sdk/pull/1) [`0375b3f`](https://github.com/MonetizationOS/mos-browser-sdk/commit/0375b3f431abed455aff5d403dec95c253446c22) Thanks [@benney](https://github.com/benney)! - First stable release of @monetizationos/browser, the client-side MonetizationOS SDK. It makes a surface decision against the MOS Webscale API with a publishable key and applies the resulting component transformations to the live DOM.

  - Two install paths — ESM createMOS() for bundlers/SPAs, or a single script-tag loader with a call queue (MOS.identify(), decide(), page(), reveal() calls made before load are replayed on boot).
  - Identity — anonymous by default, with JWT via global getter or cookie.
  - Cloaking — content hidden until the decision applies, with a configurable timeout fail-open.
  - Observability — onDecision, onError, and structured onLog telemetry hooks.
