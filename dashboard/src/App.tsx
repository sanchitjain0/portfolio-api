import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, setUnauthorizedHandler } from './api'
import { ErrorNote } from './components/ui'
import { Overview } from './pages/Overview'
import { Inbox } from './pages/Inbox'
import { Chats } from './pages/Chats'
import { GuestbookPage } from './pages/GuestbookPage'
import { SitePage } from './pages/SitePage'
import { KnowledgePage } from './pages/KnowledgePage'
import { AuditPage } from './pages/AuditPage'

const PAGES = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'inbox', label: 'Inbox', icon: '✉' },
  { id: 'chats', label: 'Chat questions', icon: '💬' },
  { id: 'guestbook', label: 'Guestbook', icon: '✎' },
  { id: 'site', label: 'Site settings', icon: '⚙' },
  { id: 'knowledge', label: 'Knowledge base', icon: '📚' },
  { id: 'audit', label: 'Audit log', icon: '🛡' },
] as const
type PageId = (typeof PAGES)[number]['id']

const pageFromHash = (): PageId => {
  const h = location.hash.slice(1) as PageId
  return PAGES.some((p) => p.id === h) ? h : 'overview'
}

function Login({ onLogin }: { onLogin: (u: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ username: string }>('/admin/auth/login', { method: 'POST', body: { username, password } })
      onLogin(res.username)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      setPassword('')
    }
  }
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Sanchit.dev</p>
          <h1 className="text-xl font-bold text-white">Admin login</h1>
        </div>
        <ErrorNote error={error} />
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Username</span>
          <input className="input" autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-400">Password</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn-primary w-full !py-2.5" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-[11px] text-slate-500">5 failed attempts lock the login for 15 minutes.</p>
      </form>
    </main>
  )
}

export default function App() {
  const [user, setUser] = useState<string | null | undefined>(undefined)
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [preset, setPreset] = useState<string | undefined>()
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    api<{ username: string }>('/admin/auth/me')
      .then((r) => setUser(r.username))
      .catch(() => setUser(null))
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = useCallback((p: string, pre?: string) => {
    setPreset(pre)
    location.hash = p
    setMenu(false)
  }, [])
  const clearPreset = useCallback(() => setPreset(undefined), [])

  const logout = async () => {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  if (user === undefined) return <p className="p-8 text-slate-400">Loading…</p>
  if (user === null) return <Login onLogin={setUser} />

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className={`${menu ? 'block' : 'hidden'} border-b border-line bg-panel md:block md:min-h-screen md:border-b-0 md:border-r`}>
        <div className="hidden px-5 py-5 md:block">
          <p className="font-mono text-xs uppercase tracking-widest text-accent">Sanchit.dev</p>
          <p className="font-bold text-white">Admin</p>
        </div>
        <nav className="space-y-1 px-3 pb-4 pt-3 md:pt-0" aria-label="Admin">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => go(p.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${page === p.id ? 'bg-accent/15 font-semibold text-accent' : 'text-slate-300 hover:bg-white/5'}`}
            >
              <span aria-hidden>{p.icon}</span>
              {p.label}
            </button>
          ))}
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-line px-4 py-3 md:px-6">
          <button className="btn-ghost md:invisible" onClick={() => setMenu((m) => !m)} aria-label="Menu">
            ☰
          </button>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-400 sm:inline">Signed in as {user}</span>
            <button className="btn-ghost" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </header>
        <main className="p-4 md:p-6">
          {page === 'overview' && <Overview go={go} />}
          {page === 'inbox' && <Inbox />}
          {page === 'chats' && <Chats go={go} />}
          {page === 'guestbook' && <GuestbookPage />}
          {page === 'site' && <SitePage />}
          {page === 'knowledge' && <KnowledgePage preset={preset} clearPreset={clearPreset} />}
          {page === 'audit' && <AuditPage />}
        </main>
      </div>
    </div>
  )
}
