import { useEffect, useState } from 'react'
import { api, type KnowledgeEntry } from '../api'
import { Badge, ErrorNote } from '../components/ui'
import { useLoad } from '../useLoad'

const blank = (question = ''): KnowledgeEntry => ({
  slug: question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-'),
  question,
  keywords: [],
  answer: '',
  enabled: true,
})

export function KnowledgePage({ preset, clearPreset }: { preset?: string; clearPreset: () => void }) {
  const { data, error, reload } = useLoad(() => api<{ items: KnowledgeEntry[] }>('/admin/knowledge'), [])
  const [edit, setEdit] = useState<KnowledgeEntry | null>(null)
  const [keywords, setKeywords] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (preset) {
      setEdit(blank(preset))
      setKeywords('')
      clearPreset()
    }
  }, [preset, clearPreset])

  const start = (e: KnowledgeEntry) => {
    setEdit({ ...e })
    setKeywords(e.keywords.join(', '))
    setErr(null)
  }

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!edit) return
    const body = {
      slug: edit.slug,
      question: edit.question,
      answer: edit.answer,
      enabled: edit.enabled,
      keywords: keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    }
    try {
      if (edit._id) await api(`/admin/knowledge/${edit._id}`, { method: 'PUT', body })
      else await api('/admin/knowledge', { method: 'POST', body })
      setEdit(null)
      void reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const remove = async (e: KnowledgeEntry) => {
    if (!e._id || !confirm(`Delete “${e.question}”?`)) return
    await api(`/admin/knowledge/${e._id}`, { method: 'DELETE' })
    void reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Knowledge base</h1>
          <p className="text-sm text-slate-400">Answers for “Ask my portfolio”. A question matches an entry when it contains one of its keywords (whole words).</p>
        </div>
        <button className="btn-primary" onClick={() => start(blank())}>
          + New entry
        </button>
      </div>
      <ErrorNote error={error} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <ul className="space-y-2">
          {data?.items.map((e) => (
            <li key={e._id} className={`card p-3 ${edit?._id === e._id ? 'border-accent' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <button className="text-left font-semibold text-white hover:text-accent" onClick={() => start(e)}>
                  {e.question}
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!e.enabled && <Badge>off</Badge>}
                  <Badge tone="cyan">{e.hits ?? 0} hits</Badge>
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-400">{e.answer}</p>
              <p className="mt-1 font-mono text-[11px] text-slate-500">{e.keywords.join(' · ')}</p>
            </li>
          ))}
        </ul>

        {edit ? (
          <form onSubmit={save} className="card h-fit space-y-3 p-5 lg:sticky lg:top-4">
            <h2 className="font-semibold text-white">{edit._id ? 'Edit entry' : 'New entry'}</h2>
            <ErrorNote error={err} />
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Question (shown in admin, also an exact-match shortcut)</span>
              <input className="input" required maxLength={200} value={edit.question} onChange={(e) => setEdit({ ...edit, question: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Slug (id)</span>
              <input className="input font-mono" required pattern="[a-z0-9-]{2,60}" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Keywords (comma separated)</span>
              <input className="input" placeholder="salary, ctc, compensation" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-400">Answer</span>
              <textarea className="input min-h-32" required maxLength={1200} value={edit.answer} onChange={(e) => setEdit({ ...edit, answer: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Enabled
            </label>
            <div className="flex gap-2">
              <button className="btn-primary">Save</button>
              <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>
                Cancel
              </button>
              {edit._id && (
                <button type="button" className="btn-danger ml-auto" onClick={() => void remove(edit)}>
                  Delete
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="card grid place-items-center p-10 text-sm text-slate-400">Select an entry to edit it.</div>
        )}
      </div>
    </div>
  )
}
