import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { Audit, ChatLog, Contact, DemoOrder, Event, Guestbook, Knowledge, Reaction, SiteConfig } from '../models.js'
import { escapeRegex, hashIp } from '../lib/security.js'
import { invalidateSiteConfig, getSiteConfig } from '../lib/siteConfig.js'
import { requireAdmin } from './auth.js'

const objectId = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'invalid id') })
const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
const DAY = 86_400_000

/** counts per day for the last `days` days (UTC), zero-filled */
async function perDay(model: { aggregate: typeof Event.aggregate }, days: number, match: Record<string, unknown> = {}) {
  const since = new Date(Date.now() - (days - 1) * DAY)
  since.setUTCHours(0, 0, 0, 0)
  const rows = await model.aggregate<{ _id: string; n: number }>([
    { $match: { ...match, createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } },
  ])
  const byDay = new Map(rows.map((r) => [r._id, r.n]))
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10)
    return { day: d, count: byDay.get(d) ?? 0 }
  })
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  // onRequest: authenticate before body parsing/validation even runs
  app.addHook('onRequest', requireAdmin)
  const audit = (action: string, detail: string, ip: string) => Audit.create({ action, detail, ipHash: hashIp(ip, app.env.IP_HASH_SALT) })

  /* ── overview ───────────────────────────────────────────────────────── */
  r.get('/stats', async () => {
    const since30 = new Date(Date.now() - 30 * DAY)
    const [
      contactsNew,
      contactsTotal,
      guestbookPending,
      chats30,
      unanswered30,
      orders30,
      reactions,
      visitors30,
      pageViews30,
      resumeDownloads30,
      topSections,
      topQuestions,
      devices,
      referrers,
      views,
      chats,
      contacts,
    ] = await Promise.all([
      Contact.countDocuments({ status: 'new' }),
      Contact.countDocuments({ status: { $ne: 'spam' } }),
      Guestbook.countDocuments({ status: 'pending' }),
      ChatLog.countDocuments({ createdAt: { $gte: since30 } }),
      ChatLog.countDocuments({ createdAt: { $gte: since30 }, matchedId: null }),
      DemoOrder.countDocuments({ createdAt: { $gte: since30 } }),
      Reaction.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$project', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
      Event.distinct('visitorHash', { createdAt: { $gte: since30 } }).then((v) => v.length),
      Event.countDocuments({ type: 'page_view', createdAt: { $gte: since30 } }),
      Event.countDocuments({ type: 'resume_download', createdAt: { $gte: since30 } }),
      Event.aggregate<{ _id: string; n: number }>([
        { $match: { type: 'section_view', createdAt: { $gte: since30 } } },
        { $group: { _id: '$label', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 10 },
      ]),
      ChatLog.aggregate<{ _id: string; n: number; answered: number }>([
        { $match: { createdAt: { $gte: since30 } } },
        { $group: { _id: { $toLower: '$question' }, n: { $sum: 1 }, answered: { $sum: { $cond: [{ $ne: ['$matchedId', null] }, 1, 0] } } } },
        { $sort: { n: -1 } },
        { $limit: 8 },
      ]),
      Event.aggregate<{ _id: string; n: number }>([{ $match: { type: 'page_view', createdAt: { $gte: since30 } } }, { $group: { _id: '$device', n: { $sum: 1 } } }]),
      Event.aggregate<{ _id: string; n: number }>([
        { $match: { type: 'page_view', createdAt: { $gte: since30 }, referrer: { $nin: [null, ''] } } },
        { $group: { _id: '$referrer', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 6 },
      ]),
      perDay(Event, 14, { type: 'page_view' }),
      perDay(ChatLog, 14),
      perDay(Contact, 14),
    ])
    return {
      totals: { contactsNew, contactsTotal, guestbookPending, chats30, unanswered30, orders30, visitors30, pageViews30, resumeDownloads30 },
      reactions: reactions.map((x) => ({ project: x._id, count: x.n })),
      topSections: topSections.map((x) => ({ label: x._id ?? '(none)', count: x.n })),
      topQuestions: topQuestions.map((x) => ({ question: x._id, count: x.n, answered: x.answered > 0 })),
      devices: devices.map((x) => ({ device: x._id ?? 'unknown', count: x.n })),
      referrers: referrers.map((x) => ({ referrer: x._id, count: x.n })),
      series: { views, chats, contacts },
    }
  })

  /* ── contacts inbox ─────────────────────────────────────────────────── */
  const contactStatus = z.enum(['new', 'read', 'replied', 'archived', 'spam'])
  r.get('/contacts', { schema: { querystring: page.extend({ status: contactStatus.optional(), q: z.string().max(100).optional() }) } }, async (req) => {
    const { page: p, limit, status, q } = req.query
    const filter: Record<string, unknown> = {}
    if (status) filter.status = status
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i')
      filter.$or = [{ name: rx }, { email: rx }, { message: rx }]
    }
    const [items, total] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).select('-ipHash').lean(),
      Contact.countDocuments(filter),
    ])
    return { items, total, page: p, limit }
  })

  r.patch(
    '/contacts/:id',
    { schema: { params: objectId, body: z.object({ status: contactStatus.optional(), note: z.string().max(2000).optional() }).strict() } },
    async (req, reply) => {
      const doc = await Contact.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).select('-ipHash').lean()
      if (!doc) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Message not found' } })
      return doc
    },
  )

  r.delete('/contacts/:id', { schema: { params: objectId } }, async (req) => {
    await Contact.findByIdAndDelete(req.params.id)
    await audit('contact.delete', req.params.id, req.ip)
    return { ok: true }
  })

  /* ── chat logs ──────────────────────────────────────────────────────── */
  r.get(
    '/chats',
    { schema: { querystring: page.extend({ filter: z.enum(['all', 'unanswered', 'flagged']).default('all') }) } },
    async (req) => {
      const { page: p, limit, filter } = req.query
      const f = filter === 'unanswered' ? { matchedId: null } : filter === 'flagged' ? { flagged: true } : {}
      const [items, total] = await Promise.all([
        ChatLog.find(f).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).select('-ipHash').lean(),
        ChatLog.countDocuments(f),
      ])
      return { items, total, page: p, limit }
    },
  )
  r.patch('/chats/:id', { schema: { params: objectId, body: z.object({ flagged: z.boolean() }).strict() } }, async (req) => {
    await ChatLog.updateOne({ _id: req.params.id }, { $set: { flagged: req.body.flagged } })
    return { ok: true }
  })
  r.delete('/chats/:id', { schema: { params: objectId } }, async (req) => {
    await ChatLog.findByIdAndDelete(req.params.id)
    return { ok: true }
  })

  /* ── guestbook moderation ───────────────────────────────────────────── */
  const gbStatus = z.enum(['pending', 'approved', 'rejected'])
  r.get('/guestbook', { schema: { querystring: page.extend({ status: gbStatus.optional() }) } }, async (req) => {
    const { page: p, limit, status } = req.query
    const f = status ? { status } : {}
    const [items, total] = await Promise.all([
      Guestbook.find(f).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).select('-ipHash').lean(),
      Guestbook.countDocuments(f),
    ])
    return { items, total, page: p, limit }
  })
  r.patch('/guestbook/:id', { schema: { params: objectId, body: z.object({ status: gbStatus }).strict() } }, async (req) => {
    await Guestbook.updateOne({ _id: req.params.id }, { $set: { status: req.body.status } })
    await audit('guestbook.' + req.body.status, req.params.id, req.ip)
    return { ok: true }
  })
  r.delete('/guestbook/:id', { schema: { params: objectId } }, async (req) => {
    await Guestbook.findByIdAndDelete(req.params.id)
    return { ok: true }
  })

  /* ── site config ────────────────────────────────────────────────────── */
  r.get('/config', async () => getSiteConfig())
  r.put(
    '/config',
    {
      schema: {
        body: z
          .object({
            available: z.boolean(),
            availabilityText: z.string().trim().max(120),
            currentlyWorkingOn: z.string().trim().max(160),
            banner: z.object({
              enabled: z.boolean(),
              text: z.string().trim().max(160),
              link: z.union([z.literal(''), z.string().trim().url().max(300).refine((u) => u.startsWith('https://'), 'link must start with https://')]),
            }),
            guestbookEnabled: z.boolean(),
          })
          .strict(),
      },
    },
    async (req) => {
      const doc = await SiteConfig.findOneAndUpdate({ key: 'site' }, { $set: req.body }, { upsert: true, new: true }).lean()
      invalidateSiteConfig()
      await audit('config.update', '', req.ip)
      return doc
    },
  )

  /* ── knowledge base for the chat ────────────────────────────────────── */
  const kbBody = z
    .object({
      slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'lowercase letters, numbers and dashes'),
      question: z.string().trim().min(3).max(200),
      keywords: z.array(z.string().trim().min(1).max(40)).max(30),
      answer: z.string().trim().min(3).max(1200),
      enabled: z.boolean(),
    })
    .strict()
  r.get('/knowledge', async () => ({ items: await Knowledge.find().sort({ hits: -1, slug: 1 }).lean() }))
  r.post('/knowledge', { schema: { body: kbBody } }, async (req, reply) => {
    if (await Knowledge.exists({ slug: req.body.slug })) return reply.code(409).send({ error: { code: 'DUPLICATE', message: 'Slug already exists' } })
    const doc = await Knowledge.create(req.body)
    await audit('knowledge.create', req.body.slug, req.ip)
    return reply.code(201).send(doc)
  })
  r.put('/knowledge/:id', { schema: { params: objectId, body: kbBody } }, async (req, reply) => {
    const doc = await Knowledge.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true }).lean()
    if (!doc) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Entry not found' } })
    await audit('knowledge.update', req.body.slug, req.ip)
    return doc
  })
  r.delete('/knowledge/:id', { schema: { params: objectId } }, async (req) => {
    await Knowledge.findByIdAndDelete(req.params.id)
    await audit('knowledge.delete', req.params.id, req.ip)
    return { ok: true }
  })

  /* ── export (manual backup – Atlas free tier has no automatic backups) ── */
  r.get('/export', async (req, reply) => {
    const [contacts, guestbook, knowledge, config, reactions] = await Promise.all([
      Contact.find().select('-ipHash').lean(),
      Guestbook.find().select('-ipHash').lean(),
      Knowledge.find().lean(),
      SiteConfig.find().lean(),
      Reaction.aggregate([{ $group: { _id: '$project', count: { $sum: 1 } } }]),
    ])
    await audit('export', '', req.ip)
    const stamp = new Date().toISOString().slice(0, 10)
    return reply
      .header('Content-Disposition', `attachment; filename="portfolio-export-${stamp}.json"`)
      .header('Cache-Control', 'no-store')
      .send({ exportedAt: new Date().toISOString(), contacts, guestbook, knowledge, config, reactions })
  })

  /* ── audit log ──────────────────────────────────────────────────────── */
  r.get('/audit', async () => ({ items: await Audit.find().sort({ createdAt: -1 }).limit(50).select('-ipHash').lean() }))
}
