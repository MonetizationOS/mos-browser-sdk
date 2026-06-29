/**
 * SSR-safe global access.
 *
 * Every `window` / `document` / `navigator` / `localStorage` touch in the SDK must go through this
 * module. Importing the SDK in a server bundle must never throw and must no-op until it runs in a
 * browser. This follows the defensive global-access pattern in the proxy's `getClientRuntime`:
 * bare global access is wrapped so sandboxed runtimes that throw on property access fall through to
 * a safe "not a browser" answer rather than crashing.
 */

/** True only when a usable DOM is present. The single gate the rest of the SDK branches on. */
export const isBrowser = (): boolean => {
    try {
        return typeof window !== 'undefined' && typeof document !== 'undefined' && !!window.document
    } catch {
        return false
    }
}

/** The global `window`, or `undefined` outside a browser. Never throws. */
export const getWindow = (): (Window & typeof globalThis) | undefined => {
    try {
        return typeof window !== 'undefined' ? window : undefined
    } catch {
        return undefined
    }
}

/** The global `document`, or `undefined` outside a browser. Never throws. */
export const getDocument = (): Document | undefined => {
    try {
        return typeof document !== 'undefined' ? document : undefined
    } catch {
        return undefined
    }
}

/** The current `location`, or `undefined` outside a browser. Never throws. */
export const getLocation = (): Location | undefined => {
    try {
        return typeof location !== 'undefined' ? location : undefined
    } catch {
        return undefined
    }
}

/**
 * `localStorage`, or `undefined` when unavailable. Access can throw even in a browser — Safari
 * private mode and cookie-blocked contexts throw on the getter itself — so this is fully guarded.
 */
export const getLocalStorage = (): Storage | undefined => {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : undefined
    } catch {
        return undefined
    }
}
