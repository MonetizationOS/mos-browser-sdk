/**
 * Browser SDK package version, sent on every decision request as a header so the server can
 * reason about client capability and add response blocks without breaking older SDK versions.
 *
 * Kept as a hand-maintained constant rather than importing package.json so the value survives
 * tree-shaking and the SSR-safe build with no JSON-module resolution at runtime.
 */
export const BROWSER_PACKAGE_VERSION = '1.0.0'

/** Header carrying {@link BROWSER_PACKAGE_VERSION}. */
export const BROWSER_PACKAGE_VERSION_HEADER = 'X-MOS-Browser-Version'
