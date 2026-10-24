import type { ReactNode } from 'react'

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: string; tone?: 'default' | 'alert' }) {
  return (
    <div className={`card p-4 ${tone === 'alert' ? 'border-amber-400/40' : ''}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'alert' ? 'text-amber-300' : 'text-white'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
}

/** Tiny dependency-free bar chart */
export function Bars({ data, color = 'var(--color-accent)', label }: { data: { day: string; count: number }[]; color?: string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const total = data.reduce((a, d) => a + d.count, 0)
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="font-mono text-xs text-slate-400">{total} in 14 days</p>
      </div>
      <div className="flex h-28 items-end gap-1" role="img" aria-label={`${label}: ${total} in the last 14 days`}>
        {data.map((d) => (
          <div key={d.day} className="group relative flex-1">
            <div className="rounded-t" style={{ height: `${Math.max(2, (d.count / max) * 112)}px`, background: color, opacity: d.count ? 0.9 : 0.15 }} />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {d.day.slice(5)}: {d.count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{data[0]?.day.slice(5)}</span>
        <span>{data.at(-1)?.day.slice(5)}</span>
      </div>
    </div>
  )
}

export function HList({ title, rows, empty = 'No data yet' }: { title: string; rows: { label: string; value: number; extra?: ReactNode }[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="card p-4">
      <p className="mb-3 text-sm font-semibold text-white">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate text-slate-200" title={r.label}>
                  {r.label} {r.extra}
                </span>
                <span className="font-mono text-slate-400">{r.value}</span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-white/5">
                <div className="h-full rounded bg-accent/70" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'cyan' | 'green' | 'amber' | 'rose' | 'fuchsia' }) {
  const tones = {
    slate: 'bg-slate-500/15 text-slate-300',
    cyan: 'bg-cyan-500/15 text-cyan-300',
    green: 'bg-emerald-500/15 text-emerald-300',
    amber: 'bg-amber-500/15 text-amber-300',
    rose: 'bg-rose-500/15 text-rose-300',
    fuchsia: 'bg-fuchsia-500/15 text-fuchsia-300',
  }
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${value === o.value ? 'bg-accent text-slate-950' : 'border border-line text-slate-300 hover:border-accent'}`}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <button className="btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Prev
      </button>
      <span className="text-slate-400">
        {page} / {pages}
      </span>
      <button className="btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card grid place-items-center p-10 text-sm text-slate-400">{children}</div>
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null
  return <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
}
