import type { PartStatus, VerificationStatus } from '@/lib/readiness'

/**
 * CSS color and short label for every readiness status. Color is never the only signal.
 * Validated on the dark surface (#0b1118) with the dataviz palette checker: all pairs pass
 * normal-vision (ΔE ≥ 17.8) and contrast. Unverified↔blocked is ΔE 6.0 for protan, so those
 * always carry secondary encoding: unverified is drawn hollow, blocked pulses with an NCR tag.
 */
export const STATUS: Record<PartStatus | VerificationStatus, { color: string; label: string; hex: string }> = {
  blocked: { color: 'var(--st-blocked)', label: 'Blocked by NCR', hex: '#ff4d6d' },
  failed: { color: 'var(--st-failed)', label: 'Failed', hex: '#ff9a3d' },
  in_progress: { color: 'var(--st-in-progress)', label: 'In progress', hex: '#8f8cff' },
  unverified: { color: 'var(--st-unverified)', label: 'Unverified', hex: '#5f7189' },
  verified: { color: 'var(--st-verified)', label: 'Verified', hex: '#2dd4bf' },
  none: { color: 'var(--st-none)', label: 'No requirements', hex: '#263241' },
}

export const ASSEMBLY_CODE: Record<string, string> = {
  System: 'SYS', Propulsion: 'PROP', ADCS: 'ADCS', Power: 'PWR', Avionics: 'AVN', Comms: 'COMM', Structure: 'STR',
}
