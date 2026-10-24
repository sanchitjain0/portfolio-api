import { createHash } from 'node:crypto'
import type { Model } from 'mongoose'

/** One-way hash so we can rate-limit / dedupe without storing raw IPs. */
export function hashIp(ip: string, salt: string) {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
}

/** Daily-rotating visitor id (IP + user agent + date) – counts unique visitors without tracking anyone across days. */
export function dailyVisitorHash(ip: string, userAgent: string, salt: string) {
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${salt}:${day}:${ip}:${userAgent}`).digest('hex').slice(0, 32)
}

export function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Global safety cap: refuses writes once a collection got `max` new docs today. */
export async function underDailyCap(model: Model<any>, max: number) {
  const count = await model.countDocuments({ createdAt: { $gte: startOfUtcDay() } })
  return count < max
}

/** Escape user input before using it inside a RegExp (search boxes). */
export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const looksLikeSpam = (text: string) => /(https?:\/\/|www\.|\[url|<a\s|\.ru\b|crypto|casino|viagra)/i.test(text)
