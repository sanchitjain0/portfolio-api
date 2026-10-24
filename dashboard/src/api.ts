/** Same-origin API client for the dashboard (session cookie is httpOnly + SameSite=Strict). */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/v1${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'dashboard', // CSRF guard checked by the server on writes
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (res.status === 401 && !path.startsWith('/admin/auth/login')) onUnauthorized()
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? res.statusText)
  return data as T
}

/* ── types (mirror the server) ─────────────────────────────────────────────── */

export type ContactStatus = 'new' | 'read' | 'replied' | 'archived' | 'spam'
export interface Contact {
  _id: string
  name: string
  email: string
  message: string
  status: ContactStatus
  note: string
  userAgent?: string
  createdAt: string
}
export interface ChatLog {
  _id: string
  question: string
  answer: string
  matchedId: string | null
  flagged: boolean
  createdAt: string
}
export type GuestbookStatus = 'pending' | 'approved' | 'rejected'
export interface GuestbookEntry {
  _id: string
  name: string
  message: string
  status: GuestbookStatus
  createdAt: string
}
export interface SiteConfig {
  available: boolean
  availabilityText: string
  currentlyWorkingOn: string
  banner: { enabled: boolean; text: string; link: string }
  guestbookEnabled: boolean
  updatedAt?: string
}
export interface KnowledgeEntry {
  _id?: string
  slug: string
  question: string
  keywords: string[]
  answer: string
  enabled: boolean
  hits?: number
}
export interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
}
export interface Stats {
  totals: {
    contactsNew: number
    contactsTotal: number
    guestbookPending: number
    chats30: number
    unanswered30: number
    orders30: number
    visitors30: number
    pageViews30: number
    resumeDownloads30: number
  }
  reactions: { project: string; count: number }[]
  topSections: { label: string; count: number }[]
  topQuestions: { question: string; count: number; answered: boolean }[]
  devices: { device: string; count: number }[]
  referrers: { referrer: string; count: number }[]
  series: Record<'views' | 'chats' | 'contacts', { day: string; count: number }[]>
}
export interface AuditEntry {
  _id: string
  action: string
  detail?: string
  success: boolean
  createdAt: string
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
