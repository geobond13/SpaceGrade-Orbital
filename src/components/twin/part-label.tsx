import type { PartVisual } from './visuals'

export function PartLabel({ id, name, visual }: { id: string; name: string; visual: PartVisual }) {
  return (
    <div className="sg-rise whitespace-nowrap rounded border border-line-strong bg-canvas/90 px-2 py-1 font-mono text-[0.68rem] shadow-lg backdrop-blur">
      <span className="text-accent">{id}</span> <span className="text-ink">{name}</span>
      <span className="ml-1.5 inline-flex items-center gap-1" style={{ color: visual.hex }}>
        <span className="size-1.5 rounded-full" style={{ background: visual.hex }} />{visual.label}
      </span>
    </div>
  )
}
