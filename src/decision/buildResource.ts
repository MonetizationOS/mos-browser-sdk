import type { PageMetadata, Resource } from '@monetizationos/proxy'
import { getDocument, getLocation } from '../env'

/**
 * Read page metadata the same way the proxy does: every `<meta name|property → content>`
 * read live from `document`. Matches the proxy's `parsePageMetadata` (key = `name ?? property`).
 */
export const readPageMetadata = (doc: Document): PageMetadata => {
    const metadata: PageMetadata = {}
    for (const element of Array.from(doc.querySelectorAll('meta'))) {
        const key = element.getAttribute('name') ?? element.getAttribute('property')
        const value = element.getAttribute('content')
        if (key && value !== null) metadata[key] = value
    }
    return metadata
}

/** A host-supplied provider that adds/overrides resource fields, merged shallowly over the defaults. */
export type ResourceProviderFn = () => Partial<Resource> & Record<string, unknown>

export interface BuildResourceArgs {
    /** A `resource` argument passed to `decide(resource?)` — highest precedence, merged last. */
    override?: Partial<Resource> & Record<string, unknown>
    /** A configured resource-provider hook, merged over the derived defaults. */
    provider?: ResourceProviderFn
}

/**
 * Build the resource at call time: `id = location.pathname`, `meta` = live page metadata.
 * Merging is shallow and matches the proxy's `ResourceProvider`: defaults < provider() < override.
 * `id` carries the path independently of any `http` block, so path-based decisioning still works in
 * `pk_` mode.
 */
export const buildResource = ({ override, provider }: BuildResourceArgs = {}): Resource => {
    const loc = getLocation()
    const doc = getDocument()
    const base: Resource = {
        id: loc?.pathname ?? '/',
        meta: doc ? readPageMetadata(doc) : {},
    }
    const provided = provider ? safeProvider(provider) : undefined
    return { ...base, ...provided, ...override }
}

const safeProvider = (provider: ResourceProviderFn): Partial<Resource> | undefined => {
    try {
        return provider()
    } catch {
        // A throwing provider must not break the decision; fall back to derived defaults.
        return undefined
    }
}
