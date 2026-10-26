// Flight Mode tools. Same contract as the program tools ({ data, citations, summary }),
// plus a ToolCtx carrying the scenario, sim time and executed actions. Telemetry is
// only ever read up to "now": the agent cannot see the future.

import type { ToolCtx, ToolDef, ToolResult } from '../types'
import { cite, db, isOpen, resolveParts, str, verificationStatus } from '../lookup'
import { channelById, CONJUNCTION_EVENT, nextContact, sample, SCENARIOS, XBAND_SESSION, type Channel, type ScenarioId } from '@/lib/flight/scenarios'
import { linearFit } from '@/lib/flight/fdir'
import { ACTION_CLASSES, decide } from '@/lib/flight/autonomy'
import { dayDeltaVBelowRequirement, deltaVAtEndOfLife, leakFromSlope, TANK } from '@/lib/flight/physics'
import type { ActionKind } from '@/lib/flight/scenarios'

const needCtx = (): ToolResult => ({ data: { error: 'Flight tools need a flight context' }, citations: [], summary: 'no flight context' })
const round = (v: number, d: number) => Number.isFinite(v) ? Number(v.toFixed(d)) : null
const rel = (m: number) => `T${m >= 0 ? '+' : ''}${Math.round(m)} min`

function channelsFor(scenario: ScenarioId, args: Record<string, unknown>): Channel[] {
  const s = SCENARIOS[scenario]
  const ref = str(args.channel)
  if (ref) {
    const exact = s.channels.filter((c) => c.id.toLowerCase() === ref.toLowerCase())
    if (exact.length) return exact
    const words = ref.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
    const byLabel = s.channels.filter((c) => words.some((w) => c.label.toLowerCase().includes(w)))
    if (byLabel.length) return byLabel
  }
  const partRef = str(args.part)
  if (partRef) {
    const ids = new Set(resolveParts(partRef).flatMap((p) => [p.id, ...db.parts.filter((c) => c.parentId === p.id).map((c) => c.id)]))
    const byPart = s.channels.filter((c) => ids.has(c.partId) || ids.has(db.parts.find((p) => p.id === c.partId)?.parentId ?? ''))
    if (byPart.length) return byPart
  }
  return s.channels
}

export const getTelemetry: ToolDef = {
  name: 'get_telemetry',
  description: 'Read spacecraft telemetry up to now: latest value, range, fitted trend, and the residual against a model built from the spec sheet. Filter by channel id or name (e.g. "tank pressure", "battery voltage", "miss distance") or by part. Pressure channels include the equivalent helium leak rate and an end-of-life delta-v projection.',
  parameters: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel id like TM-PROP-03 or a name' },
      part: { type: 'string', description: 'Part id or name' },
      window_min: { type: 'number', description: 'How far back to look, minutes (default: the scenario window)' },
    },
  },
  run(args, ctx?: ToolCtx) {
    if (!ctx) return needCtx()
    const s = SCENARIOS[ctx.scenario]
    const span = typeof args.window_min === 'number' && args.window_min > 0 ? args.window_min : ctx.t - s.view.start
    const from = Math.max(s.range.start, ctx.t - span)
    const channels = channelsFor(ctx.scenario, args)
    const data = channels.map((c) => {
      const pts = sample(c, from, ctx.t, 240, ctx.actions)
      if (pts.length === 0) return { id: c.id, label: c.label, note: 'no data yet' }
      const fit = pts.length > 2 ? linearFit(pts) : undefined
      const last = pts[pts.length - 1]
      const out: Record<string, unknown> = {
        id: c.id, label: c.label, unit: c.unit, partId: c.partId,
        window: `${rel(from)} to ${rel(ctx.t)}`,
        latest: round(last.v, c.decimals), min: round(Math.min(...pts.map((p) => p.v)), c.decimals), max: round(Math.max(...pts.map((p) => p.v)), c.decimals),
        trendPerHour: fit && round(fit.slope * 60, c.decimals + 2),
        trendPerDay: fit && round(fit.slope * 1440, c.decimals + 1),
        trendSignificance: fit && round(Math.abs(fit.slope / fit.se), 1),
      }
      if (last.spec !== undefined) out.residualVsSpecModel = round(last.v - last.spec, c.decimals)
      if (c.id === 'TM-PROP-03' && fit) {
        const leak = leakFromSlope(fit.slope * 1440)
        const day = dayDeltaVBelowRequirement(leak)
        out.equivalentHeliumLeakSccs = Number(leak.toExponential(2))
        out.projection = {
          deltaVAtEndOfLifeMs: round(deltaVAtEndOfLife(5 * 365, leak).deltaVMs, 0),
          requiredMs: TANK.requiredDeltaVMs, requirement: 'REQ-SYS-002',
          missionDayDeltaVLost: day ?? 'not within 5 years',
          missionDayNow: Math.floor(s.missionDay + ctx.t / 1440),
        }
      }
      if (c.unit === 'V' && c.specModel) {
        out.residualAtEclipseEnds = s.eclipses.filter((e) => e.end <= ctx.t && e.end >= from)
          .map((e) => ({ eclipseEnd: rel(e.end), residualV: round(c.value(e.end - 0.5, ctx.actions) - c.specModel!(e.end - 0.5, ctx.actions), 3) }))
      }
      if (c.id === 'TM-CONJ-01') out.conjunction = { id: CONJUNCTION_EVENT.cdm, object: CONJUNCTION_EVENT.object, closestApproach: rel(CONJUNCTION_EVENT.tca) }
      out.samples = pts.filter((_, i) => i % 24 === 0 || i === pts.length - 1).map((p) => [Math.round(p.t), round(p.v, c.decimals)])
      return out
    })
    return {
      data,
      citations: channels.map((c) => ({ type: 'telemetry' as const, id: c.id, label: c.label })),
      summary: `${channels.length} channel${channels.length === 1 ? '' : 's'}: ${channels.map((c) => c.id).join(', ')}`,
    }
  },
}

