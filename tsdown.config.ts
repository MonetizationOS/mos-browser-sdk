import { defineConfig } from 'tsdown'

// One core, two front doors:
//   - ESM (primary): `dist/index.js` + bundled types for bundler / SPA users.
//   - IIFE (not optional): `dist/mos.iife.js`, the zero-config script-tag install path.
//
// `deps.alwaysBundle` bundles the type-only imports from @monetizationos/proxy and inlines them into
// the emitted `.d.ts`, so consumers don't need the proxy package installed to use our types. Shared
// here so the two builds can never drift on the bundling regex.
const shared = {
    sourcemap: true,
    treeshake: true,
    // onlyBundle:false keeps every non-listed dep external and silences tsdown's "unintended
    // bundling" hint (which fires on each build otherwise).
    deps: { alwaysBundle: [/@monetizationos\/proxy/], onlyBundle: false },
}

export default defineConfig([
    {
        ...shared,
        entry: { index: 'src/index.ts' },
        format: ['esm'],
        platform: 'neutral',
        target: 'es2022',
        dts: true,
        clean: true,
    },
    {
        ...shared,
        entry: { mos: 'src/iife.ts' },
        // tsdown emits `dist/mos.iife.js` for the iife format natively.
        format: ['iife'],
        // The bundle self-initializes and assigns `window.MOS`; this global name is the incidental
        // return binding of the IIFE wrapper and is not part of the public API.
        globalName: 'MOSBrowserBundle',
        platform: 'browser',
        target: 'es2018',
        dts: false,
        minify: true,
    },
])
