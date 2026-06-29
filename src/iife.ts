/**
 * IIFE script-tag entry. Self-initializes, exposes `window.MOS` with the same imperative
 * methods, and implements the stub-and-queue loader (the GA/Segment pattern): early
 * `MOS.identify(...)` / `MOS.decide(...)` calls made before this async bundle arrives are queued by
 * a tiny inline stub and replayed here, in order, before the auto-fire decision runs.
 *
 * Inline stub the customer pastes BEFORE the async SDK tag (also documented in the README):
 *
 *   <script>
 *     window.MOS = window.MOS || { q: [] };
 *     ['identify','decide','reveal'].forEach(function (m) {
 *       window.MOS[m] = window.MOS[m] || function () { (window.MOS.q = window.MOS.q || []).push([m, arguments]); };
 *     });
 *   </script>
 */
import { createMOS, type MOSClient } from './createMOS'
import { getWindow } from './env'
import { MOS_GLOBAL, MOS_QUEUE_KEY, MOS_QUEUE_METHODS } from './loader/constants'

type QueuedCall = [string, ArrayLike<unknown>]
interface MOSStub {
    q?: QueuedCall[]
    __mosReady?: boolean
}

const REPLAYABLE = new Set<string>(MOS_QUEUE_METHODS)

const boot = (): void => {
    const win = getWindow()
    if (!win) return // SSR / non-browser: no-op.
    const store = win as unknown as Record<string, (MOSStub & Partial<MOSClient>) | undefined>

    const prior = store[MOS_GLOBAL]
    if (prior?.__mosReady) return // Bundle included twice; keep the first real client.

    const q = prior?.[MOS_QUEUE_KEY]
    const queue: QueuedCall[] = Array.isArray(q) ? (q as QueuedCall[]) : []

    // createMOS reads window.MOSConfig + data-mos-* attributes internally and schedules the auto-fire
    // decision on a microtask / DOMContentLoaded — i.e. after this synchronous boot returns.
    const client = createMOS()

    const exposed = client as unknown as MOSStub & MOSClient
    exposed.__mosReady = true
    store[MOS_GLOBAL] = exposed

    // Replay queued calls synchronously — before the auto-fire microtask — so a queued identify()
    // is applied before the automatic decide() resolves identity.
    for (const [method, args] of queue) {
        if (!REPLAYABLE.has(method)) continue
        const fn = (client as unknown as Record<string, (...a: unknown[]) => unknown>)[method]
        if (typeof fn === 'function') {
            try {
                fn.apply(client, Array.from(args))
            } catch {
                // A replayed call must never break boot; the host observes errors via onError.
            }
        }
    }
}

boot()
