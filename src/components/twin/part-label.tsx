import type { PartStatus } from '@/lib/readiness'
import { STATUS } from '../status'

export function PartLabel({ id, name, status }: { id: string; name: string; status: PartStatus }) {
  return (
    <div className="sg-rise whitespace-nowrap rounded border border-line-strong bg-canvas/90 px-2 py-1 font-mono text-[0.68rem] shadow-lg backdrop-blur">
      <span className="text-accent">{id}</span> <span className="text-ink">{name}</span>
      <span className="ml-1.5 inline-flex items-center gap-1" style={{ color: STATUS[status].color }}>
        <span className="size-1.5 rounded-full" style={{ background: STATUS[status].color }} />{STATUS[status].label}
      </span>
    </div>
  )
}
