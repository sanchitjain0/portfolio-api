import { api, fmtDate, type AuditEntry } from '../api'
import { Badge, ErrorNote } from '../components/ui'
import { useLoad } from '../useLoad'

export function AuditPage() {
  const { data, error } = useLoad(() => api<{ items: AuditEntry[] }>('/admin/audit'), [])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Audit log</h1>
        <p className="text-sm text-slate-400">Logins (including failed attempts) and admin changes from the last 180 days. Repeated failed logins mean someone is guessing your password.</p>
      </div>
      <ErrorNote error={error} />
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Detail</th>
              <th className="px-4 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((a) => (
              <tr key={a._id} className="border-b border-line/50 last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-slate-400">{fmtDate(a.createdAt)}</td>
                <td className="px-4 py-2 text-slate-200">{a.action}</td>
                <td className="px-4 py-2 text-slate-400">{a.detail}</td>
                <td className="px-4 py-2">{a.success ? <Badge tone="green">ok</Badge> : <Badge tone="rose">failed</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
