// Zero-dependency dev server + proxy for the local sandbox (examples/sandbox.html).
//
// Serves the repo over http://localhost so the built ESM bundle and the page are same-origin, and
// proxies two upstreams so the browser never makes a cross-origin request (sidestepping CORS, which
// neither the MOS API nor the demo origin is guaranteed to send):
//   POST/GET /api/*     → MOS_API     (default https://api.monetizationos.com) — real pk_ decisions
//   GET      /origin/*  → MOS_ORIGIN  (default https://news.wingorigin.dev)    — real demo content
//
// Usage (normally via `pnpm sandbox`):  node scripts/serve.mjs
//   env: PORT, MOS_API, MOS_ORIGIN

import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const ROOT = resolve('.')
const PORT = Number(process.env.PORT ?? 5173)
const MOS_API = (process.env.MOS_API ?? 'https://api.monetizationos.com').replace(/\/$/, '')
const MOS_ORIGIN = (process.env.MOS_ORIGIN ?? 'https://news.wingorigin.dev').replace(/\/$/, '')
const ENTRY = '/examples/sandbox.html'

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
}

// Hop-by-hop / origin headers we must not forward upstream.
const DROP = new Set(['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding'])

const readBody = async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD') return undefined
    const chunks = []
    for await (const c of req) chunks.push(c)
    return chunks.length ? Buffer.concat(chunks) : undefined
}

// Make a proxied page renderable inside the same-origin sandbox iframe: route its root-relative
// asset URLs (`/foo`) back through `/origin/foo`, and strip the origin's own scripts so only the
// static content + CSS render (and our injected IIFE is the only script that runs).
const rewriteHtml = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/=(["'])\/(?!\/)/g, '=$1/origin/')
const rewriteCss = (css) =>
    css.replace(/url\((\s*["']?)\/(?!\/)/g, 'url($1/origin/').replace(/@import\s+(["'])\/(?!\/)/g, '@import $1/origin/')

const proxy = async (req, res, targetUrl, { rewriteAssets = false } = {}) => {
    const headers = {}
    for (const [k, v] of Object.entries(req.headers)) if (!DROP.has(k.toLowerCase()) && v != null) headers[k] = String(v)
    let upstream
    try {
        upstream = await fetch(targetUrl, { method: req.method, headers, body: await readBody(req), redirect: 'follow' })
    } catch (error) {
        res.writeHead(502, { 'Content-Type': 'text/plain' }).end(`proxy error: ${error instanceof Error ? error.message : error}`)
        return
    }
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'
    // Rewrite HTML/CSS so the iframe renders; pass everything else (incl. /api JSON, images) untouched.
    let body
    if (rewriteAssets && /text\/html/i.test(contentType)) body = rewriteHtml(await upstream.text())
    else if (rewriteAssets && /text\/css/i.test(contentType)) body = rewriteCss(await upstream.text())
    else body = Buffer.from(await upstream.arrayBuffer())
    res.writeHead(upstream.status, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })
    res.end(body)
}

const serveStatic = async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    const rel = urlPath === '/' ? ENTRY : normalize(urlPath)
    const filePath = join(ROOT, rel)
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden')
        return
    }
    try {
        const info = await stat(filePath).catch(() => null)
        const target = info?.isDirectory() ? join(filePath, 'index.html') : filePath
        const body = await readFile(target)
        res.writeHead(200, { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
        res.end(body)
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found')
    }
}

const server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
        }).end()
        return
    }
    if (url.startsWith('/api/')) {
        void proxy(req, res, MOS_API + url)
        return
    }
    if (url.startsWith('/origin/')) {
        void proxy(req, res, MOS_ORIGIN + url.slice('/origin'.length), { rewriteAssets: true })
        return
    }
    void serveStatic(req, res)
})

server.listen(PORT, () => {
    process.stdout.write(
        `\n  MOS sandbox → http://localhost:${PORT}${ENTRY}\n  proxy: /api/* → ${MOS_API}   /origin/* → ${MOS_ORIGIN}\n  (Ctrl+C to stop)\n\n`,
    )
})
