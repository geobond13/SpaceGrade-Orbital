// Flight Mode tools. Same contract as the program tools ({ data, citations, summary }),
// plus a ToolCtx carrying the scenario, sim time and executed actions. Telemetry is
// only ever read up to "now": the agent cannot see the future.

import type { ToolCtx, ToolDef, ToolResult } from '../types'
import { cite, db, isOpen, resolveParts, str, verificationStatus } from '../lookup'
import { channelById, COMMAND_PATH, CONJUNCTION_EVENT, falseSafeModeT, knowledgeErrorDeg, leakFit, trackerHealthCount, nextContact, OM_BURN, sample, scheduleFor, scenarioWith, sunAngleDeg, TRACKER, TRACKER_OUTAGES, XBAND_SESSION, type Channel, type Conditions, type ScenarioId } from '@/lib/flight/scenarios'
import { linearFit } from '@/lib/flight/fdir'
import { ACTION_CLASSES, decide } from '@/lib/flight/autonomy'
import { TANK } from '@/lib/flight/physics'
import { asFlown } from '@/lib/flight/as-flown'
import type { ActionKind } from '@/lib/flight/scenarios'

const needCtx = (): ToolResult => ({ data: { error: 'Flight tools need a flight context' }, citations: [], summary: 'no flight context' })
const round = (v: number, d: number) => Number.isFinite(v) ? Number(v.toFixed(d)) : null
const rel = (m: number) => `T${m >= 0 ? '+' : ''}${Math.round(m)} min`