export const getPartHistory: ToolDef = {
  name: 'get_part_history',
  description: 'The build pedigree of a part: supplier, revision, every test with its measured value, every nonconformance with its disposition, and the verification status of its requirements. Also includes NCRs on parts it contains and on other parts in the same assembly, because a fault often shows up somewhere else in the same system.',
  parameters: { type: 'object', properties: { part: { type: 'string', description: 'Part id or name' } }, required: ['part'] },
  run(args) {
    const parts = resolveParts(str(args.part))
    if (parts.length === 0) return { data: { error: `No part matches ${String(args.part)}` }, citations: [], summary: 'no part matched' }
    const part = parts[0]
    const descendants = (id: string): string[] => db.parts.filter((p) => p.parentId === id).flatMap((p) => [p.id, ...descendants(p.id)])
    const own = new Set([part.id, ...descendants(part.id)])
    const siblings = new Set(db.parts.filter((p) => p.parentId && p.parentId === part.parentId && !own.has(p.id)).map((p) => p.id))
    const tests = db.tests.filter((t) => own.has(t.partId)).sort((a, b) => a.date.localeCompare(b.date))
    const ncrs = db.nonconformances.filter((n) => own.has(n.partId))
    const related = db.nonconformances.filter((n) => siblings.has(n.partId))
    const reqs = db.requirements.filter((r) => r.partIds.some((p) => own.has(p)))
    const supplier = db.suppliers.find((s) => s.id === part.supplierId)
    const ncrRow = (n: (typeof ncrs)[number]) => ({
      id: n.id, partId: n.partId, title: n.title, opened: n.opened, severity: n.severity, status: n.status,
      disposition: n.disposition ?? null, open: isOpen(n), detectedBy: n.detectedBy ?? null, description: n.description, nextAction: n.nextAction,
    })
    const data = {
      part: { id: part.id, name: part.name, partNumber: part.partNumber, revision: part.revision, criticality: part.criticality, qualStatus: part.qualStatus, contains: [...own].filter((id) => id !== part.id) },
      supplier: supplier && { id: supplier.id, name: supplier.name, escapesLast12mo: supplier.escapesLast12mo },
      tests: tests.map((t) => ({ id: t.id, date: t.date, partId: t.partId, name: t.name, stage: t.stage, outcome: t.outcome, measured: t.measured ?? null, notes: t.notes ?? null })),
      nonconformances: ncrs.map(ncrRow),
      sameAssemblyNonconformances: related.map(ncrRow),
      requirements: reqs.map((r) => ({ id: r.id, title: r.title, status: verificationStatus(r) })),
    }
    return {
      data,
      citations: [cite.part(part), ...ncrs.map(cite.ncr), ...related.map(cite.ncr), ...reqs.map(cite.req)],
      summary: `${part.id}: ${tests.length} tests, ${ncrs.length} NCR${ncrs.length === 1 ? '' : 's'} on the part, ${related.length} in the same assembly`,
    }
  },
}

