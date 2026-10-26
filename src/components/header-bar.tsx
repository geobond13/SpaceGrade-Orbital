'use client'

import { useSyncExternalStore } from 'react'
import { programData } from '@/data/program'
import { parseMilestones } from '@/lib/readiness'
import type { Focus } from '@/lib/focus'
import type { Run } from './use-agent-runs'

const DAY = 86_400_000

// Today, read on the client only: the page is prerendered, so the server must not bake in a date.
const today = () => Math.floor(Date.now() / DAY)
const noSubscribe = () => () => {}

function daysTo(date: string, day: number): number {
  return Math.ceil(Date.parse(`${date}T00:00:00Z`) / DAY - day)
}

const PHASE_LABEL: Record<Focus['phase'], string> = {
  idle: 'STANDBY', planning: 'PLANNING', acting: 'ACQUIRING', answering: 'DOWNLINK', done: 'NOMINAL', error: 'FAULT',
}

export function HeaderBar({ runs, focus }: { runs: Run[]; focus: Focus }) {
  const milestones = parseMilestones(programData.program.nextMilestone)
  const day = useSyncExternalStore(noSubscribe, today, () => null)
  const usage = runs.flatMap((r) => r.events.flatMap((e) => (e.type === 'usage' ? [e.usage] : [])))
  const cost = usage.reduce((s, u) => s + u.costUsd, 0)
  const tokens = usage.reduce((s, u) => s + u.promptTokens + u.completionTokens, 0)
  const live = focus.phase === 'planning' || focus.phase === 'acting' || focus.phase === 'answering'

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface/80 px-4 py-2.5 backdrop-blur sm:px-5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm font-semibold tracking-[0.2em]">{programData.program.name.toUpperCase()}</span>
        <span className="hidden font-mono text-[0.68rem] tracking-widest text-faint sm:inline">{"// SPACEGRADE MISSION CONTROL"}</span>
      </div>
      <span className="hidden font-mono text-[0.68rem] uppercase tracking-wider text-muted md:inline">{programData.program.phase}</span>

      <div className="flex items-center gap-4 font-mono text-[0.7rem]">
        {milestones.map((m) => (
          <span key={m.date} className="flex items-baseline gap-1.5" title={`${m.label} ${m.date}`}>
            <span className="uppercase text-faint">{m.label.replace(/qualification review/i, 'qual rev')}</span>
            <span className="font-semibold tabular-nums text-warn">{day === null ? 'T-··d' : `T-${daysTo(m.date, day)}d`}</span>
          </span>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-4 font-mono text-[0.7rem]">
        <span className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${focus.phase === 'error' ? 'bg-bad' : live ? 'sg-pulse bg-accent' : 'bg-ok'}`} />
          <span className={live ? 'text-accent' : 'text-muted'}>{PHASE_LABEL[focus.phase]}</span>
        </span>
        <span className="hidden text-muted lg:inline">
          <span className="text-super">NEMOTRON SUPER</span> · <span className="text-nano">NANO</span> <span className="text-faint">via Nebius Token Factory</span>
        </span>
        <span className="tabular-nums text-muted" title="Session total across all runs">
          {tokens.toLocaleString()} tok · <span className="text-ink">${cost.toFixed(4)}</span>
        </span>
      </div>
    </header>
  )
}
