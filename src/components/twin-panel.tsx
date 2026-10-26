'use client'

import dynamic from 'next/dynamic'
import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { db } from '@/lib/tools/lookup'
import type { Focus } from '@/lib/focus'
import { Schematic } from './twin/schematic'
import { PartLabel } from './twin/part-label'
import { NO_VISUAL, type LegendItem, type PartVisuals } from './twin/visuals'

let webglCache: boolean | undefined
function hasWebGL(): boolean {
  if (webglCache !== undefined) return webglCache
  try {
    const c = document.createElement('canvas')
    return (webglCache = !!(c.getContext('webgl2') ?? c.getContext('webgl')))
  } catch {
    return (webglCache = false)
  }
}
const noSubscribe = () => () => {}

export function TwinPanel({ visuals, legend, focus, framed, onSelectPart, listening, overlay }: {
  visuals: PartVisuals
  legend: LegendItem[]
  focus: Focus
  /** Parts the view should frame: a pinned record, else the agent's active parts. */
  framed: string[]
  onSelectPart: (id: string) => void
  listening?: boolean
  overlay?: ReactNode
}) {
  // null during SSR: render neither view until the client knows.
  const webgl = useSyncExternalStore(noSubscribe, hasWebGL, () => null)
  const [mode, setMode] = useState<'3d' | '2d'>('3d')
  const [exploded, setExploded] = useState(false)

  const highlighted = new Set([...focus.touchedPartIds, ...framed])
  const schematic = (
    <div className="absolute inset-0 p-6 pt-10">
      <Schematic visuals={visuals} highlighted={highlighted} onSelectPart={onSelectPart} />
    </div>
  )
  const show3d = webgl && mode === '3d'
  const framedParts = framed.flatMap((id) => db.parts.find((p) => p.id === id) ?? [])
  const label = framed.length > 4 ? `${framed.length} parts` : undefined

  return (
    <div className="grid-backdrop relative h-full w-full overflow-hidden">
      {show3d ? (
        <div className="absolute inset-0">
          <TwinCanvas visuals={visuals} focus={focus} framed={framed} exploded={exploded} listening={listening} onSelectPart={onSelectPart} />
        </div>
      ) : webgl !== null && schematic}

      <div className="pointer-events-none absolute left-3 top-2.5 flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-2">
          <h2 className="panel-title">Digital twin</h2>
          {listening && <span className="sg-pulse font-mono text-[0.68rem] text-bad">● listening</span>}
          {focus.currentTool && <span className="sg-pulse font-mono text-[0.68rem] text-accent">▸ {focus.currentTool}</span>}
          {!focus.currentTool && label && <span className="font-mono text-[0.68rem] text-muted">◎ {label}</span>}
        </div>
        {/* Up to four framed parts are named; more than that is a region, not a list. */}
        {framedParts.length > 0 && framedParts.length <= 4 && (
          <div className="hidden flex-col items-start gap-1 sm:flex">
            {framedParts.map((p) => <PartLabel key={p.id} id={p.id} name={p.name} visual={visuals[p.id] ?? NO_VISUAL} />)}
          </div>
        )}
      </div>

      <div className="absolute right-3 top-2 flex gap-1 font-mono text-[0.65rem]">
        {show3d && (
          <button type="button" onClick={() => setExploded((x) => !x)} aria-pressed={exploded}
            className={`rounded border px-2 py-1 uppercase tracking-wider ${exploded ? 'border-accent text-accent' : 'border-line text-muted hover:text-ink'}`}>
            Explode
          </button>
        )}
        {webgl && (
          <button type="button" onClick={() => setMode((m) => (m === '3d' ? '2d' : '3d'))}
            className="rounded border border-line px-2 py-1 uppercase tracking-wider text-muted hover:text-ink">
            {mode === '3d' ? '2D' : '3D'}
          </button>
        )}
      </div>

      <ul className="pointer-events-none absolute bottom-2.5 left-3 hidden max-w-[calc(100%-7.5rem)] flex-wrap sm:flex gap-x-3 gap-y-1 font-mono text-[0.62rem] text-muted">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1"><span className="size-2 rounded-sm" style={{ background: l.hex }} />{l.label}</li>
        ))}
      </ul>
      {overlay}
    </div>
  )
}

const TwinCanvas = dynamic(() => import('./twin/twin-canvas'), {
  ssr: false,
  loading: () => <p className="sg-pulse absolute inset-0 flex items-center justify-center font-mono text-xs text-faint">Initialising twin…</p>,
})
