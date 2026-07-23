# @monetizationos/browser

## 1.1.0

### Minor Changes

- [#3](https://github.com/MonetizationOS/mos-browser-sdk/pull/3) [`1d21a57`](https://github.com/MonetizationOS/mos-browser-sdk/commit/1d21a57038d8e9f4aff6ca1e83a2137b209d021a) Thanks [@benney](https://github.com/benney)! - Rename `publishableKey` to `publicKey`, plus README/source inconsistency fixes:

  - The config key is now `publicKey`, matching the console's "public key" terminology and the `pk_*` prefix. `publishableKey` keeps working as a deprecated alias (`publicKey` wins when both are set) and will be removed in a future version. The `data-mos-pk` attribute and the loader snippet's `pk` shorthand are unchanged.
  - `ExplicitIdentity` no longer accepts a bare JWT string — pass `{ userJwt }` to `identify()`. The string form was never documented or shown in any example.
  - An invalid `data-mos-timeout` / `data-mos-cloak-timeout` attribute (non-numeric, zero, negative, or blank) now emits a warn-level `config:invalid-timeout` event on `onLog` instead of being dropped silently; the default timeout still applies, as before.
  - `storeKind` JSDoc now documents the real default (the combined localStorage + first-party-cookie store, not plain localStorage), and the README logging examples are valid JavaScript.

## 1.0.0

### Major Changes

- [#1](https://github.com/MonetizationOS/mos-browser-sdk/pull/1) [`0375b3f`](https://github.com/MonetizationOS/mos-browser-sdk/commit/0375b3f431abed455aff5d403dec95c253446c22) Thanks [@benney](https://github.com/benney)! - First stable release of @monetizationos/browser, the client-side MonetizationOS SDK. It makes a surface decision against the MOS Webscale API with a publishable key and applies the resulting component transformations to the live DOM.

  - Two install paths — ESM createMOS() for bundlers/SPAs, or a single script-tag loader with a call queue (MOS.identify(), decide(), page(), reveal() calls made before load are replayed on boot).
  - Identity — anonymous by default, with JWT via global getter or cookie.
  - Cloaking — content hidden until the decision applies, with a configurable timeout fail-open.
  - Observability — onDecision, onError, and structured onLog telemetry hooks.
