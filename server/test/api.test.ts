import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server-core'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/env.js'
import { seedKnowledge } from '../src/lib/knowledge.js'
import { ChatLog, Contact } from '../src/models.js'

const PORTFOLIO = 'https://sanchit-portfolio.vercel.app'
const PASSWORD = 'correct-horse-battery-staple'
let mongo: MongoMemoryServer
let app: FastifyInstance
let cookie = ''

const json = (res: { body: string }) => JSON.parse(res.body)

before(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('portfolio-test'))
  await seedKnowledge()
  const env = loadEnv({
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri(),
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD_HASH: bcrypt.hashSync(PASSWORD, 4),
    JWT_SECRET: 'x'.repeat(40),
    IP_HASH_SALT: 'y'.repeat(20),
    CORS_ORIGINS: `http://localhost:5173,${PORTFOLIO}`,
  })
  app = await buildApp(env)
})

after(async () => {
  await app?.close()
  await mongoose.disconnect()
  await mongo?.stop()
})

describe('public API', () => {
  it('GET /v1/health', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' })
    assert.equal(res.statusCode, 200)
    assert.equal(json(res).status, 'ok')
  })

  it('POST /v1/contact validates, stores and flags spam', async () => {
    const bad = await app.inject({ method: 'POST', url: '/v1/contact', payload: { name: 'J', email: 'nope', message: 'hi' } })
    assert.equal(bad.statusCode, 400)
    assert.equal(json(bad).error.code, 'VALIDATION_ERROR')

    const ok = await app.inject({ method: 'POST', url: '/v1/contact', payload: { name: 'Jane', email: 'jane@co.com', message: 'Hello there, let us talk about a role.' } })
    assert.equal(ok.statusCode, 201)
    assert.match(json(ok).id, /^[a-f0-9]{24}$/)

    const spam = await app.inject({ method: 'POST', url: '/v1/contact', payload: { name: 'Bot', email: 'bot@x.io', message: 'cheap stuff at https://spam.example' } })
    assert.equal(spam.statusCode, 201)
    assert.equal(await Contact.countDocuments({ status: 'spam' }), 1)
  })

  it('rejects honeypot, unknown fields and NoSQL operators', async () => {
    const honeypot = await app.inject({ method: 'POST', url: '/v1/contact', payload: { name: 'Jane', email: 'jane@co.com', message: 'Hello there friend!', website: 'x' } })
    assert.equal(honeypot.statusCode, 400)
    const extra = await app.inject({ method: 'POST', url: '/v1/contact', payload: { name: 'Jane', email: 'jane@co.com', message: 'Hello there friend!', admin: true } })
    assert.equal(extra.statusCode, 400)
    // a fresh IP: the first one has used up its 5 contact messages per hour
    const injection = await app.inject({ method: 'POST', url: '/v1/contact', remoteAddress: '10.0.0.2', payload: { name: 'Jane', email: { $gt: '' }, message: 'Hello there friend!' } })
    assert.equal(injection.statusCode, 400)
  })

  it('ignores a client-forged X-Forwarded-For when rate limiting', async () => {
    // behind Render the proxy appends the real IP last; the forged first entry must not count
    const res = await app.inject({
      method: 'POST',
      url: '/v1/contact',
      remoteAddress: '10.0.0.99',
      headers: { 'x-forwarded-for': '1.2.3.4, 127.0.0.1' },
      payload: { name: 'Jane', email: 'jane@co.com', message: 'Forged header attempt here' },
    })
    assert.equal(res.statusCode, 429) // still counted as 127.0.0.1, which is over its limit
  })

  it('rate-limits the contact form per IP', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/contact', payload: { name: 'Jane', email: 'jane@co.com', message: 'Hello again, sixth try!' } })
    assert.equal(res.statusCode, 429)
    assert.equal(json(res).error.code, 'RATE_LIMITED')
  })

  it('rejects oversized bodies', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/ai/ask', payload: { question: 'a'.repeat(20_000) } })
    assert.equal(res.statusCode, 413)
  })

  it('POST /v1/ai/ask answers from the knowledge base and logs the question', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/ai/ask', payload: { question: 'What is his tech stack?' } })
    assert.equal(res.statusCode, 200)
    assert.match(json(res).answer, /Node\.js/)
    const miss = await app.inject({ method: 'POST', url: '/v1/ai/ask', payload: { question: 'favourite colour?' } })
    assert.match(json(miss).answer, /don't have that one/)
    assert.equal(await ChatLog.countDocuments(), 2)
    assert.equal(await ChatLog.countDocuments({ matchedId: null }), 1)
  })

  it('POST /v1/demo/orders returns a trace of architecture node ids', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/demo/orders', payload: { source: 'kiosk', city: 'Almaty' } })
    assert.equal(res.statusCode, 201)
    const body = json(res)
    assert.equal(body.status, 'PAID')
    assert.equal(body.trace[0].service, 'kiosk')
    assert.match(body.trace[2].message, /KZT/)
  })

  it('reactions toggle one like per visitor and reject unknown projects', async () => {
    const like = await app.inject({ method: 'POST', url: '/v1/reactions', payload: { project: 'taghawk' } })
    assert.deepEqual(json(like), { project: 'taghawk', liked: true, count: 1 })
    const list = json(await app.inject({ method: 'GET', url: '/v1/reactions' }))
    assert.equal(list.counts.taghawk, 1)
    assert.deepEqual(list.mine, ['taghawk'])
    const unlike = await app.inject({ method: 'POST', url: '/v1/reactions', payload: { project: 'taghawk' } })
    assert.deepEqual(json(unlike), { project: 'taghawk', liked: false, count: 0 })
    const bad = await app.inject({ method: 'POST', url: '/v1/reactions', payload: { project: 'whatever' } })
    assert.equal(bad.statusCode, 400)
  })

  it('POST /v1/events accepts known types only', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/v1/events', payload: { type: 'page_view', path: '/', device: 'desktop' } })).statusCode, 202)
    assert.equal((await app.inject({ method: 'POST', url: '/v1/events', payload: { type: 'drop_tables' } })).statusCode, 400)
  })

  it('CORS: allowlisted origin only, never on admin routes', async () => {
    const allowed = await app.inject({ method: 'OPTIONS', url: '/v1/contact', headers: { origin: PORTFOLIO, 'access-control-request-method': 'POST' } })
    assert.equal(allowed.headers['access-control-allow-origin'], PORTFOLIO)
    const evil = await app.inject({ method: 'OPTIONS', url: '/v1/contact', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } })
    assert.equal(evil.headers['access-control-allow-origin'], undefined)
    const admin = await app.inject({ method: 'GET', url: '/v1/admin/stats', headers: { origin: PORTFOLIO } })
    assert.equal(admin.headers['access-control-allow-origin'], undefined)
  })
})

