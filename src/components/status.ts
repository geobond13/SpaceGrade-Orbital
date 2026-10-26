import type { PartStatus, VerificationStatus } from '@/lib/readiness'

/** CSS color and short label for every readiness status. Color is never the only signal. */
export const STATUS: Record<PartStatus | VerificationStatus, { color: string; label: string; hex: string }> = {
  blocked: { color: 'var(--st-blocked)', label: 'Blocked by NCR', hex: '#ff4d6d' },
  failed: { color: 'var(--st-failed)', label: 'Failed', hex: '#ff8f5a' },
  in_progress: { color: 'var(--st-in-progress)', label: 'In progress', hex: '#f5c451' },
  unverified: { color: 'var(--st-unverified)', label: 'Unverified', hex: '#5f7189' },
  verified: { color: 'var(--st-verified)', label: 'Verified', hex: '#4ade80' },
  none: { color: 'var(--st-none)', label: 'No requirements', hex: '#263241' },
}

export const ASSEMBLY_CODE: Record<string, string> = {
  System: 'SYS', Propulsion: 'PROP', ADCS: 'ADCS', Power: 'PWR', Avionics: 'AVN', Comms: 'COMM', Structure: 'STR',
}
