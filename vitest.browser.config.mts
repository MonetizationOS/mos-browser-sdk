import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Real headless Chromium smoke suite (acceptance criteria), for the things jsdom cannot verify
// faithfully: real <script> execution from injected `html`, and live iframe/player survival.
// Run with: pnpm test:browser  (requires `pnpm exec playwright install chromium` once).
export default defineConfig({
    test: {
        name: 'browser',
        include: ['test/browser/**/*.spec.ts'],
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
        },
    },
})
