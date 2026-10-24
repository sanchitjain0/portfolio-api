import mongoose from 'mongoose'
import { loadEnv } from './env.js'
import { buildApp } from './app.js'
import { seedKnowledge } from './lib/knowledge.js'
import { getSiteConfig } from './lib/siteConfig.js'

const env = loadEnv()

mongoose.set('strictQuery', true)
// NoSQL injection: every request body/query is validated by strict Zod schemas (primitives only),
// so user input can never carry `$` operators into a filter.
await mongoose.connect(env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10_000 })
await Promise.all([seedKnowledge(), getSiteConfig()])

const app = await buildApp(env)
await app.listen({ port: env.PORT, host: '0.0.0.0' })

// graceful shutdown (Render sends SIGTERM on deploys)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, 'shutting down')
    await app.close()
    await mongoose.disconnect()
    process.exit(0)
  })
}
