import { timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { Audit } from '../models.js'
import { hashIp } from '../lib/security.js'

export const SESSION_COOKIE = 'admin_session'
const SESSION_HOURS = 8
/** used when the username is wrong, so a bad username takes as long as a bad password */
const DUMMY_HASH = bcrypt.hashSync('not-the-password', 12)

function sameString(a: string, b: string) {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** onRequest hook for every admin route: valid session cookie + CSRF header on writes */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Please log in.' } })
  }
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'dashboard') {
    return reply.code(403).send({ error: { code: 'CSRF', message: 'Missing request header.' } })
  }
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const { env } = app

  r.post(
    '/login',
    {
      // brute-force protection: 5 attempts per 15 minutes per IP
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
      schema: { body: z.object({ username: z.string().min(1).max(60), password: z.string().min(1).max(200) }).strict() },
    },
    async (req, reply) => {
      const { username, password } = req.body
      const userOk = sameString(username, env.ADMIN_USERNAME)
      const passOk = await bcrypt.compare(password, userOk ? env.ADMIN_PASSWORD_HASH : DUMMY_HASH)
      const ok = userOk && passOk
      await Audit.create({ action: 'login', detail: ok ? undefined : 'invalid credentials', success: ok, ipHash: hashIp(req.ip, env.IP_HASH_SALT) })
      if (!ok) return reply.code(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong username or password.' } })

      const token = await reply.jwtSign({ sub: username, role: 'admin' })
      return reply
        .setCookie(SESSION_COOKIE, token, {
          path: '/',
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: SESSION_HOURS * 3600,
        })
        .send({ ok: true, username })
    },
  )

  r.post('/logout', async (_req, reply) => reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ ok: true }))

  r.get('/me', { onRequest: requireAdmin }, async (req) => ({ username: (req.user as { sub: string }).sub }))
}
