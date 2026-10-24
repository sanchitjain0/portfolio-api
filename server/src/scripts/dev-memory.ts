/**
 * Local playground: starts a throwaway in-memory MongoDB and the API with dev credentials.
 * Nothing is persisted. Usage: npm run dev:memory   →   http://localhost:8080/admin  (admin / admin-password-123)
 */
import bcrypt from 'bcryptjs'
import { MongoMemoryServer } from 'mongodb-memory-server-core'

const mongo = await MongoMemoryServer.create()
const password = 'admin-password-123'
Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGODB_URI: mongo.getUri('portfolio-dev'),
  ADMIN_USERNAME: process.env.ADMIN_USERNAME ?? 'admin',
  ADMIN_PASSWORD_HASH: bcrypt.hashSync(password, 10),
  JWT_SECRET: 'dev-only-secret-'.padEnd(48, 'x'),
  IP_HASH_SALT: 'dev-only-salt-0000',
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173',
})
console.log(`\n  In-memory MongoDB ready. Dashboard: http://localhost:${process.env.PORT ?? 8080}/admin  (admin / ${password})\n`)
await import('../index.js')
