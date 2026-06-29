/**
 * The stub-and-queue contract, shared by the IIFE bootstrap ({@link ../iife}) and the copy-paste
 * loader snippet ({@link ./snippet}). Both must agree on the global name, the queue key, and the set
 * of queueable methods, or a queued call would be dropped on replay — so they live here, once.
 */

/** The `window` property the client is exposed on and the stub queues onto. */
export const MOS_GLOBAL = 'MOS'

/** The array of pending `[method, args]` calls the stub pushes and the bootstrap replays. */
export const MOS_QUEUE_KEY = 'q'

/** Imperative methods the stub shims before the bundle loads; the bootstrap replays only these. */
export const MOS_QUEUE_METHODS = ['identify', 'decide', 'reveal'] as const

/** `id` of the injected `<script>`, used to guard against injecting the bundle twice. */
export const MOS_SDK_SCRIPT_ID = 'mos-sdk'

/** Default hosted IIFE bundle URL the loader injects. */
export const DEFAULT_SDK_SRC = 'https://assets.monetizationos.com/browser/v1.js'
