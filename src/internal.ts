// Internal helpers shared across modules; not part of the public API (not re-exported from index).

/** Coerce an unknown thrown value into an `Error`. */
export const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))

/** Timestamp in ms for latency measurement. Prefers monotonic `performance.now()`, falls back to `Date.now()`. */
export const now = (): number => {
    try {
        return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
    } catch {
        return Date.now()
    }
}
