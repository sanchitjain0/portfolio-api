import { useState } from 'react'
import { api, fmtDate, type GuestbookEntry, type GuestbookStatus, type Paged } from '../api'
import { Empty, ErrorNote, Pager, Tabs } from '../components/ui'
import { useLoad } from '../useLoad'

export function GuestbookPage() {
  const [status, setStatus] = useState<GuestbookStatus>('pending')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoad(() => api<Paged<GuestbookEntry>>(`/admin/guestbook?status=${status}&page=${page}`), [status, page])

  const set = async (g: GuestbookEntry, s: GuestbookStatus) => {
    await api(`/admin/guestbook/${g._id}`, { method: 'PATCH', body: { status: s } })
    void reload()
  }
  const remove = async (g: GuestbookEntry) => {
    if (!confirm('Delete this note permanently?')) return
    await api(`/admin/guestbook/${g._id}`, { method: 'DELETE' })
    void reload()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Guestbook</h1>
        <p className="text-sm text-slate-400">Notes only appear on the portfolio after you approve them. Notes with links are auto-rejected as spam.</p>
      </div>
      <Tabs
        value={status}
        onChange={(v) => {
          setStatus(v)
          setPage(1)
        }}
        options={[
          { value: 'pending', label: 'To review' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]}
      />
      <ErrorNote error={error} />
      {loading && !data ? (
        <p className="text-slate-400">Loading…</p>
      ) : data?.items.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.items.map((g) => (
            <div key={g._id} className="card flex flex-col p-4">
              <p className="text-sm text-slate-200">“{g.message}”</p>
              <p className="mt-2 text-xs text-slate-400">
                — {g.name} · <span className="font-mono">{fmtDate(g.createdAt)}</span>
              </p>
              <div className="mt-3 flex gap-2">
                {g.status !== 'approved' && (
                  <button className="btn-primary" onClick={() => void set(g, 'approved')}>
                    ✓ Approve
                  </button>
                )}
                {g.status !== 'rejected' && (
                  <button className="btn-ghost" onClick={() => void set(g, 'rejected')}>
                    ✕ Reject
                  </button>
                )}
                <button className="btn-danger ml-auto" onClick={() => void remove(g)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>Nothing here.</Empty>
      )}
      {data && <Pager page={data.page} total={data.total} limit={data.limit} onPage={setPage} />}
    </div>
  )
}
