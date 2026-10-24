import { api, type Stats } from '../api'
import { Badge, Bars, ErrorNote, HList, Stat } from '../components/ui'
import { useLoad } from '../useLoad'

export function Overview({ go }: { go: (page: string, preset?: string) => void }) {
  const { data, error, loading, reload } = useLoad(() => api<Stats>('/admin/stats'), [])
  if (loading && !data) return <p className="text-slate-400">Loading…</p>
  if (!data) return <ErrorNote error={error} />
  const t = data.totals
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Overview · last 30 days</h1>
        <div className="flex gap-2">
          <a className="btn-ghost" href="/v1/admin/export" download>
            ⬇ Export data
          </a>
          <button className="btn-ghost" onClick={reload}>
            ↻ Refresh
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Stat label="Unique visitors" value={t.visitors30} />
        <Stat label="Page views" value={t.pageViews30} />
        <Stat label="Resume downloads" value={t.resumeDownloads30} />
        <Stat label="New messages" value={t.contactsNew} hint={`${t.contactsTotal} total`} tone={t.contactsNew ? 'alert' : 'default'} />
        <Stat label="Guestbook to review" value={t.guestbookPending} tone={t.guestbookPending ? 'alert' : 'default'} />
        <Stat label="Chat questions" value={t.chats30} hint={`${t.unanswered30} unanswered`} />
        <Stat label="Demo orders" value={t.orders30} />
        <Stat label="❤ Reactions" value={data.reactions.reduce((a, r) => a + r.count, 0)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Bars label="Page views" data={data.series.views} />
        <Bars label="Chat questions" data={data.series.chats} color="var(--color-accent-2)" />
        <Bars label="Contact messages" data={data.series.contacts} color="#fbbf24" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <HList title="Most viewed sections" rows={data.topSections.map((s) => ({ label: s.label, value: s.count }))} />
        <div className="card p-4">
          <p className="mb-3 text-sm font-semibold text-white">Top chat questions</p>
          {data.topQuestions.length === 0 ? (
            <p className="text-sm text-slate-500">No questions yet</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.topQuestions.map((q) => (
                <li key={q.question} className="flex items-start justify-between gap-2">
                  <span className="text-slate-200">
                    {q.question}{' '}
                    {!q.answered && (
                      <button className="ml-1 text-xs text-accent hover:underline" onClick={() => go('knowledge', q.question)}>
                        + add answer
                      </button>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {!q.answered && <Badge tone="amber">no answer</Badge>}
                    <span className="font-mono text-slate-400">{q.count}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <HList title="❤ Project reactions" rows={data.reactions.map((r) => ({ label: r.project, value: r.count }))} />
        <HList title="Devices" rows={data.devices.map((d) => ({ label: d.device, value: d.count }))} />
        <HList title="Referrers" rows={data.referrers.map((r) => ({ label: r.referrer, value: r.count }))} empty="No referrers yet (direct visits)" />
      </div>
    </div>
  )
}
