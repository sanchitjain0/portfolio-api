import { useEffect, useState } from 'react'
import { api, fmtDate, type SiteConfig } from '../api'
import { ErrorNote } from '../components/ui'
import { useLoad } from '../useLoad'

export function SitePage() {
  const { data, error } = useLoad(() => api<SiteConfig>('/admin/config'), [])
  const [form, setForm] = useState<SiteConfig | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (data) setForm({ ...data, banner: { ...data.banner } })
  }, [data])

  if (!form) return error ? <ErrorNote error={error} /> : <p className="text-slate-400">Loading…</p>

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    try {
      const { available, availabilityText, currentlyWorkingOn, banner, guestbookEnabled } = form
      const doc = await api<SiteConfig>('/admin/config', { method: 'PUT', body: { available, availabilityText, currentlyWorkingOn, banner, guestbookEnabled } })
      setSaved(doc.updatedAt ? fmtDate(doc.updatedAt) : 'now')
    } catch (e2) {
      setErr((e2 as Error).message)
    }
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Site settings</h1>
        <p className="text-sm text-slate-400">These update the live portfolio within about a minute. No redeploy needed.</p>
      </div>
      <ErrorNote error={err} />

      <fieldset className="card space-y-3 p-5">
        <legend className="px-1 text-sm font-semibold text-white">Availability</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} />
          Open to opportunities (green dot in the hero)
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-400">Availability text</span>
          <input className="input" maxLength={120} value={form.availabilityText} onChange={(e) => setForm({ ...form, availabilityText: e.target.value })} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-slate-400">“Currently working on” (shown in the hero, leave empty to hide)</span>
          <input className="input" maxLength={160} value={form.currentlyWorkingOn} onChange={(e) => setForm({ ...form, currentlyWorkingOn: e.target.value })} />
        </label>
      </fieldset>

      <fieldset className="card space-y-3 p-5">
        <legend className="px-1 text-sm font-semibold text-white">Announcement banner</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.banner.enabled} onChange={(e) => setForm({ ...form, banner: { ...form.banner, enabled: e.target.checked } })} />
          Show a banner at the top of the portfolio
        </label>
        <input className="input" maxLength={160} placeholder="e.g. New write-up: rounding money across 10 currencies" value={form.banner.text} onChange={(e) => setForm({ ...form, banner: { ...form.banner, text: e.target.value } })} />
        <input className="input" maxLength={300} placeholder="Optional link (https://…)" value={form.banner.link} onChange={(e) => setForm({ ...form, banner: { ...form.banner, link: e.target.value } })} />
      </fieldset>

      <fieldset className="card space-y-3 p-5">
        <legend className="px-1 text-sm font-semibold text-white">Guestbook</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.guestbookEnabled} onChange={(e) => setForm({ ...form, guestbookEnabled: e.target.checked })} />
          Accept new guestbook notes
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button className="btn-primary">Save changes</button>
        {saved && <span className="text-sm text-emerald-300">Saved ✓ ({saved})</span>}
      </div>
    </form>
  )
}
