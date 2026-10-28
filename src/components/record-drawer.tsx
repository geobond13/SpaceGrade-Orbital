'use client'

import { programData } from '@/data/program'
import { RECORD_ID } from '@/lib/agent/citations'
import { CitationChip } from './citation-chip'
import { channelById, CONJUNCTION_EVENT, OM_BURN, XBAND_SESSION } from '@/lib/flight/scenarios'
import { eventById } from '@/lib/flight/fdir'
import type { AsFlown } from '@/lib/flight/as-flown'

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
  // Flight Mode records (simulated)
  const ch = channelById(id)
  if (ch) return { kind: 'Telemetry channel', record: { name: ch.channel.label, unit: ch.channel.unit || 'ratio', partId: ch.channel.partId, scenario: ch.scenario.title } }
  const ev = eventById(id)
  if (ev) return { kind: 'FDIR event', record: { title: ev.rule, severity: ev.severity, at: `T+${ev.t} min`, channel: ev.channel, partId: ev.partId, summary: ev.summary } }
  if (id === CONJUNCTION_EVENT.cdm) return { kind: 'Conjunction data message', record: { title: CONJUNCTION_EVENT.object, closestApproach: `T+${CONJUNCTION_EVENT.tca} min`, predictedMissM: CONJUNCTION_EVENT.missM, collisionProbability: CONJUNCTION_EVENT.pc.toExponential(1) } }
  if (id === OM_BURN.id) return { kind: 'Scheduled burn', record: { title: 'Orbit maintenance burn', scheduled: `T+${OM_BURN.t} min`, durationMin: OM_BURN.durationMin, deltaVMs: OM_BURN.deltaVMs } }
  if (id === XBAND_SESSION.id) return { kind: 'Payload session', record: { title: 'X-band payload downlink', start: `T+${XBAND_SESSION.start} min`, end: `T+${XBAND_SESSION.end} min`, powerW: XBAND_SESSION.watts } }
  return undefined
}

/** Everything that happened to a part and what it contains, oldest first: the build pedigree. */
function pedigree(partId: string) {
  const below = (id: string): string[] => programData.parts.filter((p) => p.parentId === id).flatMap((p) => [p.id, ...below(p.id)])
  const ids = new Set([partId, ...below(partId)])
  return [
    ...programData.tests.filter((t) => ids.has(t.partId)).map((t) => ({ date: t.date, id: t.id, text: t.name, detail: t.measured, tone: t.outcome === 'fail' ? 'bad' : t.outcome === 'pass' ? 'ok' : 'warn' })),
    ...programData.nonconformances.filter((n) => ids.has(n.partId)).map((n) => ({ date: n.opened, id: n.id, text: n.title, detail: `${n.severity}, ${n.status}${n.disposition ? `, ${n.disposition.replace(/_/g, ' ')}` : ''}`, tone: 'bad' })),
  ].sort((a, b) => a.date.localeCompare(b.date))
}

function Pedigree({ partId, onOpen }: { partId: string; onOpen: (id: string) => void }) {
  const rows = pedigree(partId)
  if (rows.length === 0) return null
  return (
    <section className="mb-4">
      <h3 className="panel-title mb-2">Build pedigree</h3>
      <ol className="relative space-y-2 border-l border-line-strong pl-3">
        {rows.map((r) => (
          <li key={r.id} className="relative text-xs">
            <span className={`absolute -left-[17px] top-1 size-2 rounded-full ${r.tone === 'bad' ? 'bg-bad' : r.tone === 'ok' ? 'bg-ok' : 'bg-warn'}`} aria-hidden />
            <span className="font-mono text-faint">{r.date}</span> <CitationChip id={r.id} onClick={() => onOpen(r.id)} />
            <span className="block text-ink">{r.text}</span>
            {r.detail && <span className="block text-muted">{r.detail}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
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

export function RecordDrawer({ id, onOpen, onClose, asFlown }: {
  id: string
  onOpen: (id: string) => void
  onClose: () => void
  /** Flight Mode: how an NCR was dispositioned for the vehicle that flew. */
  asFlown?: (id: string) => AsFlown | undefined
}) {
  const found = findRecord(id)
  const flown = asFlown?.(id)
  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-line-strong bg-surface/95 shadow-2xl shadow-black backdrop-blur"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Record ${id}`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-xs text-muted">{found?.kind ?? 'Record'} · synthetic data</p>
            <h2 className="font-mono text-base font-semibold">{id}</h2>
            {found && <p className="mt-0.5 text-sm">{String(found.record.name ?? found.record.title ?? '')}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-sunken">Close</button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {flown && (
            <section className="mb-4 rounded-md border border-warn/40 bg-warn-soft/40 px-3 py-2.5 text-sm">
              <h3 className="panel-title !text-warn">As flown · {flown.disposition}</h3>
              <p className="mt-1.5 text-ink">{flown.basis}</p>
              <p className="mt-1.5"><span className="text-muted">In orbit: </span>{flown.flightImpact}</p>
              <p className="mt-1.5"><span className="text-muted">Reached operations: </span>{flown.carriedIntoOps}</p>
              <p className="mt-2 text-xs text-muted">The fields below are the record as it stood at qualification.</p>
            </section>
          )}
          {found?.kind === 'Part' && <Pedigree partId={id} onOpen={onOpen} />}
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
