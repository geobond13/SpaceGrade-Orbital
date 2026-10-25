// Synthetic program data model. Every record id is human-readable so the
// agent can cite it (e.g. NCR-001, REQ-PROP-021, TR-014).

export type Assembly = 'Propulsion' | 'ADCS' | 'Power' | 'Avionics' | 'Comms' | 'Structure'

export type QualStatus = 'qualified' | 'in_qualification' | 'not_started'

export interface Part {
  id: string // P-PROP-03
  partNumber: string // KS1-PRP-1003
  name: string
  assembly: Assembly
  parentId?: string
  supplierId: string
  revision: string
  criticality: 'flight_critical' | 'mission' | 'support'
  qualStatus: QualStatus
  massKg: number
}

export type VerificationMethod = 'test' | 'analysis' | 'inspection' | 'demonstration'

/** A machine-checkable threshold, used by compare_suppliers. */
export interface Metric {
  key: string
  op: '<=' | '>='
  value: number
  unit: string
}

export interface Requirement {
  id: string // REQ-PROP-021
  level: 'L1' | 'L2' | 'L3'
  parentId?: string
  assembly: Assembly | 'System'
  title: string
  text: string
  method: VerificationMethod
  partIds: string[]
  metric?: Metric
}

export type TestOutcome = 'pass' | 'fail' | 'in_progress'

export interface TestResult {
  id: string // TR-014
  name: string
  stage: 'development' | 'qualification' | 'acceptance'
  partId: string
  requirementIds: string[]
  date: string
  outcome: TestOutcome
  measured?: string
  notes?: string
}

export interface Nonconformance {
  id: string // NCR-001
  title: string
  partId: string
  severity: 'critical' | 'major' | 'minor'
  status: 'open' | 'in_review' | 'dispositioned' | 'closed'
  disposition?: 'use_as_is' | 'rework' | 'repair' | 'scrap' | 'return_to_supplier'
  blocksQualification: boolean
  detectedBy?: string // TestResult id
  requirementIds: string[]
  opened: string
  owner: string
  description: string
  nextAction: string
}

export interface Supplier {
  id: string
  name: string
  location: string
  certifications: string[]
  onTimeDeliveryPct: number
  escapesLast12mo: number // nonconformances traced to supplier
  approved: boolean
}

export interface Quote {
  id: string
  supplierId: string
  partId: string
  unitPriceUsd: number
  nreUsd: number
  leadTimeWeeks: number
  heritage: string
  specs: Record<string, number> // keyed by Metric.key
  exceptions: string[]
  validUntil: string
}

export interface ProgramData {
  program: { name: string; description: string; phase: string; nextMilestone: string }
  parts: Part[]
  requirements: Requirement[]
  tests: TestResult[]
  nonconformances: Nonconformance[]
  suppliers: Supplier[]
  quotes: Quote[]
}
