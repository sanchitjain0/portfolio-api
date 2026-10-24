import { randomBytes } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ChatLog, Contact, DemoOrder, Event, EVENT_TYPES, Guestbook, Reaction, SiteConfig } from '../models.js'
import { answerQuestion } from '../lib/knowledge.js'
import { dailyVisitorHash, hashIp, looksLikeSpam, underDailyCap } from '../lib/security.js'
import { getSiteConfig } from '../lib/siteConfig.js'

/** Projects that can receive ❤ reactions – keep in sync with the portfolio's project slugs. */
export const REACTION_PROJECTS = [
  'restaurant-ordering-platform',
  'aerospike-resilience',
  'brand-onboarding-saas',
  'snowball',
  'crew-connex',
  'taghawk',
] as const

const startedAt = Date.now()
const id = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`

/** The path a demo order takes through the architecture board (node ids match the portfolio). */
function demoTrace(city: string) {
  const currency = city === 'Almaty' ? 'KZT' : city === 'Cairo' ? 'EGP' : 'AED'
  const ms = () => 2 + Math.floor(Math.random() * 12)
  return [
    { service: 'kiosk', message: `POST /orders  (kiosk, ${city})`, ms: ms() },
    { service: 'gateway', message: 'gateway  ✓ rate limit  ✓ schema', ms: ms() },
    { service: 'cart', message: `cart     totals in ${currency}, precision ok`, ms: ms() },
    { service: 'order', message: `order    idempotency key ${randomBytes(2).toString('hex')}… created`, ms: ms() },
    { service: 'payment', message: 'payment  authorised', ms: 20 + ms() * 2 },
    { service: 'order', message: 'order    status → PAID', ms: ms() },
    { service: 'kafka', message: 'kafka    order.paid published', ms: ms() },
    { service: 'pos', message: 'pos      ticket sent to kitchen', ms: ms() },
    { service: 'delivery', message: `delivery ETA ${18 + Math.floor(Math.random() * 12)} min`, ms: ms() },
  ]
}

export const publicRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const { env } = app
  const ipHash = (ip: string) => hashIp(ip, env.IP_HASH_SALT)

  r.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' as const, version: '1.0.0', uptimeSec: Math.round((Date.now() - startedAt) / 1000) }))

  /* ── contact form ───────────────────────────────────────────────────── */
  r.post(
    '/contact',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        body: z
          .object({
            name: z.string().trim().min(2).max(80),
            email: z.string().trim().email().max(200),
            message: z.string().trim().min(10).max(5000),
            website: z.string().max(0).optional(), // honeypot – must stay empty
          })
          .strict(),
      },
    },
    async (req, reply) => {
      if (!(await underDailyCap(Contact, env.MAX_CONTACTS_PER_DAY))) {
        return reply.code(503).send({ error: { code: 'BUSY', message: 'Too many messages today – please email me directly.' } })
      }
      const { name, email, message } = req.body
      const doc = await Contact.create({
        name,
        email,
        message,
        status: looksLikeSpam(message) ? 'spam' : 'new',
        ipHash: ipHash(req.ip),
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
      })
      return reply.code(201).send({ id: String(doc._id), receivedAt: doc.createdAt.toISOString() })
    },
  )

  /* ── demo order (architecture section) ──────────────────────────────── */
  r.post(
    '/demo/orders',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: { body: z.object({ source: z.enum(['kiosk', 'web']), city: z.string().trim().min(2).max(60) }).strict() },
    },
    async (req, reply) => {
      const orderId = id('ord')
      await DemoOrder.create({ orderId, source: req.body.source, city: req.body.city, ipHash: ipHash(req.ip) })
      return reply.code(201).send({ orderId, status: 'PAID', trace: demoTrace(req.body.city) })
    },
  )

  /* ── "Ask my portfolio" – answered from the local knowledge base ─────── */
  r.post(
    '/ai/ask',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        body: z
          .object({
            question: z.string().trim().min(1).max(500),
            history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).max(12).optional(),
          })
          .strict(),
      },
    },
    async (req) => {
      const { answer, matchedId } = await answerQuestion(req.body.question)
      await ChatLog.create({ question: req.body.question, answer, matchedId, ipHash: ipHash(req.ip) })
      return { answer, model: 'local-knowledge-base' }
    },
  )

  /* ── TagHawk showcase listings (static demo data) ───────────────────── */
  r.get(
    '/taghawk/listings',
    { schema: { querystring: z.object({ community: z.string().max(80).default('Boston University'), limit: z.coerce.number().int().min(1).max(8).default(4) }) } },
    async (req, reply) => {
      const { community, limit } = req.query
      const items = [
        { id: 'l1', title: 'IKEA desk', price: 45, currency: 'USD', community },
        { id: 'l2', title: 'Mini fridge', price: 60, currency: 'USD', community },
        { id: 'l3', title: 'Road bike', price: 180, currency: 'USD', community },
        { id: 'l4', title: 'Bookshelf', price: 25, currency: 'USD', community },
      ].slice(0, limit)
      return reply.header('Cache-Control', 'public, max-age=300').send({ items })
    },
  )

  /* ── site config (availability, banner …) ───────────────────────────── */
  r.get('/public/config', async (_req, reply) => {
    const c = await getSiteConfig()
    return reply.header('Cache-Control', 'public, max-age=60').send({
      available: c.available,
      availabilityText: c.availabilityText,
      currentlyWorkingOn: c.currentlyWorkingOn,
      banner: c.banner?.enabled ? { text: c.banner.text, link: c.banner.link || null } : null,
      guestbookEnabled: c.guestbookEnabled,
    })
  })

  /* ── guestbook ──────────────────────────────────────────────────────── */
  r.get('/guestbook', async (_req, reply) => {
    const items = await Guestbook.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(30).select('name message createdAt').lean()
    return reply
      .header('Cache-Control', 'public, max-age=60')
      .send({ items: items.map((g) => ({ id: String(g._id), name: g.name, message: g.message, createdAt: g.createdAt })) })
  })

  r.post(
    '/guestbook',
    {
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
      schema: {
        body: z
          .object({
            name: z.string().trim().min(2).max(40),
            message: z.string().trim().min(3).max(280),
            website: z.string().max(0).optional(),
          })
          .strict(),
      },
    },
    async (req, reply) => {
      const c = await getSiteConfig()
      if (!c.guestbookEnabled) return reply.code(403).send({ error: { code: 'CLOSED', message: 'The guestbook is closed right now.' } })
      if (!(await underDailyCap(Guestbook, env.MAX_GUESTBOOK_PER_DAY))) {
        return reply.code(503).send({ error: { code: 'BUSY', message: 'Lots of notes today – try again tomorrow.' } })
      }
      const { name, message } = req.body
      const spam = looksLikeSpam(`${name} ${message}`)
      await Guestbook.create({ name, message, status: spam ? 'rejected' : 'pending', ipHash: ipHash(req.ip) })
      return reply.code(201).send({ status: 'pending', message: 'Thanks! Your note will appear once it’s approved.' })
    },
  )

  /* ── project reactions (one ❤ per visitor per project, toggle) ───────── */
  r.get('/reactions', async (req, reply) => {
    const me = ipHash(req.ip)
    const [counts, mine] = await Promise.all([
      Reaction.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$project', n: { $sum: 1 } } }]),
      Reaction.find({ visitorHash: me }).select('project').lean(),
    ])
    return reply.header('Cache-Control', 'private, max-age=30').send({
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
      mine: mine.map((m) => m.project),
    })
  })

  r.post(
    '/reactions',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: z.object({ project: z.enum(REACTION_PROJECTS) }).strict() },
    },
    async (req) => {
      const visitorHash = ipHash(req.ip)
      const { project } = req.body
      const removed = await Reaction.findOneAndDelete({ project, visitorHash })
      if (!removed) {
        try {
          await Reaction.create({ project, visitorHash })
        } catch (err) {
          if ((err as { code?: number }).code !== 11000) throw err // double-click race → already liked
        }
      }
      const count = await Reaction.countDocuments({ project })
      return { project, liked: !removed, count }
    },
  )

  /* ── anonymous analytics ────────────────────────────────────────────── */
  r.post(
    '/events',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        body: z
          .object({
            type: z.enum(EVENT_TYPES),
            label: z.string().trim().max(80).optional(),
            path: z.string().trim().max(120).optional(),
            referrer: z.string().trim().max(120).optional(),
            device: z.enum(['mobile', 'desktop']).optional(),
          })
          .strict(),
      },
    },
    async (req, reply) => {
      if (await underDailyCap(Event, env.MAX_EVENTS_PER_DAY)) {
        await Event.create({ ...req.body, visitorHash: dailyVisitorHash(req.ip, String(req.headers['user-agent'] ?? ''), env.IP_HASH_SALT) })
      }
      return reply.code(202).send({ ok: true })
    },
  )

  // keep SiteConfig referenced so the model registers before the first request
  void SiteConfig
}
