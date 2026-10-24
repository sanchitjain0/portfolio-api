import { useState } from 'react'
import { api, fmtDate, type ChatLog, type Paged } from '../api'
import { Badge, Empty, ErrorNote, Pager, Tabs } from '../components/ui'
import { useLoad } from '../useLoad'

export function Chats({ go }: { go: (page: string, preset?: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'flagged'>('all')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoad(() => api<Paged<ChatLog>>(`/admin/chats?filter=${filter}&page=${page}`), [filter, page])

  const flag = async (c: ChatLog) => {
    await api(`/admin/chats/${c._id}`, { method: 'PATCH', body: { flagged: !c.flagged } })
    void reload()
  }
  const remove = async (c: ChatLog) => {
    await api(`/admin/chats/${c._id}`, { method: 'DELETE' })
    void reload()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Chat questions</h1>
        <p className="text-sm text-slate-400">What visitors asked “Ask my portfolio”. Unanswered questions are the best ideas for new knowledge-base entries. Logs are kept 90 days.</p>
      </div>
      <Tabs
        value={filter}
        onChange={(v) => {
          setFilter(v)
          setPage(1)
        }}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unanswered', label: 'Unanswered' },
          { value: 'flagged', label: 'Flagged' },
        ]}
      />
      <ErrorNote error={error} />
      {loading && !data ? (
        <p className="text-slate-400">Loading…</p>
      ) : data?.items.length ? (
        <div className="space-y-2">
          {data.items.map((c) => (
            <div key={c._id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-semibold text-white">“{c.question}”</p>
                <div className="flex items-center gap-2">
                  {c.matchedId ? <Badge tone="green">{c.matchedId}</Badge> : <Badge tone="amber">no match</Badge>}
                  {c.flagged && <Badge tone="rose">flagged</Badge>}
                  <span className="font-mono text-[11px] text-slate-500">{fmtDate(c.createdAt)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-300">{c.answer}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!c.matchedId && (
                  <button className="btn-primary" onClick={() => go('knowledge', c.question)}>
                    + Add an answer
                  </button>
                )}
                <button className="btn-ghost" onClick={() => void flag(c)}>
                  {c.flagged ? 'Unflag' : '⚑ Flag answer'}
                </button>
                <button className="btn-danger" onClick={() => void remove(c)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
          <Pager page={data.page} total={data.total} limit={data.limit} onPage={setPage} />
        </div>
      ) : (
        <Empty>No questions here.</Empty>
      )}
    </div>
  )
}
