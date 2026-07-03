---
"@monetizationos/browser": major
---

First stable release of @monetizationos/browser, the client-side MonetizationOS SDK. It makes a surface decision against the MOS Webscale API with a publishable key and applies the resulting component transformations to the live DOM.

- Two install paths — ESM createMOS() for bundlers/SPAs, or a single script-tag loader with a call queue (MOS.identify(), decide(), page(), reveal() calls made before load are replayed on boot).
- Identity — anonymous by default, with JWT via global getter or cookie.
- Cloaking — content hidden until the decision applies, with a configurable timeout fail-open.
- Observability — onDecision, onError, and structured onLog telemetry hooks.
