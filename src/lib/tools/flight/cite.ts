import type { Citation } from '../types'
import { channelById, CONJUNCTION_EVENT, OM_BURN, XBAND_SESSION } from '@/lib/flight/scenarios'
import { eventById } from '@/lib/flight/fdir'

/** Citation for a Flight Mode id (telemetry channel, FDIR event, conjunction message, payload session). */
export function flightCitationFor(id: string): Citation | undefined {
  const ch = channelById(id)
  if (ch) return { type: 'telemetry', id, label: ch.channel.label }
  const ev = eventById(id)
  if (ev) return { type: 'event', id, label: `FDIR ${ev.rule}` }
  if (id === CONJUNCTION_EVENT.cdm) return { type: 'conjunction', id, label: CONJUNCTION_EVENT.object }
  if (id === XBAND_SESSION.id) return { type: 'session', id, label: 'X-band payload downlink' }
  if (id === OM_BURN.id) return { type: 'session', id, label: 'Orbit maintenance burn' }
  return undefined
}