export const getContactWindows: ToolDef = {
  name: 'get_contact_windows',
  description: 'Ground contact and schedule from now: upcoming passes (and whether an operator is on console for them), eclipses, scheduled payload sessions, and timed events such as a conjunction closest approach. Use it to find out whether a human can be reached before a decision has to be made.',
  parameters: { type: 'object', properties: {} },
  run(_args, ctx?: ToolCtx) {
    if (!ctx) return needCtx()
    const s = SCENARIOS[ctx.scenario]
    const contact = nextContact(s, ctx.t)
    const data = {
      now: rel(ctx.t), missionDay: Math.floor(s.missionDay + ctx.t / 1440),
      operatorOnConsoleNow: false,
      nextOperatorContact: contact ? { station: contact.station, aos: rel(contact.start), minutesFromNow: Math.round(contact.start - ctx.t) } : null,
      passes: s.passes.filter((p) => p.end > ctx.t).map((p) => ({ station: p.station, aos: rel(p.start), los: rel(p.end), operatorAttended: p.attended })),
      eclipses: s.eclipses.filter((e) => e.end > ctx.t).slice(0, 3).map((e) => ({ start: rel(e.start), end: rel(e.end) })),
      scheduled: s.schedule.filter((x) => x.end > ctx.t).map((x) => ({ id: x.id, label: x.label, start: rel(x.start), end: rel(x.end), ...(x.id === XBAND_SESSION.id ? { powerW: XBAND_SESSION.watts } : {}) })),
      events: s.marks.filter((m) => m.t > ctx.t).map((m) => ({ label: m.label, at: rel(m.t), minutesFromNow: Math.round(m.t - ctx.t) })),
    }
    return {
      data,
      citations: [],
      summary: contact ? `next operator contact ${contact.station} in ${Math.round(contact.start - ctx.t)} min` : 'no operator contact scheduled',
    }
  },
}

const KINDS = Object.keys(ACTION_CLASSES) as ActionKind[]

export const proposeAction: ToolDef = {
  name: 'propose_action',
  description: `Propose a vehicle action. A deterministic autonomy policy (not you) checks it against its envelope and decides: auto (executes now because no operator can be reached in time), gated (queued for operator approval), or refused. Kinds: ${KINDS.map((k) => `${k} (${ACTION_CLASSES[k].label}: ${ACTION_CLASSES[k].policy})`).join('; ')}.`,
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: KINDS },
      session: { type: 'string', description: 'PAYLOAD_LOAD_SHED: the session id to shed, e.g. XB-0412' },
      procedure: { type: 'string', description: 'PROPULSION_PROCEDURE: what to do' },
      rationale: { type: 'string', description: 'One line: why, citing records' },
    },
    required: ['kind'],
  },
  run(args, ctx?: ToolCtx) {
    if (!ctx) return needCtx()
    const kind = KINDS.find((k) => k === str(args.kind)?.toUpperCase())
    if (!kind) return { data: { error: `kind must be one of ${KINDS.join(', ')}` }, citations: [], summary: 'unknown action kind' }
    const params = { ...(str(args.session) ? { session: str(args.session) } : {}), ...(str(args.procedure) ? { procedure: str(args.procedure) } : {}), rationale: str(args.rationale) }
    const d = decide(ctx.scenario, ctx.t, kind, params, ctx.actions)
    const verb = d.tier === 'auto' ? 'EXECUTED autonomously' : d.tier === 'gated' ? 'AWAITING operator approval' : 'REFUSED'
    return {
      data: { action: ACTION_CLASSES[kind].label, ...d, executed: d.tier === 'auto', deadline: d.deadline !== undefined ? rel(d.deadline) : null },
      citations: [],
      summary: `${ACTION_CLASSES[kind].label}: ${verb}`,
      decision: d,
    }
  },
}

