'use client'

import { useState } from 'react'
import { Markdown } from './markdown'

export function DocumentView({ title, markdown, onOpenRecord, onClose }: { title: string; markdown: string; onOpenRecord: (id: string) => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked */ }
  }
  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-8" onClick={onClose}>
      <article className="w-full max-w-4xl rounded-xl border border-line bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-line bg-surface px-5 py-3">
          <p className="text-sm text-muted">Generated document · every id links to its record</p>
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">{copied ? 'Copied' : 'Copy markdown'}</button>
            <button type="button" onClick={download} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken">Download .md</button>
            <button type="button" onClick={onClose} className="rounded-md bg-ink px-3 py-1.5 text-sm text-surface">Close</button>
          </div>
        </header>
        <div className="px-5 py-5 sm:px-8">
          <Markdown text={markdown} onOpenRecord={onOpenRecord} />
        </div>
      </article>
    </div>
  )
}