describe('admin', () => {
  it('blocks admin routes without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/stats' })
    assert.equal(res.statusCode, 401)
  })

  it('rejects wrong credentials and logs in with the right ones', async () => {
    const wrong = await app.inject({ method: 'POST', url: '/v1/admin/auth/login', payload: { username: 'admin', password: 'nope' } })
    assert.equal(wrong.statusCode, 401)
    const ok = await app.inject({ method: 'POST', url: '/v1/admin/auth/login', payload: { username: 'admin', password: PASSWORD } })
    assert.equal(ok.statusCode, 200)
    const setCookie = String(ok.headers['set-cookie'])
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /SameSite=Strict/i)
    cookie = setCookie.split(';')[0]
  })

  it('serves stats with a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/stats', headers: { cookie } })
    assert.equal(res.statusCode, 200)
    const body = json(res)
    assert.equal(body.totals.unanswered30, 1)
    assert.equal(body.series.views.length, 14)
  })

  it('requires the CSRF header on writes', async () => {
    const res = await app.inject({ method: 'PUT', url: '/v1/admin/config', headers: { cookie }, payload: {} })
    assert.equal(res.statusCode, 403)
  })

  it('updates site config and the public endpoint reflects it', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/config',
      headers: { cookie, 'x-requested-with': 'dashboard' },
      payload: {
        available: false,
        availabilityText: 'Not looking right now',
        currentlyWorkingOn: 'Multi-tenant onboarding SaaS',
        banner: { enabled: true, text: 'New write-up is out', link: 'https://example.com/post' },
        guestbookEnabled: true,
      },
    })
    assert.equal(res.statusCode, 200)
    const pub = json(await app.inject({ method: 'GET', url: '/v1/public/config' }))
    assert.equal(pub.available, false)
    assert.equal(pub.banner.text, 'New write-up is out')
  })

  it('guestbook notes stay hidden until approved', async () => {
    const post = await app.inject({ method: 'POST', url: '/v1/guestbook', payload: { name: 'Ana', message: 'Love the 3D room!' } })
    assert.equal(post.statusCode, 201)
    assert.equal(json(await app.inject({ method: 'GET', url: '/v1/guestbook' })).items.length, 0)
    const pending = json(await app.inject({ method: 'GET', url: '/v1/admin/guestbook?status=pending', headers: { cookie } }))
    assert.equal(pending.total, 1)
    const id = pending.items[0]._id
    const approve = await app.inject({ method: 'PATCH', url: `/v1/admin/guestbook/${id}`, headers: { cookie, 'x-requested-with': 'dashboard' }, payload: { status: 'approved' } })
    assert.equal(approve.statusCode, 200)
    const pub = json(await app.inject({ method: 'GET', url: '/v1/guestbook' }))
    assert.equal(pub.items[0].message, 'Love the 3D room!')
  })

  it('knowledge base CRUD changes chat answers', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/knowledge',
      headers: { cookie, 'x-requested-with': 'dashboard' },
      payload: { slug: 'hobbies', question: 'What are his hobbies?', keywords: ['hobby', 'hobbies', 'free time'], answer: 'Gaming and 3D.', enabled: true },
    })
    assert.equal(created.statusCode, 201)
    const ans = json(await app.inject({ method: 'POST', url: '/v1/ai/ask', payload: { question: 'what does he do in his free time' } }))
    assert.equal(ans.answer, 'Gaming and 3D.')
  })

  it('contacts inbox: search, update status, rejects bad ids', async () => {
    const list = json(await app.inject({ method: 'GET', url: '/v1/admin/contacts?q=jane', headers: { cookie } }))
    assert.equal(list.total, 1)
    const id = list.items[0]._id
    const upd = await app.inject({ method: 'PATCH', url: `/v1/admin/contacts/${id}`, headers: { cookie, 'x-requested-with': 'dashboard' }, payload: { status: 'replied', note: 'Called back' } })
    assert.equal(json(upd).status, 'replied')
    const bad = await app.inject({ method: 'PATCH', url: '/v1/admin/contacts/not-an-id', headers: { cookie, 'x-requested-with': 'dashboard' }, payload: { status: 'read' } })
    assert.equal(bad.statusCode, 400)
  })

  it('exports data as a JSON download', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/export', headers: { cookie } })
    assert.equal(res.statusCode, 200)
    assert.match(String(res.headers['content-disposition']), /attachment; filename="portfolio-export-/)
    const body = json(res)
    assert.ok(Array.isArray(body.contacts) && body.contacts.length >= 1)
    assert.equal(body.contacts[0].ipHash, undefined)
  })

  it('locks out brute-force login attempts', async () => {
    let last = 0
    for (let i = 0; i < 6; i++) {
      last = (await app.inject({ method: 'POST', url: '/v1/admin/auth/login', payload: { username: 'admin', password: 'guess' + i } })).statusCode
    }
    assert.equal(last, 429)
  })
})
