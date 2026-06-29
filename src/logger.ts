import type { MOSLogEvent, MOSLogger, MOSLogLevel } from './config/types'

// Opt-in console logger. The SDK core never writes to `console` — it only emits structured events to
// the `onLog` hook. This is a ready-made `MOSLogger` a host can pass explicitly when it wants those
// events printed: `createMOS({ onLog: consoleLogger })`.

const LEVEL_ORDER: Record<MOSLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface ConsoleLoggerOptions {
    /** Minimum level to print. Default `'debug'` (everything). */
    level?: MOSLogLevel
    /** Line prefix. Default `'[mos]'`. */
    prefix?: string
}

/** Build a console-backed {@link MOSLogger}, optionally filtered by level. */
export const createConsoleLogger = (options: ConsoleLoggerOptions = {}): MOSLogger => {
    const min = LEVEL_ORDER[options.level ?? 'debug']
    const prefix = options.prefix ?? '[mos]'
    return (event: MOSLogEvent): void => {
        if (LEVEL_ORDER[event.level] < min) return
        const fn = (console[event.level] ?? console.log).bind(console)
        const line = `${prefix} ${event.code}: ${event.message}`
        if (event.context) fn(line, event.context)
        else fn(line)
    }
}

/** Default console logger: all levels, `[mos]` prefix. Pass to `createMOS({ onLog: consoleLogger })`. */
export const consoleLogger: MOSLogger = createConsoleLogger()
