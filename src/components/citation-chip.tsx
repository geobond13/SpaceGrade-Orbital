'use client'

export function CitationChip({ id, label, unknown, onClick }: { id: string; label?: string; unknown?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={unknown ? 'Not returned by any tool in this run' : label ?? `Open ${id}`}
      className={`mx-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-px align-baseline font-mono text-[0.72rem] leading-5 transition-colors ${
        unknown
          ? 'border-bad/40 bg-bad-soft text-bad'
          : 'border-line bg-sunken text-ink hover:border-accent hover:text-accent'
      }`}
    >
      {id}
      {label && <span className="max-w-48 truncate font-sans text-muted">{label}</span>}
    </button>
  )
}