function channelsFor(scenario: ScenarioId, args: Record<string, unknown>, cond?: Conditions): Channel[] {
  const s = scenarioWith(scenario, cond)
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
  description: 'Read spacecraft telemetry up to now: latest value, range, fitted trend, and the residual against a model built from the spec sheet. Filter by channel id or name (e.g. "tank pressure", "battery voltage", "miss distance", "star tracker") or by part. Pressure channels include the equivalent helium leak rate and an end-of-life delta-v projection; the star tracker channel lists each outage with its sun angle.',
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
    const s = scenarioWith(ctx.scenario, ctx.cond)
    const span = typeof args.window_min === 'number' && args.window_min > 0 ? args.window_min : ctx.t - s.view.start
    const from = Math.max(s.range.start, ctx.t - span)
    const channels = channelsFor(ctx.scenario, args, ctx.cond)
    const data = channels.map((c) => {
      const pts = sample(c, from, ctx.t, 240, ctx.actions)
      if (pts.length === 0) return { id: c.id, label: c.label, note: 'no data yet' }
      const fit = pts.length > 2 ? linearFit(pts) : undefined
      const last = pts[pts.length - 1]
      const out: Record<string, unknown> = {
        id: c.id, label: c.label, unit: c.unit, partId: c.partId,
        window: `${rel(from)} to ${rel(ctx.t)}`, latestAt: rel(last.t),
        latest: round(last.v, c.decimals), min: round(Math.min(...pts.map((p) => p.v)), c.decimals), max: round(Math.max(...pts.map((p) => p.v)), c.decimals),
        trendPerHour: fit && round(fit.slope * 60, c.decimals + 2),
        trendPerDay: fit && round(fit.slope * 1440, c.decimals + 1),
        trendSignificance: fit && round(Math.abs(fit.slope / fit.se), 1),
      }
      if (last.spec !== undefined) out.residualVsSpecModel = round(last.v - last.spec, c.decimals)
      if (c.id === 'TM-PROP-03' && ctx.scenario === 'valve-leak') {
        // The same 7-day fit the FDIR rule and the autonomy policy use, so every number agrees.
        const leak = leakFit(ctx.t)
        const day = leak.dayLost
        const today = Math.floor(s.missionDay + ctx.t / 1440)
        const remaining = Math.round(leak.remainingAtEndOfLifeMs)
        out.equivalentHeliumLeakSccs = Number(leak.leakSccs.toExponential(2))
        out.projectionIfLeakContinues = {
          statement: `If the leak continues, ${remaining} m/s of delta-v REMAINS at end of life, ${Math.round(leak.shortfallMs)} m/s SHORT of the ${TANK.requiredDeltaVMs} m/s required (REQ-SYS-002).`,
          note: 'Leaked helium cannot push propellant out: below 100 psia feed pressure the remaining propellant is stranded.',
          deltaVRemainingAtEndOfLifeMs: remaining, deltaVShortfallMs: Math.round(leak.shortfallMs),
          deltaVBudgetMs: TANK.deltaVBudgetMs, deltaVRequiredMs: TANK.requiredDeltaVMs, requirement: 'REQ-SYS-002',
          missionDayNow: today,
          missionDayRequirementLost: day ?? null,
          daysUntilRequirementLost: day !== undefined ? day - today : null,
        }
      }
      if (c.unit === 'V' && c.specModel) {
        out.residualAtEclipseEnds = s.eclipses.filter((e) => e.end <= ctx.t && e.end >= from)
          .map((e) => ({ eclipseEnd: rel(e.end), residualV: round(c.value(e.end - 0.5, ctx.actions) - c.specModel!(e.end - 0.5, ctx.actions), 3) }))
      }
      if (c.id === 'TM-ADCS-02') {
        // Outages seen so far, with the sun geometry at loss and reacquisition: the evidence for a stray-light limit.
        const seen = TRACKER_OUTAGES.filter((o) => o.start >= from && o.start < ctx.t)
        out.outages = seen.map((o) => ({
          lost: rel(o.start), reacquired: o.end <= ctx.t ? rel(o.end) : 'not yet', minutes: o.end <= ctx.t ? Math.round(o.end - o.start) : null,
          sunAngleAtLossDeg: round(sunAngleDeg(o.start), 1), sunAngleAtReacquireDeg: o.end <= ctx.t ? round(sunAngleDeg(o.end), 1) : null,
          minSunAngleDeg: round(sunAngleDeg((o.start + o.end) / 2), 1), peakKnowledgeErrorDeg: round(knowledgeErrorDeg(Math.min(o.end, ctx.t) - 0.01), 3),
        }))
        out.sunExclusionSpecDeg = TRACKER.specExclusionDeg
        out.specModelPredictsOutages = false
        out.imuOnlyDriftDegPerMin = TRACKER.imuDriftDegPerMin
        const trip = falseSafeModeT()
        out.healthCounter = { now: trackerHealthCount(ctx.t, ctx.actions), safeModeAt: TRACKER.safeModeCount, reachesSafeModeAt: trip !== undefined && trackerHealthCount(trip, ctx.actions) >= TRACKER.safeModeCount ? rel(trip) : null, note: 'Every outage counts as a tracker fault, whatever the sun angle.' }
        // Sun geometry repeats every orbit, so the observed loss angle predicts the next outage.
        const next = TRACKER_OUTAGES.find((o) => o.start >= ctx.t)
        if (next) out.nextOutageIfSameLossAngle = { start: rel(next.start), end: rel(next.end), knowledgeErrorAtEndDeg: round(knowledgeErrorDeg(next.end - 0.01), 2) }
      }
      if (c.id.startsWith('TM-CONJ')) {
        out.conjunction = {
          id: CONJUNCTION_EVENT.cdm, object: CONJUNCTION_EVENT.object, closestApproach: rel(CONJUNCTION_EVENT.tca),
          avoidanceChain: 'An avoidance burn uses the 1 N thrusters (P-PROP-04). Each needs its catalyst bed preheated to 315 °C (P-PROP-05, REQ-PROP-028) before it can fire, so burn timing depends on that heater.',
        }
      }
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
  run(args, ctx?: ToolCtx) {
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
      // In flight, the qualification-era record is followed by how the MRB closed it out before launch.
      ...(ctx ? { asFlown: asFlown(n.id, ctx.cond) ?? null } : {}),
    })
    const data = {
      ...(ctx ? { note: 'Records are the build record as of qualification; asFlown on each NCR is the disposition the vehicle launched with. The vehicle is in orbit: hardware cannot be repaired or replaced, only operated around now or fixed on the next build.' } : {}),
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
    const s = scenarioWith(ctx.scenario, ctx.cond)
    const contact = nextContact(s, ctx.t)
    const data = {
      now: rel(ctx.t), missionDay: Math.floor(s.missionDay + ctx.t / 1440),
      operatorOnConsoleNow: false,
      commandLink: `${COMMAND_PATH.label}: ${COMMAND_PATH.detail}. Operators, not the link, are what is unavailable.`,
      nextOperatorContact: contact ? { station: contact.station, aos: rel(contact.start), minutesFromNow: Math.round(contact.start - ctx.t) } : null,
      operatorContacts: s.passes.filter((p) => p.end > ctx.t).map((p) => ({ station: p.station, aos: rel(p.start), los: rel(p.end), operatorAttended: p.attended })),
      eclipses: s.eclipses.filter((e) => e.end > ctx.t).slice(0, 3).map((e) => ({ start: rel(e.start), end: rel(e.end) })),
      scheduled: scheduleFor(s, ctx.actions).filter((x) => x.end > ctx.t).map((x) => ({
        id: x.id, label: x.label, start: rel(x.start), end: rel(x.end),
        ...(x.id === XBAND_SESSION.id ? { powerW: XBAND_SESSION.watts } : {}),
        ...(x.id === OM_BURN.id ? { deltaVMs: OM_BURN.deltaVMs, needs: 'attitude knowledge within 0.02° (REQ-ADCS-010) at ignition; the sequencer fires it automatically' } : {}),
      })),
      events: s.marks.filter((m) => m.t > ctx.t).map((m) => ({ label: m.label, at: rel(m.t), minutesFromNow: Math.round(m.t - ctx.t) })),
    }
    return {
      data,
      citations: [],
      summary: contact ? `next operator contact ${contact.station} in ${Math.round(contact.start - ctx.t)} min` : 'no operator contact scheduled',
    }
  },
}

// Flight NCRs go through draft_flight_ncr, so they are not offered here.
const KINDS = (Object.keys(ACTION_CLASSES) as ActionKind[]).filter((k) => k !== 'FLIGHT_NCR_DRAFT')

export const proposeAction: ToolDef = {
  name: 'propose_action',
  description: `Propose a vehicle action. A deterministic autonomy policy (not you) checks it against its envelope and decides: auto (executes now because no operator can be reached in time), gated (queued for operator approval), or refused. Kinds: ${KINDS.map((k) => `${k} (${ACTION_CLASSES[k].label}: ${ACTION_CLASSES[k].policy})`).join('; ')}.`,
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: KINDS },
      session: { type: 'string', description: 'PAYLOAD_LOAD_SHED: the session id to shed, e.g. XB-0412' },
      burn: { type: 'string', description: 'BURN_RETIME: the scheduled burn id, e.g. OM-0417. The policy picks the new time.' },
      table: { type: 'string', description: 'ONBOARD_TABLE_UPDATE: which onboard table or limit, e.g. star tracker sun exclusion angle. The policy derives the value from flight data.' },
      procedure: { type: 'string', description: 'PROPULSION_PROCEDURE: what to do' },
      rationale: { type: 'string', description: 'One line: why, citing records' },
    },
    required: ['kind'],
  },
  run(args, ctx?: ToolCtx) {
    if (!ctx) return needCtx()
    // Small models sometimes truncate enum values ("COL"); accept an unambiguous prefix.
    const raw = str(args.kind)?.toUpperCase().replace(/[^A-Z_]/g, '') ?? ''
    const prefixed = raw.length >= 3 ? KINDS.filter((k) => k.startsWith(raw)) : []
    const kind = KINDS.find((k) => k === raw) ?? (prefixed.length === 1 ? prefixed[0] : undefined)
    if (!kind) return { data: { error: `kind must be one of ${KINDS.join(', ')}` }, citations: [], summary: 'unknown action kind' }
    const params = { ...(str(args.session) ? { session: str(args.session) } : {}), ...(str(args.burn) ? { burn: str(args.burn) } : {}), ...(str(args.table) ? { table: str(args.table) } : {}), ...(str(args.procedure) ? { procedure: str(args.procedure) } : {}), rationale: str(args.rationale) }
    const d = decide(ctx.scenario, ctx.t, kind, params, ctx.actions, ctx.cond)
    const verb = d.tier === 'auto' ? 'authorised autonomously' : d.tier === 'gated' ? 'awaiting operator approval' : 'REFUSED'
    return {
      data: {
        action: ACTION_CLASSES[kind].label, ...d, timing: undefined,
        status: d.tier === 'auto' ? 'AUTHORISED by the policy and uplinked; the effect follows over time (e.g. preheat, then burn)' : d.tier === 'gated' ? 'WAITING for an operator decision at the next operator contact' : 'REFUSED',
        deadline: d.deadline !== undefined ? rel(d.deadline) : null,
        nextOperatorContact: d.nextContact ? `${d.nextContact.station} ${rel(d.nextContact.start)}` : null,
        note: 'The policy recomputed the deadline and operator reachability from its own models. These values are authoritative; use them, not your own estimate.',
      },
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
    const s = scenarioWith(ctx.scenario, ctx.cond)
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
