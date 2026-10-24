import { Knowledge, type KnowledgeDoc } from '../models.js'

/**
 * Default answers for the portfolio chat. They're seeded into MongoDB on first start and
 * can be edited from the dashboard (Knowledge base) afterwards.
 */
export const DEFAULT_KNOWLEDGE: Omit<KnowledgeDoc, 'hits' | 'createdAt' | 'updatedAt'>[] = [
  {
    slug: 'current-role',
    question: 'What does Sanchit work on right now?',
    keywords: ['now', 'current', 'currently', 'americana', 'job', 'role', 'work on', 'kfc', 'pizza', 'hardee', 'restaurant'],
    answer:
      "He's a Senior Backend Developer at Americana Restaurants (Jan 2026 – present), building features across the 21+ microservice ordering platform behind KFC, Pizza Hut, Hardee's and Krispy Kreme in MENA and Central Asia: Koa, gRPC, Kafka and RabbitMQ on Kubernetes with Linkerd.",
    enabled: true,
  },
  {
    slug: 'stack',
    question: 'What is his tech stack?',
    keywords: ['stack', 'skill', 'skills', 'tech', 'technology', 'language', 'framework', 'tools'],
    answer:
      'Backend: Node.js, TypeScript, NestJS, Express, Koa, gRPC, GraphQL, WebSockets. Data: MongoDB, PostgreSQL, MySQL, Aerospike, Redis, Elasticsearch. Messaging: Kafka, RabbitMQ. Cloud: AWS, Azure, Docker, Kubernetes, Linkerd. Frontend: React 19, Tailwind, Three.js.',
    enabled: true,
  },
  {
    slug: 'taghawk',
    question: 'Tell me about TagHawk',
    keywords: ['taghawk', 'tag hawk', 'marketplace', 'ecommerce', 'e-commerce'],
    answer:
      'TagHawk is a campus and apartment resale marketplace. He built the backend: Elasticsearch listing search, transactional inventory that prevents overselling, anonymous Socket.IO chat and escrow payments.',
    enabled: true,
  },
  {
    slug: 'experience',
    question: 'How much experience does he have?',
    keywords: ['experience', 'years', 'career', 'appinventiv', 'history', 'background'],
    answer:
      '4.5+ years: Backend Developer at Appinventiv (Feb 2022 – Jan 2026), then Senior Backend Developer at Americana Restaurants (Jan 2026 – present).',
    enabled: true,
  },
  {
    slug: 'impact',
    question: 'What results has he delivered?',
    keywords: ['impact', 'result', 'achievement', 'latency', 'performance', 'incident', 'scale', 'orders'],
    answer:
      'Platforms handling 200K+ orders/day, API latency cut from ~2.5s to ~300ms, ~40% fewer production incidents, 50K+ abusive requests blocked per day, a net 46K lines removed in a SonarQube clean-up, and kiosk ordering live in 10+ countries.',
    enabled: true,
  },
  {
    slug: 'ai',
    question: 'How does he use AI?',
    keywords: ['ai', 'claude', 'gemini', 'codex', 'copilot', 'llm', 'gpt'],
    answer:
      'He works with the Claude API, Claude Code, GitHub Copilot, OpenAI Codex and Gemini: Claude integrated into Node.js backends, plus AI-assisted refactors, tests and code review.',
    enabled: true,
  },
  {
    slug: 'hire',
    question: 'Is he open to new roles?',
    keywords: ['hire', 'hiring', 'open', 'available', 'availability', 'role', 'opportunity', 'contact', 'email', 'reach'],
    answer: "Yes, he's open to senior backend and full-stack roles. The fastest way to reach him is sanchitj439@gmail.com.",
    enabled: true,
  },
]

export const FALLBACK_ANSWER =
  "I don't have that one yet. Try asking about his current role, stack, TagHawk, experience or AI tools, or email sanchitj439@gmail.com."

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Simple keyword scoring: whole-word / phrase matches, longest keyword wins ties. */
export function bestMatch<T extends { slug: string; keywords: string[]; question: string }>(question: string, entries: T[]) {
  const q = ` ${normalise(question)} `
  let best: { entry: T; score: number } | null = null
  for (const entry of entries) {
    let score = 0
    for (const kw of entry.keywords) {
      const k = normalise(kw)
      if (k && q.includes(` ${k} `)) score += 1 + k.length / 20
    }
    if (normalise(entry.question) === normalise(question)) score += 5
    if (score > 0 && (!best || score > best.score)) best = { entry, score }
  }
  return best?.entry ?? null
}

export async function answerQuestion(question: string) {
  const entries = await Knowledge.find({ enabled: true }).select('slug question keywords answer').lean()
  const match = bestMatch(question, entries)
  if (match) await Knowledge.updateOne({ slug: match.slug }, { $inc: { hits: 1 } })
  return { answer: match?.answer ?? FALLBACK_ANSWER, matchedId: match?.slug ?? null }
}

export async function seedKnowledge() {
  if ((await Knowledge.estimatedDocumentCount()) > 0) return
  await Knowledge.insertMany(DEFAULT_KNOWLEDGE)
}
