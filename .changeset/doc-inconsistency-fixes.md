---
"@monetizationos/browser": minor
---

Rename `publishableKey` to `publicKey`, plus README/source inconsistency fixes:

- The config key is now `publicKey`, matching the console's "public key" terminology and the `pk_*` prefix. `publishableKey` keeps working as a deprecated alias (`publicKey` wins when both are set) and will be removed in a future version. The `data-mos-pk` attribute and the loader snippet's `pk` shorthand are unchanged.
- `ExplicitIdentity` no longer accepts a bare JWT string — pass `{ userJwt }` to `identify()`. The string form was never documented or shown in any example.
- An invalid `data-mos-timeout` / `data-mos-cloak-timeout` attribute (non-numeric, zero, negative, or blank) now emits a warn-level `config:invalid-timeout` event on `onLog` instead of being dropped silently; the default timeout still applies, as before.
- `storeKind` JSDoc now documents the real default (the combined localStorage + first-party-cookie store, not plain localStorage), and the README logging examples are valid JavaScript.
