import { SiteConfig } from '../models.js'

/** tiny in-process cache so the public config endpoint doesn't hit Mongo on every page view */
let cache: { at: number; value: Awaited<ReturnType<typeof load>> } | null = null
const TTL_MS = 30_000

async function load() {
  const doc = await SiteConfig.findOneAndUpdate({ key: 'site' }, { $setOnInsert: { key: 'site' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean()
  return doc!
}

export async function getSiteConfig() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  const value = await load()
  cache = { at: Date.now(), value }
  return value
}

export function invalidateSiteConfig() {
  cache = null
}
