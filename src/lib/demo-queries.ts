// The three scripted demo queries (also used by scripts/eval.ts and the UI).
export const DEMO_QUERIES = [
  {
    label: 'Propulsion blockers',
    question: "Which components on the propulsion assembly have open nonconformances, and what's blocking qualification?",
    mustCite: ['NCR-001', 'NCR-002'],
    expectDocument: false,
  },
  {
    label: 'Star tracker CDR readiness',
    question: 'Is the star tracker ready for CDR? Show the requirements that are not verified yet and what is needed to close them.',
    mustCite: ['REQ-ADCS-021', 'REQ-ADCS-023'],
    expectDocument: false,
  },
  {
    label: 'Valve trade study',
    question: 'Draft a trade study comparing Halden Valve Works and Corvid Flow Systems for the main isolation valve against our requirements.',
    mustCite: ['Q-101', 'Q-102'],
    expectDocument: true,
  },
] as const
