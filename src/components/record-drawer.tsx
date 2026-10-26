'use client'

import { programData } from '@/data/program'
import { RECORD_ID } from '@/lib/agent/citations'
import { CitationChip } from './citation-chip'

const COLLECTIONS = [
  ['Part', programData.parts],
  ['Requirement', programData.requirements],
  ['Test record', programData.tests],
  ['Nonconformance', programData.nonconformances],
  ['Supplier', programData.suppliers],
  ['Quote', programData.quotes],
] as const

function findRecord(id: string): { kind: string; record: Record<string, unknown> } | undefined {
  for (const [kind, list] of COLLECTIONS) {
    const record = (list as readonly { id: string }[]).find((r) => r.id === id)
    if (record) return { kind, record: record as unknown as Record<string, unknown> }
  }
  return undefined
}

const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

function Value({ value, onOpen }: { value: unknown; onOpen: (id: string) => void }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-faint">none</span>
    return <span className="flex flex-wrap gap-1">{value.map((v, i) => <Value key={i} value={v} onOpen={onOpen} />)}</span>
  }
  if (value && typeof value === 'object') {
    return (
      <span className="block font-mono text-xs">
        {Object.entries(value).map(([k, v]) => <span key={k} className="block">{k}: {String(v)}</span>)}
      </span>
    )
  }
  const s = String(value)
  if (new RegExp(`^${RECORD_ID.source}$`).test(s) && findRecord(s)) return <CitationChip id={s} onClick={() => onOpen(s)} />
  return <span>{s}</span>
}

export function RecordDrawer({ id, onOpen, onClose }: { id: string; onOpen: (id: string) => void; onClose: () => void }) {
  const found = findRecord(id)
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Record ${id}`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-xs text-muted">{found?.kind ?? 'Record'} · synthetic program data</p>
            <h2 className="font-mono text-base font-semibold">{id}</h2>
            {found && <p className="mt-0.5 text-sm">{String(found.record.name ?? found.record.title ?? '')}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-sunken">Close</button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {found ? (
            <dl className="space-y-3 text-sm">
              {Object.entries(found.record).filter(([k]) => k !== 'id').map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{humanize(k)}</dt>
                  <dd className="mt-0.5"><Value value={v} onOpen={onOpen} /></dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-bad">No record with this id exists in the program data. The model cited something no tool returned.</p>
          )}
        </div>
      </aside>
    </div>
  )
}
