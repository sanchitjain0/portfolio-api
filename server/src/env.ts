import { z } from 'zod'

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(8080),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  ADMIN_USERNAME: z.string().min(3).default('admin'),
  /** bcrypt hash – generate with `npm run hash-password -- '<password>'` */
  ADMIN_PASSWORD_HASH: z.string().regex(/^\$2[aby]\$\d{2}\$/, 'ADMIN_PASSWORD_HASH must be a bcrypt hash'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  IP_HASH_SALT: z.string().min(16, 'IP_HASH_SALT must be at least 16 characters'),
  CORS_ORIGINS: csv,
  /** how many proxies sit in front of the app (Render: 1). Only those hops' X-Forwarded-For entries are trusted. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  /** global safety caps (per UTC day) */
  MAX_CONTACTS_PER_DAY: z.coerce.number().int().default(100),
  MAX_GUESTBOOK_PER_DAY: z.coerce.number().int().default(100),
  MAX_EVENTS_PER_DAY: z.coerce.number().int().default(20000),
})

export type Env = z.infer<typeof schema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return parsed.data
}
