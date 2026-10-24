import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { hasZodFastifySchemaValidationErrors, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { Env } from './env.js'
import { publicRoutes } from './routes/public.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes, SESSION_COOKIE } from './routes/auth.js'

declare module 'fastify' {
  interface FastifyInstance {
    env: Env
  }
}

const here = dirname(fileURLToPath(import.meta.url))
/** the dashboard build is copied here by `npm run build` */
const DASHBOARD_DIR = join(here, '..', 'public', 'admin')

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'debug', redact: ['req.headers.cookie', 'req.headers.authorization'] },
    // trust only Render's own proxy hop(s): a client-supplied X-Forwarded-For can't spoof its IP to dodge rate limits
    trustProxy: (_address: string, hop: number) => hop < env.TRUST_PROXY_HOPS,
    bodyLimit: 16 * 1024,
  })
  app.decorate('env', env)
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  /* ── security headers ─────────────────────────────────────────────────── */
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // the portfolio (another origin) reads the public API
  })

  /* ── rate limiting: generous global default, tighter per route ───────── */
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: { code: 'RATE_LIMITED', message: `Too many requests – try again in ${Math.ceil(ctx.ttl / 1000)}s.` },
    }),
  })

  await app.register(cookie)
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    sign: { expiresIn: '8h' },
  })

  /* ── errors: never leak internals ─────────────────────────────────────── */
  app.setErrorHandler((error, req, reply) => {
    const err = error as Error & { statusCode?: number }
    if (hasZodFastifySchemaValidationErrors(err)) {
      const first = err.validation[0]
      const field = first?.instancePath?.replace(/^\//, '') || 'request'
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: `${field}: ${first?.message ?? 'invalid'}` } })
    }
    const status = err.statusCode ?? 500
    if (status === 429) return reply.code(429).send(err)
    if (status >= 500) req.log.error(err)
    return reply.code(status).send({ error: { code: status >= 500 ? 'INTERNAL' : 'BAD_REQUEST', message: status >= 500 ? 'Something went wrong.' : err.message } })
  })

  /* ── public API (CORS-allowlisted for the portfolio) ─────────────────── */
  await app.register(
    async (pub) => {
      await pub.register(cors, {
        origin: (origin, cb) => {
          // allow same-origin / server-to-server (no Origin header) and the allowlist
          if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true)
          cb(null, false)
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Accept'],
        maxAge: 86400,
      })
      await pub.register(publicRoutes)
    },
    { prefix: '/v1' },
  )

  /* ── admin API (same-origin only: no CORS, SameSite=Strict cookie) ───── */
  await app.register(authRoutes, { prefix: '/v1/admin/auth' })
  await app.register(adminRoutes, { prefix: '/v1/admin' })

  /* ── dashboard (static React build at /admin) ────────────────────────── */
  if (existsSync(DASHBOARD_DIR)) {
    await app.register(fastifyStatic, { root: DASHBOARD_DIR, prefix: '/admin/', decorateReply: true, maxAge: '1h' })
  }
  app.get('/', { config: { rateLimit: false } }, (_req, reply) => reply.redirect('/admin/'))

  app.setNotFoundHandler((req, reply) => {
    // SPA fallback for dashboard routes
    if (req.method === 'GET' && req.url.startsWith('/admin') && existsSync(join(DASHBOARD_DIR, 'index.html'))) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html', DASHBOARD_DIR)
    }
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not found' } })
  })

  return app
}
