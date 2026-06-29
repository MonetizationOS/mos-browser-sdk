import { getDocument, getLocalStorage } from '../env'
import type { IdentityStore } from './types'

export const DEFAULT_STORE_KEY = 'mos_anon_id'

/** Read a single cookie value by name from `document.cookie`. Returns undefined when absent. */
export const readCookie = (name: string): string | undefined => {
    const doc = getDocument()
    if (!doc) return undefined
    const target = `${name}=`
    for (const part of doc.cookie.split(';')) {
        const trimmed = part.trimStart()
        if (trimmed.startsWith(target)) {
            const raw = trimmed.slice(target.length)
            try {
                return decodeURIComponent(raw)
            } catch {
                return undefined
            }
        }
    }
    return undefined
}

/** Write a first-party, long-lived, readable cookie. SameSite=Lax; not HttpOnly (the SDK must read it). */
const writeCookie = (name: string, value: string): void => {
    const doc = getDocument()
    if (!doc) return
    const oneYear = 60 * 60 * 24 * 365
    doc.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${oneYear}; SameSite=Lax`
}

/** localStorage-backed store. All access is guarded (Safari private mode throws on access). */
export const createLocalStorageStore = (key = DEFAULT_STORE_KEY): IdentityStore => ({
    get() {
        try {
            return getLocalStorage()?.getItem(key) ?? undefined
        } catch {
            return undefined
        }
    },
    set(value) {
        try {
            getLocalStorage()?.setItem(key, value)
        } catch {
            // Storage unavailable/full: persistence is best-effort, never fatal.
        }
    },
})

/** First-party-cookie-backed store. */
export const createCookieStore = (key = DEFAULT_STORE_KEY): IdentityStore => ({
    get() {
        return readCookie(key)
    },
    set(value) {
        writeCookie(key, value)
    },
})

/**
 * Default store: localStorage when available, otherwise a first-party cookie. Reads prefer whichever
 * holds a value so an id minted before storage became available still round-trips.
 */
export const createDefaultStore = (key = DEFAULT_STORE_KEY): IdentityStore => {
    const local = createLocalStorageStore(key)
    const cookie = createCookieStore(key)
    return {
        async get() {
            return (await local.get()) ?? cookie.get()
        },
        set(value) {
            void local.set(value)
            void cookie.set(value)
        },
    }
}