export const draftFlightNcr: ToolDef = {
  name: 'draft_flight_ncr',
  description: 'Draft a flight nonconformance report that feeds the anomaly back into the build record (SpaceGradeOS). Tables are filled from telemetry and the part pedigree; you write the summary and recommended disposition. Use after diagnosing an anomaly.',
  parameters: {
    type: 'object',
    properties: {
      part: { type: 'string', description: 'Part id' },
      symptom: { type: 'string', description: 'One line, what was observed in flight' },
      evidence: { type: 'array', items: { type: 'string' }, description: 'Telemetry channel ids and record ids that support it' },
    },
    required: ['part', 'symptom'],
  },
  run(args, ctx?: ToolCtx) {
    if (!ctx) return needCtx()
    const part = resolveParts(str(args.part))[0]
    if (!part) return { data: { error: `No part matches ${String(args.part)}` }, citations: [], summary: 'no part matched' }
    const evidence = (Array.isArray(args.evidence) ? args.evidence : []).filter((x): x is string => typeof x === 'string')
    const telemetry = evidence.flatMap((id) => {
      const found = channelById(id)
      if (!found || found.scenario.id !== ctx.scenario) return []
      const pts = sample(found.channel, Math.max(found.scenario.range.start, ctx.t - 7 * 1440), ctx.t, 120, ctx.actions)
      const fit = pts.length > 2 ? linearFit(pts) : undefined
      return [{ ch: found.channel, latest: pts[pts.length - 1]?.v, perDay: fit ? fit.slope * 1440 : undefined }]
    })
    const parent = part.parentId
    const linked = db.nonconformances.filter((n) => n.partId === part.id || (parent && db.parts.find((p) => p.id === n.partId)?.parentId === parent))
    const s = SCENARIOS[ctx.scenario]
    const markdown = [
      `# Flight NCR draft: ${part.name}`,
      '',
      `**Vehicle:** ${db.program.name} · **Mission day:** ${Math.floor(s.missionDay + ctx.t / 1440)} · **Part:** ${part.id} (${part.partNumber} rev ${part.revision}) · **Status:** draft for MRB`,
      '',
      `**Symptom:** ${str(args.symptom) ?? ''}`,
      '',
      '## Flight evidence',
      '',
      '| Channel | Latest | Trend per day |',
      '|---|---|---|',
      ...telemetry.map((x) => `| ${x.ch.id} ${x.ch.label} | ${x.latest?.toFixed(x.ch.decimals)} ${x.ch.unit} | ${x.perDay !== undefined ? `${x.perDay.toFixed(3)} ${x.ch.unit}` : 'n/a'} |`),
      '',
      '## Linked build records',
      '',
      '| Record | Title | Status | Disposition |',
      '|---|---|---|---|',
      ...linked.map((n) => `| ${n.id} | ${n.title} | ${n.status} | ${n.disposition ?? 'none'} |`),
      '',
      '## Summary',
      '',
      '{{executive_summary}}',
      '',
      '## Recommended disposition and actions',
      '',
      '{{recommendation}}',
      '',
      '_Generated by SpaceGrade Agent from flight telemetry and the build pedigree. Synthetic data._',
    ].join('\n')
    return {
      data: { part: part.id, linkedRecords: linked.map((n) => n.id), evidence: telemetry.map((x) => x.ch.id), note: 'Draft created; write the summary and recommendation.' },
      citations: [cite.part(part), ...linked.map(cite.ncr), ...telemetry.map((x) => ({ type: 'telemetry' as const, id: x.ch.id, label: x.ch.label }))],
      summary: `flight NCR drafted for ${part.id}`,
      document: { title: `Flight NCR draft: ${part.name}`, markdown },
    }
  },
}

export const FLIGHT_TOOLS: ToolDef[] = [getTelemetry, getPartHistory, getContactWindows, proposeAction, draftFlightNcr]
