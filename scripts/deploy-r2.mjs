#!/usr/bin/env node
/**
 * Deploys the built IIFE bundle to the R2 bucket behind the public CDN.
 *
 * Uploads two copies of `dist/mos.iife.js`:
 *   - `browser/v1.js`          — the mutable channel URL embedded in customer snippets.
 *                                Short browser TTL, long edge TTL; the edge is purged below
 *                                so updates land within seconds of a release.
 *   - `browser/v<version>.js`  — an immutable copy per release, for pinning and rollback.
 *
 * The channel is derived from the package major version; pre-1.0 releases ship to the `v1`
 * channel because that is the URL already documented in the install snippet.
 *
 * Sourcemaps are not deployed — the trailing sourceMappingURL comment is stripped so devtools
 * don't request a map that isn't there. Maps for each release live in the npm package.
 *
 * Required env: R2_BUCKET, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 * Optional env: CLOUDFLARE_ZONE_ID (skips cache purge when absent),
 *               CDN_BASE_URL (default https://assets.monetizationos.com)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const bucket = process.env.R2_BUCKET
if (!bucket) {
    console.error('deploy-r2: R2_BUCKET is not set')
    process.exit(1)
}
for (const name of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) {
    if (!process.env[name]) {
        console.error(`deploy-r2: ${name} is not set`)
        process.exit(1)
    }
}

const major = Number(pkg.version.split('.')[0])
const channel = `v${major || 1}`

const bundle = readFileSync(resolve(root, 'dist/mos.iife.js'), 'utf8')
const staged = join(mkdtempSync(join(tmpdir(), 'deploy-r2-')), 'mos.js')
writeFileSync(staged, bundle.replace(/\/\/# sourceMappingURL=\S+\s*$/, ''))

const uploads = [
    // Channel file: browsers re-check every 5 minutes; the edge holds it until we purge.
    { key: `browser/${channel}.js`, cacheControl: 'public, max-age=300, s-maxage=31536000, stale-while-revalidate=60' },
    // Pinned copy: content never changes for a given version, so cache it forever.
    { key: `browser/v${pkg.version}.js`, cacheControl: 'public, max-age=31536000, immutable' },
]

for (const { key, cacheControl } of uploads) {
    console.log(`deploy-r2: put ${bucket}/${key}`)
    execFileSync(
        'pnpm',
        [
            'dlx',
            'wrangler@4',
            'r2',
            'object',
            'put',
            `${bucket}/${key}`,
            '--file',
            staged,
            '--content-type',
            'application/javascript; charset=utf-8',
            '--cache-control',
            cacheControl,
            '--remote',
        ],
        { stdio: 'inherit' },
    )
}

const zoneId = process.env.CLOUDFLARE_ZONE_ID
if (!zoneId) {
    console.warn('deploy-r2: CLOUDFLARE_ZONE_ID not set, skipping cache purge')
    process.exit(0)
}

const baseUrl = (process.env.CDN_BASE_URL ?? 'https://assets.monetizationos.com').replace(/\/$/, '')
const channelUrl = `${baseUrl}/browser/${channel}.js`
console.log(`deploy-r2: purging ${channelUrl}`)

const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: {
        authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'content-type': 'application/json',
    },
    body: JSON.stringify({ files: [channelUrl] }),
})
const result = await response.json()
if (!result.success) {
    console.error(`deploy-r2: cache purge failed: ${JSON.stringify(result.errors)}`)
    process.exit(1)
}
console.log(`deploy-r2: released ${pkg.version} to ${channelUrl}`)
