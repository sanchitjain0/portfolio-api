import { useEffect, useState } from 'react'
import { api, fmtDate, type Contact, type ContactStatus, type Paged } from '../api'
import { Badge, Empty, ErrorNote, Pager, Tabs } from '../components/ui'
import { useLoad } from '../useLoad'

const TONE: Record<ContactStatus, 'cyan' | 'slate' | 'green' | 'rose' | 'amber'> = { new: 'cyan', read: 'slate', replied: 'green', archived: 'slate', spam: 'rose' }

export function Inbox() {
  const [status, setStatus] = useState<ContactStatus | 'all'>('new')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Contact | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const { data, error, loading, reload } = useLoad(
    () => api<Paged<Contact>>(`/admin/contacts?page=${page}${status !== 'all' ? `&status=${status}` : ''}${query ? `&q=${encodeURIComponent(query)}` : ''}`),
    [page, status, query],
  )
  useEffect(() => setNote(selected?.note ?? ''), [selected])

  const update = async (patch: Partial<Pick<Contact, 'status' | 'note'>>) => {
    if (!selected) return
    try {
      const doc = await api<Contact>(`/admin/contacts/${selected._id}`, { method: 'PATCH', body: patch })
      setSelected(doc)
      void reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const open = async (c: Contact) => {
    setSelected(c)
    if (c.status === 'new') {
      const doc = await api<Contact>(`/admin/contacts/${c._id}`, { method: 'PATCH', body: { status: 'read' } })
      setSelected(doc)
      void reload()
    }
  }
  const remove = async () => {
    if (!selected || !confirm(`Delete the message from ${selected.name}? This can't be undone.`)) return
    await api(`/admin/contacts/${selected._id}`, { method: 'DELETE' })
    setSelected(null)
    void reload()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">Inbox</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          options={[
            { value: 'new', label: 'New' },
            { value: 'read', label: 'Read' },
            { value: 'replied', label: 'Replied' },
            { value: 'archived', label: 'Archived' },
            { value: 'spam', label: 'Spam' },
            { value: 'all', label: 'All' },
          ]}
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setPage(1)
            setQuery(q.trim())
          }}
        >
          <input className="input w-56" placeholder="Search name, email, text…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search messages" />
          <button className="btn-ghost">Search</button>
        </form>
      </div>
      <ErrorNote error={error ?? err} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          {loading && !data ? (
            <p className="text-slate-400">Loading…</p>
          ) : data?.items.length ? (
            data.items.map((c) => (
              <button
                key={c._id}
                onClick={() => void open(c)}
                className={`card block w-full p-3 text-left transition hover:border-accent ${selected?._id === c._id ? 'border-accent' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate ${c.status === 'new' ? 'font-bold text-white' : 'text-slate-200'}`}>{c.name}</span>
                  <Badge tone={TONE[c.status]}>{c.status}</Badge>
                </div>
                <p className="truncate text-xs text-slate-400">{c.email}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-300">{c.message}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-500">{fmtDate(c.createdAt)}</p>
              </button>
            ))
          ) : (
            <Empty>No messages here.</Empty>
          )}
          {data && <Pager page={data.page} total={data.total} limit={data.limit} onPage={setPage} />}
        </div>

        {selected ? (
          <div className="card h-fit space-y-4 p-5 lg:sticky lg:top-4">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <Badge tone={TONE[selected.status]}>{selected.status}</Badge>
              </div>
              <a className="text-sm text-accent hover:underline" href={`mailto:${selected.email}?subject=${encodeURIComponent('Re: your message on my portfolio')}`}>
                {selected.email}
              </a>
              <p className="font-mono text-[11px] text-slate-500">{fmtDate(selected.createdAt)}</p>
            </div>
            <p className="whitespace-pre-wrap rounded-lg bg-bg p-3 text-sm text-slate-200">{selected.message}</p>
            <div className="flex flex-wrap gap-2">
              <a className="btn-primary" href={`mailto:${selected.email}?subject=${encodeURIComponent('Re: your message on my portfolio')}`} onClick={() => void update({ status: 'replied' })}>
                ✉ Reply
              </a>
              {(['read', 'replied', 'archived', 'spam'] as const).map((s) => (
                <button key={s} className="btn-ghost" disabled={selected.status === s} onClick={() => void update({ status: s })}>
                  Mark {s}
                </button>
              ))}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="note">
                Private note
              </label>
              <textarea id="note" className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
              <div className="mt-2 flex justify-between">
                <button className="btn-ghost" disabled={note === selected.note} onClick={() => void update({ note })}>
                  Save note
                </button>
                <button className="btn-danger" onClick={() => void remove()}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        ) : (
          <Empty>Select a message to read it.</Empty>
        )}
      </div>
    </div>
  )
}
