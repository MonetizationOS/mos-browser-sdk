import { defineConfig } from 'vitest/config'

// Unit suite: jsdom-backed, the bulk of the logic (config, identity, decision, applicator, cloak).
// The real-browser smoke suite lives in vitest.browser.config.mts so unit runs never load the
// Playwright provider or require a downloaded browser.
export default defineConfig({
    test: {
        name: 'unit',
        include: ['test/**/*.spec.ts'],
        exclude: ['test/browser/**', 'node_modules/**'],
        environment: 'jsdom',
    },
})
