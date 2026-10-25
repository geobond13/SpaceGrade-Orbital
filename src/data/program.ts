// KESTREL-1: a fictional 180 kg ESPA-class Earth-observation smallsat in
// qualification. All companies, people and numbers are synthetic.

import type {
  Assembly, Nonconformance, Part, ProgramData, QualStatus, Quote, Requirement,
  Supplier, TestOutcome, TestResult,
} from './types'

const suppliers: Supplier[] = [
  { id: 'SUP-HALDEN', name: 'Halden Valve Works', location: 'Ogden, UT', certifications: ['AS9100D'], onTimeDeliveryPct: 82, escapesLast12mo: 3, approved: true },
  { id: 'SUP-CORVID', name: 'Corvid Flow Systems', location: 'Torrance, CA', certifications: ['AS9100D', 'NADCAP welding'], onTimeDeliveryPct: 96, escapesLast12mo: 0, approved: true },
  { id: 'SUP-MERIDIAN', name: 'Meridian Propulsion', location: 'Huntsville, AL', certifications: ['AS9100D'], onTimeDeliveryPct: 88, escapesLast12mo: 2, approved: true },
  { id: 'SUP-LUMEN', name: 'Lumen Optics', location: 'Boulder, CO', certifications: ['AS9100D', 'ISO 9001'], onTimeDeliveryPct: 91, escapesLast12mo: 1, approved: true },
  { id: 'SUP-ARCLIGHT', name: 'Arclight Energy', location: 'Austin, TX', certifications: ['AS9100D'], onTimeDeliveryPct: 85, escapesLast12mo: 2, approved: true },
  { id: 'SUP-KELVIN', name: 'Kelvin Sensors', location: 'Phoenix, AZ', certifications: ['AS9100D'], onTimeDeliveryPct: 94, escapesLast12mo: 0, approved: true },
  { id: 'SUP-TALON', name: 'Talon Avionics', location: 'Melbourne, FL', certifications: ['AS9100D'], onTimeDeliveryPct: 90, escapesLast12mo: 1, approved: true },
  { id: 'SUP-ORBWAVE', name: 'Orbwave RF', location: 'San Diego, CA', certifications: ['ISO 9001'], onTimeDeliveryPct: 87, escapesLast12mo: 1, approved: true },
  { id: 'SUP-INHOUSE', name: 'Kestrel in-house', location: 'Denver, CO', certifications: ['AS9100D'], onTimeDeliveryPct: 93, escapesLast12mo: 0, approved: true },
]

type PartRow = [id: string, pn: string, name: string, assembly: Assembly, parent: string | null, supplier: string, crit: Part['criticality'], qual: QualStatus, massKg: number]

const partRows: PartRow[] = [
  ['P-PROP-01', 'KS1-PRP-1001', 'Propulsion module assembly', 'Propulsion', null, 'SUP-INHOUSE', 'flight_critical', 'in_qualification', 18.2],
  ['P-PROP-02', 'KS1-PRP-1002', 'Propellant tank, 12 L titanium', 'Propulsion', 'P-PROP-01', 'SUP-MERIDIAN', 'flight_critical', 'qualified', 3.1],
  ['P-PROP-03', 'KS1-PRP-1003', 'Main isolation latch valve', 'Propulsion', 'P-PROP-01', 'SUP-HALDEN', 'flight_critical', 'in_qualification', 0.32],
  ['P-PROP-04', 'KS1-PRP-1004', '1 N monopropellant thruster', 'Propulsion', 'P-PROP-01', 'SUP-MERIDIAN', 'flight_critical', 'in_qualification', 0.38],
  ['P-PROP-05', 'KS1-PRP-1005', 'Catalyst bed heater', 'Propulsion', 'P-PROP-04', 'SUP-MERIDIAN', 'flight_critical', 'in_qualification', 0.04],
  ['P-PROP-06', 'KS1-PRP-1006', 'Propellant pressure transducer', 'Propulsion', 'P-PROP-01', 'SUP-KELVIN', 'mission', 'qualified', 0.09],
  ['P-PROP-07', 'KS1-PRP-1007', 'Fill and drain valve', 'Propulsion', 'P-PROP-01', 'SUP-HALDEN', 'mission', 'qualified', 0.11],
  ['P-PROP-08', 'KS1-PRP-1008', 'Propellant filter, 10 µm', 'Propulsion', 'P-PROP-01', 'SUP-CORVID', 'mission', 'qualified', 0.06],
  ['P-PROP-09', 'KS1-PRP-1009', 'Feed line tubing set', 'Propulsion', 'P-PROP-01', 'SUP-INHOUSE', 'mission', 'qualified', 0.4],
  ['P-PROP-10', 'KS1-PRP-1010', 'Propulsion harness', 'Propulsion', 'P-PROP-01', 'SUP-INHOUSE', 'support', 'in_qualification', 0.25],

  ['P-ADCS-01', 'KS1-ADC-2001', 'ADCS module assembly', 'ADCS', null, 'SUP-INHOUSE', 'flight_critical', 'in_qualification', 9.4],
  ['P-ADCS-02', 'KS1-ADC-2002', 'Star tracker', 'ADCS', 'P-ADCS-01', 'SUP-LUMEN', 'flight_critical', 'in_qualification', 0.28],
  ['P-ADCS-03', 'KS1-ADC-2003', 'Star tracker baffle', 'ADCS', 'P-ADCS-02', 'SUP-LUMEN', 'mission', 'in_qualification', 0.12],
  ['P-ADCS-04', 'KS1-ADC-2004', 'Reaction wheel', 'ADCS', 'P-ADCS-01', 'SUP-TALON', 'flight_critical', 'qualified', 0.95],
  ['P-ADCS-05', 'KS1-ADC-2005', 'Magnetorquer rod', 'ADCS', 'P-ADCS-01', 'SUP-TALON', 'mission', 'qualified', 0.21],
  ['P-ADCS-06', 'KS1-ADC-2006', 'Coarse sun sensor', 'ADCS', 'P-ADCS-01', 'SUP-LUMEN', 'mission', 'qualified', 0.03],
  ['P-ADCS-07', 'KS1-ADC-2007', 'MEMS IMU', 'ADCS', 'P-ADCS-01', 'SUP-KELVIN', 'mission', 'qualified', 0.07],
  ['P-ADCS-08', 'KS1-ADC-2008', 'Three-axis magnetometer', 'ADCS', 'P-ADCS-01', 'SUP-KELVIN', 'mission', 'qualified', 0.05],
  ['P-ADCS-09', 'KS1-ADC-2009', 'ADCS computer', 'ADCS', 'P-ADCS-01', 'SUP-TALON', 'flight_critical', 'qualified', 0.4],

  ['P-PWR-01', 'KS1-PWR-3001', 'Electrical power subsystem assembly', 'Power', null, 'SUP-INHOUSE', 'flight_critical', 'in_qualification', 14.6],
  ['P-PWR-02', 'KS1-PWR-3002', 'Li-ion battery pack, 8S2P', 'Power', 'P-PWR-01', 'SUP-ARCLIGHT', 'flight_critical', 'in_qualification', 3.8],
  ['P-PWR-03', 'KS1-PWR-3003', 'Battery cell lot L-2611', 'Power', 'P-PWR-02', 'SUP-ARCLIGHT', 'flight_critical', 'in_qualification', 0.0],
  ['P-PWR-04', 'KS1-PWR-3004', 'Deployable solar array wing', 'Power', 'P-PWR-01', 'SUP-ARCLIGHT', 'flight_critical', 'qualified', 4.2],
  ['P-PWR-05', 'KS1-PWR-3005', 'Triple-junction solar cell string', 'Power', 'P-PWR-04', 'SUP-ARCLIGHT', 'mission', 'qualified', 0.6],
  ['P-PWR-06', 'KS1-PWR-3006', 'Power conditioning and distribution unit', 'Power', 'P-PWR-01', 'SUP-TALON', 'flight_critical', 'qualified', 2.1],
  ['P-PWR-07', 'KS1-PWR-3007', 'Hold-down and release mechanism', 'Power', 'P-PWR-04', 'SUP-INHOUSE', 'flight_critical', 'qualified', 0.3],
  ['P-PWR-08', 'KS1-PWR-3008', 'Power harness', 'Power', 'P-PWR-01', 'SUP-INHOUSE', 'support', 'qualified', 1.1],

  ['P-AV-01', 'KS1-AVN-4001', 'On-board computer', 'Avionics', null, 'SUP-TALON', 'flight_critical', 'qualified', 1.2],
  ['P-AV-02', 'KS1-AVN-4002', 'Flight software build 3.2', 'Avionics', 'P-AV-01', 'SUP-INHOUSE', 'flight_critical', 'in_qualification', 0],
  ['P-AV-03', 'KS1-AVN-4003', 'Mass memory unit, 512 GB', 'Avionics', 'P-AV-01', 'SUP-TALON', 'mission', 'qualified', 0.6],
  ['P-AV-04', 'KS1-AVN-4004', 'Payload interface board', 'Avionics', 'P-AV-01', 'SUP-INHOUSE', 'mission', 'in_qualification', 0.3],
  ['P-AV-05', 'KS1-AVN-4005', 'GNSS receiver', 'Avionics', 'P-AV-01', 'SUP-TALON', 'mission', 'qualified', 0.15],
  ['P-AV-06', 'KS1-AVN-4006', 'Watchdog and reset board', 'Avionics', 'P-AV-01', 'SUP-INHOUSE', 'flight_critical', 'qualified', 0.1],
  ['P-AV-07', 'KS1-AVN-4007', 'Avionics chassis', 'Avionics', null, 'SUP-INHOUSE', 'support', 'qualified', 1.4],
  ['P-AV-08', 'KS1-AVN-4008', 'Avionics harness', 'Avionics', null, 'SUP-INHOUSE', 'support', 'qualified', 0.9],

  ['P-COM-01', 'KS1-COM-5001', 'S-band transceiver', 'Comms', null, 'SUP-ORBWAVE', 'flight_critical', 'qualified', 0.5],
  ['P-COM-02', 'KS1-COM-5002', 'S-band patch antenna', 'Comms', 'P-COM-01', 'SUP-ORBWAVE', 'mission', 'qualified', 0.08],
  ['P-COM-03', 'KS1-COM-5003', 'UHF radio', 'Comms', null, 'SUP-ORBWAVE', 'mission', 'qualified', 0.1],
  ['P-COM-04', 'KS1-COM-5004', 'UHF deployable antenna', 'Comms', 'P-COM-03', 'SUP-ORBWAVE', 'mission', 'qualified', 0.1],
  ['P-COM-05', 'KS1-COM-5005', 'X-band payload transmitter', 'Comms', null, 'SUP-ORBWAVE', 'mission', 'in_qualification', 0.7],
  ['P-COM-06', 'KS1-COM-5006', 'RF coax cable set', 'Comms', null, 'SUP-INHOUSE', 'support', 'qualified', 0.3],

  ['P-STR-01', 'KS1-STR-6001', 'Primary structure', 'Structure', null, 'SUP-INHOUSE', 'flight_critical', 'qualified', 28.5],
  ['P-STR-02', 'KS1-STR-6002', 'Separation ring interface', 'Structure', 'P-STR-01', 'SUP-INHOUSE', 'flight_critical', 'qualified', 2.2],
  ['P-STR-03', 'KS1-STR-6003', 'Side panel set', 'Structure', 'P-STR-01', 'SUP-INHOUSE', 'mission', 'qualified', 6.4],
  ['P-STR-04', 'KS1-STR-6004', 'Radiator panel', 'Structure', 'P-STR-01', 'SUP-INHOUSE', 'mission', 'qualified', 1.8],
  ['P-STR-05', 'KS1-STR-6005', 'MLI blanket set', 'Structure', 'P-STR-01', 'SUP-INHOUSE', 'mission', 'qualified', 1.2],
  ['P-STR-06', 'KS1-STR-6006', 'Survival heater set', 'Structure', 'P-STR-01', 'SUP-KELVIN', 'mission', 'qualified', 0.2],
  ['P-STR-07', 'KS1-STR-6007', 'Thermistor set', 'Structure', 'P-STR-01', 'SUP-KELVIN', 'support', 'qualified', 0.05],
  ['P-STR-08', 'KS1-STR-6008', 'Payload bracket', 'Structure', 'P-STR-01', 'SUP-INHOUSE', 'mission', 'qualified', 0.9],
  ['P-STR-09', 'KS1-STR-6009', 'Flight fastener kit', 'Structure', 'P-STR-01', 'SUP-INHOUSE', 'support', 'qualified', 0.4],
]

const parts: Part[] = partRows.map(([id, partNumber, name, assembly, parent, supplierId, criticality, qualStatus, massKg]) => ({
  id, partNumber, name, assembly, ...(parent ? { parentId: parent } : {}), supplierId, revision: 'B', criticality, qualStatus, massKg,
}))

// How each requirement is (or is not) verified. Drives test generation below.
interface Verify { outcome: TestOutcome | 'none'; name?: string; stage?: TestResult['stage']; date?: string; measured?: string; notes?: string }

type ReqSeed = Requirement & { verify: Verify }

const reqSeeds: ReqSeed[] = [
  { id: 'REQ-SYS-001', level: 'L1', assembly: 'System', title: 'Mission life', text: 'The spacecraft shall support a mission life of at least 5 years in a 550 km sun-synchronous orbit.', method: 'analysis', partIds: [], verify: { outcome: 'in_progress', name: 'Reliability and lifetime analysis', stage: 'development', date: '2026-10-02' } },
  { id: 'REQ-SYS-002', level: 'L1', assembly: 'System', title: 'Delta-v budget', text: 'The spacecraft shall provide at least 120 m/s of delta-v for orbit maintenance and end-of-life deorbit.', method: 'analysis', partIds: ['P-PROP-01'], verify: { outcome: 'pass', name: 'Delta-v budget analysis rev C', stage: 'development', date: '2026-08-14', measured: '131 m/s with 10% margin' } },
  { id: 'REQ-SYS-003', level: 'L1', assembly: 'System', title: 'Pointing accuracy', text: 'The spacecraft shall point the payload boresight to within 0.05 degrees (3 sigma).', method: 'analysis', partIds: ['P-ADCS-01'], verify: { outcome: 'in_progress', name: 'Pointing budget analysis', stage: 'development', date: '2026-10-11' } },
  { id: 'REQ-SYS-004', level: 'L1', assembly: 'System', title: 'Launch environment', text: 'The spacecraft shall survive the launch environment defined in the rideshare user guide, including 14.1 Grms qualification random vibration.', method: 'test', partIds: ['P-STR-01'], verify: { outcome: 'pass', name: 'Structural qualification model random vibration', stage: 'qualification', date: '2026-07-22', measured: '14.1 Grms, 2 min/axis, no anomalies' } },

  { id: 'REQ-PROP-010', level: 'L2', parentId: 'REQ-SYS-002', assembly: 'Propulsion', title: 'Total impulse', text: 'The propulsion module shall deliver a total impulse of at least 4,000 N·s.', method: 'test', partIds: ['P-PROP-01'], verify: { outcome: 'in_progress', name: 'Propulsion module hot-fire series', stage: 'qualification', date: '2026-10-20', notes: 'Paused pending NCR-001 and NCR-002 dispositions.' } },
  { id: 'REQ-PROP-011', level: 'L2', parentId: 'REQ-SYS-004', assembly: 'Propulsion', title: 'Propulsion module vibration', text: 'The propulsion module shall survive 14.1 Grms qualification random vibration without leakage or loss of function.', method: 'test', partIds: ['P-PROP-01'], verify: { outcome: 'pass', name: 'Propulsion module qual random vibration', stage: 'qualification', date: '2026-09-03', measured: '14.1 Grms, post-test leak check nominal' } },
  { id: 'REQ-PROP-012', level: 'L2', parentId: 'REQ-SYS-001', assembly: 'Propulsion', title: 'External leakage', text: 'The propulsion module external leakage shall not exceed 1.0e-6 scc/s GHe at MEOP.', method: 'test', partIds: ['P-PROP-01'], verify: { outcome: 'pass', name: 'Module external helium leak test', stage: 'qualification', date: '2026-09-05', measured: '3.0e-7 scc/s GHe' } },
  { id: 'REQ-PROP-020', level: 'L3', parentId: 'REQ-PROP-012', assembly: 'Propulsion', title: 'Isolation valve internal leakage', text: 'The main isolation valve internal (seat) leakage shall not exceed 1.0e-4 scc/s GHe at MEOP (300 psia) across the qualification temperature range.', method: 'test', partIds: ['P-PROP-03'], metric: { key: 'internal_leak_sccs', op: '<=', value: 1.0e-4, unit: 'scc/s GHe' }, verify: { outcome: 'fail', name: 'Isolation valve seat leak, post thermal cycle 3', stage: 'qualification', date: '2026-10-09', measured: '3.2e-4 scc/s GHe', notes: 'Leak rose after third thermal cycle. NCR-001 raised.' } },
  { id: 'REQ-PROP-021', level: 'L3', parentId: 'REQ-PROP-012', assembly: 'Propulsion', title: 'Isolation valve proof pressure', text: 'The main isolation valve shall withstand a proof pressure of at least 450 psia (1.5 x MEOP).', method: 'test', partIds: ['P-PROP-03'], metric: { key: 'proof_pressure_psia', op: '>=', value: 450, unit: 'psia' }, verify: { outcome: 'pass', name: 'Isolation valve proof pressure', stage: 'qualification', date: '2026-09-18', measured: '450 psia, 5 min hold, no permanent deformation' } },
  { id: 'REQ-PROP-022', level: 'L3', parentId: 'REQ-PROP-010', assembly: 'Propulsion', title: 'Isolation valve pull-in power', text: 'The main isolation valve pull-in power shall not exceed 8 W at 28 V.', method: 'test', partIds: ['P-PROP-03'], metric: { key: 'pull_in_power_w', op: '<=', value: 8, unit: 'W' }, verify: { outcome: 'pass', name: 'Isolation valve electrical characterisation', stage: 'qualification', date: '2026-09-19', measured: '7.4 W at 28 V' } },
  { id: 'REQ-PROP-023', level: 'L3', parentId: 'REQ-SYS-002', assembly: 'Propulsion', title: 'Isolation valve mass', text: 'The main isolation valve mass shall not exceed 0.35 kg.', method: 'inspection', partIds: ['P-PROP-03'], metric: { key: 'mass_kg', op: '<=', value: 0.35, unit: 'kg' }, verify: { outcome: 'pass', name: 'Isolation valve mass properties', stage: 'acceptance', date: '2026-08-28', measured: '0.32 kg' } },
  { id: 'REQ-PROP-024', level: 'L3', parentId: 'REQ-SYS-001', assembly: 'Propulsion', title: 'Isolation valve cycle life', text: 'The main isolation valve shall complete at least 5,000 open/close cycles without exceeding the leakage limit.', method: 'test', partIds: ['P-PROP-03'], metric: { key: 'cycle_life', op: '>=', value: 5000, unit: 'cycles' }, verify: { outcome: 'in_progress', name: 'Isolation valve life cycle test', stage: 'qualification', date: '2026-10-14', measured: '2,150 of 5,000 cycles', notes: 'On hold while NCR-001 is investigated.' } },
  { id: 'REQ-PROP-025', level: 'L3', parentId: 'REQ-PROP-010', assembly: 'Propulsion', title: 'Isolation valve response time', text: 'The main isolation valve shall open or close within 15 ms of command.', method: 'test', partIds: ['P-PROP-03'], metric: { key: 'response_ms', op: '<=', value: 15, unit: 'ms' }, verify: { outcome: 'pass', name: 'Isolation valve response time', stage: 'qualification', date: '2026-09-19', measured: '11.8 ms open, 9.6 ms close' } },
  { id: 'REQ-PROP-026', level: 'L3', parentId: 'REQ-PROP-012', assembly: 'Propulsion', title: 'Tank proof and burst', text: 'The propellant tank shall withstand 1.5 x MEOP proof and demonstrate a 2.5 x MEOP burst factor by analysis or test.', method: 'test', partIds: ['P-PROP-02'], verify: { outcome: 'pass', name: 'Tank proof pressure and radiography', stage: 'qualification', date: '2026-06-30', measured: '450 psia proof; burst factor 2.9 by test on QM' } },
  { id: 'REQ-PROP-027', level: 'L3', parentId: 'REQ-PROP-010', assembly: 'Propulsion', title: 'Thruster steady-state thrust', text: 'Each thruster shall produce 1.0 N ± 10% steady-state thrust at 300 psia feed pressure.', method: 'test', partIds: ['P-PROP-04'], verify: { outcome: 'in_progress', name: 'Thruster qualification hot-fire', stage: 'qualification', date: '2026-10-16', notes: 'Blocked: catalyst bed preheat does not meet REQ-PROP-028 (NCR-002).' } },
  { id: 'REQ-PROP-028', level: 'L3', parentId: 'REQ-PROP-027', assembly: 'Propulsion', title: 'Catalyst bed preheat', text: 'The catalyst bed heater shall bring the bed to at least 315 °C within 30 minutes at no more than 12 W.', method: 'test', partIds: ['P-PROP-05'], verify: { outcome: 'fail', name: 'Catalyst bed preheat characterisation', stage: 'qualification', date: '2026-10-12', measured: '290 °C at 30 min, 12 W; heater 52 Ω vs 46 ± 2 Ω', notes: 'NCR-002 raised.' } },
  { id: 'REQ-PROP-029', level: 'L3', parentId: 'REQ-PROP-012', assembly: 'Propulsion', title: 'Propellant filtration', text: 'The propellant filter shall retain particles of 10 µm and larger (absolute rating).', method: 'test', partIds: ['P-PROP-08'], verify: { outcome: 'pass', name: 'Filter bubble point and particle challenge', stage: 'acceptance', date: '2026-07-08', measured: '10 µm absolute confirmed' } },

  { id: 'REQ-ADCS-010', level: 'L2', parentId: 'REQ-SYS-003', assembly: 'ADCS', title: 'Attitude knowledge', text: 'The ADCS shall determine attitude to within 0.02 degrees (3 sigma).', method: 'analysis', partIds: ['P-ADCS-01'], verify: { outcome: 'in_progress', name: 'Attitude determination Monte Carlo', stage: 'development', date: '2026-10-11' } },
  { id: 'REQ-ADCS-020', level: 'L3', parentId: 'REQ-ADCS-010', assembly: 'ADCS', title: 'Star tracker accuracy', text: 'The star tracker shall provide attitude accuracy of 10 arcsec cross-boresight (1 sigma) or better.', method: 'test', partIds: ['P-ADCS-02'], verify: { outcome: 'pass', name: 'Star tracker night-sky test', stage: 'qualification', date: '2026-09-12', measured: '6.8 arcsec cross-boresight (1σ)' } },
  { id: 'REQ-ADCS-021', level: 'L3', parentId: 'REQ-ADCS-010', assembly: 'ADCS', title: 'Star tracker sun exclusion', text: 'The star tracker with baffle shall meet accuracy requirements with the sun at 35 degrees or more from boresight.', method: 'test', partIds: ['P-ADCS-02', 'P-ADCS-03'], verify: { outcome: 'none' } },
  { id: 'REQ-ADCS-022', level: 'L3', parentId: 'REQ-ADCS-010', assembly: 'ADCS', title: 'Star tracker update rate', text: 'The star tracker shall output attitude solutions at 5 Hz or faster.', method: 'test', partIds: ['P-ADCS-02'], verify: { outcome: 'pass', name: 'Star tracker functional test', stage: 'acceptance', date: '2026-08-20', measured: '10 Hz' } },
  { id: 'REQ-ADCS-023', level: 'L3', parentId: 'REQ-SYS-001', assembly: 'ADCS', title: 'Star tracker thermal range', text: 'The star tracker shall operate within specification from -20 °C to +50 °C in vacuum.', method: 'test', partIds: ['P-ADCS-02'], verify: { outcome: 'none' } },
  { id: 'REQ-ADCS-024', level: 'L3', parentId: 'REQ-SYS-004', assembly: 'ADCS', title: 'Star tracker vibration', text: 'The star tracker shall survive 14.1 Grms qualification random vibration.', method: 'test', partIds: ['P-ADCS-02'], verify: { outcome: 'in_progress', name: 'Star tracker qual random vibration', stage: 'qualification', date: '2026-10-21', notes: 'X and Y axes complete; Z axis scheduled 2026-10-28.' } },
  { id: 'REQ-ADCS-025', level: 'L3', parentId: 'REQ-ADCS-010', assembly: 'ADCS', title: 'Lost-in-space acquisition', text: 'The star tracker shall acquire attitude from lost-in-space within 10 seconds.', method: 'demonstration', partIds: ['P-ADCS-02'], verify: { outcome: 'none' } },
  { id: 'REQ-ADCS-026', level: 'L3', parentId: 'REQ-SYS-003', assembly: 'ADCS', title: 'Reaction wheel momentum', text: 'Each reaction wheel shall store at least 0.05 N·m·s of angular momentum.', method: 'test', partIds: ['P-ADCS-04'], verify: { outcome: 'pass', name: 'Reaction wheel performance test', stage: 'acceptance', date: '2026-07-30', measured: '0.06 N·m·s at 6,000 rpm' } },

  { id: 'REQ-PWR-010', level: 'L2', parentId: 'REQ-SYS-001', assembly: 'Power', title: 'Orbit-average power', text: 'The EPS shall provide at least 120 W orbit-average power at end of life.', method: 'analysis', partIds: ['P-PWR-01'], verify: { outcome: 'pass', name: 'Power budget analysis rev D', stage: 'development', date: '2026-08-05', measured: '134 W EOL orbit average' } },
  { id: 'REQ-PWR-020', level: 'L3', parentId: 'REQ-PWR-010', assembly: 'Power', title: 'Battery capacity', text: 'The battery pack shall provide at least 10.0 Ah at beginning of life at 20 °C.', method: 'test', partIds: ['P-PWR-02', 'P-PWR-03'], verify: { outcome: 'fail', name: 'Battery cell lot acceptance capacity test', stage: 'acceptance', date: '2026-10-06', measured: '9.6 Ah pack-equivalent', notes: 'NCR-005 raised against cell lot L-2611.' } },
  { id: 'REQ-PWR-021', level: 'L3', parentId: 'REQ-SYS-001', assembly: 'Power', title: 'Battery cycle life', text: 'The battery pack shall support 30,000 charge cycles at 20% depth of discharge.', method: 'analysis', partIds: ['P-PWR-02'], verify: { outcome: 'in_progress', name: 'Battery life cycle analysis', stage: 'development', date: '2026-09-25' } },
  { id: 'REQ-PWR-022', level: 'L3', parentId: 'REQ-PWR-010', assembly: 'Power', title: 'Array release time', text: 'The hold-down and release mechanism shall release the solar array within 50 ms of command.', method: 'test', partIds: ['P-PWR-07'], verify: { outcome: 'pass', name: 'HDRM release test', stage: 'qualification', date: '2026-08-11', measured: '31 ms' } },

  { id: 'REQ-AV-010', level: 'L2', parentId: 'REQ-SYS-001', assembly: 'Avionics', title: 'OBC radiation tolerance', text: 'The on-board computer shall tolerate a total ionising dose of at least 20 krad(Si).', method: 'test', partIds: ['P-AV-01'], verify: { outcome: 'pass', name: 'OBC TID test (supplier report)', stage: 'qualification', date: '2026-05-19', measured: '30 krad(Si) without functional failure' } },
  { id: 'REQ-AV-011', level: 'L3', parentId: 'REQ-AV-010', assembly: 'Avionics', title: 'Mass memory capacity', text: 'The mass memory shall provide at least 256 GB of usable storage.', method: 'inspection', partIds: ['P-AV-03'], verify: { outcome: 'pass', name: 'Mass memory inspection', stage: 'acceptance', date: '2026-06-12', measured: '480 GB usable' } },
  { id: 'REQ-AV-012', level: 'L3', parentId: 'REQ-SYS-001', assembly: 'Avionics', title: 'Flight software safe mode', text: 'Flight software shall enter safe mode within 2 s of a watchdog timeout.', method: 'test', partIds: ['P-AV-02', 'P-AV-06'], verify: { outcome: 'in_progress', name: 'FSW 3.2 fault-injection campaign', stage: 'qualification', date: '2026-10-18', measured: '41 of 56 cases run' } },

  { id: 'REQ-COM-010', level: 'L2', parentId: 'REQ-SYS-001', assembly: 'Comms', title: 'S-band downlink', text: 'The S-band link shall close at 2 Mbps with at least 3 dB margin at 10 degrees elevation.', method: 'test', partIds: ['P-COM-01', 'P-COM-02'], verify: { outcome: 'pass', name: 'S-band RF compatibility test', stage: 'qualification', date: '2026-08-26', measured: '4.1 dB margin' } },
  { id: 'REQ-COM-011', level: 'L2', parentId: 'REQ-SYS-001', assembly: 'Comms', title: 'X-band payload downlink', text: 'The X-band transmitter shall support 150 Mbps payload downlink.', method: 'test', partIds: ['P-COM-05'], verify: { outcome: 'in_progress', name: 'X-band transmitter qualification', stage: 'qualification', date: '2026-10-19' } },

  { id: 'REQ-STR-010', level: 'L2', parentId: 'REQ-SYS-004', assembly: 'Structure', title: 'First fundamental frequency', text: 'The spacecraft first lateral fundamental frequency shall be at least 100 Hz in the launch configuration.', method: 'test', partIds: ['P-STR-01'], verify: { outcome: 'pass', name: 'Structural qualification model sine survey', stage: 'qualification', date: '2026-07-21', measured: '118 Hz lateral' } },
  { id: 'REQ-STR-011', level: 'L2', parentId: 'REQ-SYS-001', assembly: 'Structure', title: 'Radiator heat rejection', text: 'The radiator shall reject at least 80 W at a 20 °C interface temperature.', method: 'analysis', partIds: ['P-STR-04'], verify: { outcome: 'pass', name: 'Thermal model correlation', stage: 'development', date: '2026-09-09', measured: '92 W' } },
]

const requirements: Requirement[] = reqSeeds.map(({ verify: _verify, ...r }) => r)

function buildTests(): TestResult[] {
  const tests: TestResult[] = []
  const next = () => `TR-${String(tests.length + 1).padStart(3, '0')}`
  for (const r of reqSeeds) {
    const v = r.verify
    if (v.outcome === 'none') continue
    // One record per verified part; analysis/inspection records ride the same table.
    const targets = r.partIds.length ? r.partIds : ['P-STR-01']
    for (const partId of targets) {
      tests.push({
        id: next(), name: v.name ?? r.title, stage: v.stage ?? 'qualification', partId,
        requirementIds: [r.id], date: v.date ?? '2026-09-01', outcome: v.outcome,
        ...(v.measured ? { measured: v.measured } : {}), ...(v.notes ? { notes: v.notes } : {}),
      })
    }
  }
  // Acceptance functional/inspection records for parts with no requirement-level test.
  const covered = new Set(tests.map((t) => t.partId))
  parts.forEach((p, i) => {
    if (covered.has(p.id) || p.qualStatus !== 'qualified') return
    tests.push({
      id: next(), name: `${p.name} acceptance functional and inspection`, stage: 'acceptance',
      partId: p.id, requirementIds: [], date: `2026-0${6 + (i % 3)}-${String(10 + (i % 18)).padStart(2, '0')}`,
      outcome: 'pass', measured: 'All acceptance criteria met',
    })
  })
  return tests
}

const tests = buildTests()
const testFor = (reqId: string, partId: string) => tests.find((t) => t.requirementIds.includes(reqId) && t.partId === partId)?.id

const nonconformances: Nonconformance[] = [
  {
    id: 'NCR-001', title: 'Isolation valve seat leakage exceeds limit after thermal cycling', partId: 'P-PROP-03',
    severity: 'critical', status: 'open', blocksQualification: true, detectedBy: testFor('REQ-PROP-020', 'P-PROP-03'),
    requirementIds: ['REQ-PROP-020', 'REQ-PROP-024'], opened: '2026-10-09', owner: 'M. Okafor (propulsion lead)',
    description: 'Qualification unit S/N 004 measured 3.2e-4 scc/s GHe seat leakage after the third thermal cycle (limit 1.0e-4). Suspected poppet seat deformation or particulate at the seat. Life cycle test halted at 2,150 cycles.',
    nextAction: 'Supplier teardown and failure analysis at Halden Valve Works (due 2026-10-31). Program to decide on a second source by 2026-11-07 to protect the propulsion qualification review.',
  },
  {
    id: 'NCR-002', title: 'Catalyst bed heater resistance out of tolerance', partId: 'P-PROP-05',
    severity: 'major', status: 'open', blocksQualification: true, detectedBy: testFor('REQ-PROP-028', 'P-PROP-05'),
    requirementIds: ['REQ-PROP-028', 'REQ-PROP-027'], opened: '2026-10-12', owner: 'J. Ruiz (thruster engineer)',
    description: 'Heater element measured 52 Ω against a 46 ± 2 Ω drawing limit, so the bed reached only 290 °C after 30 minutes at 12 W (requirement 315 °C). Thruster hot-fire is blocked until preheat is met.',
    nextAction: 'Rework: replace heater element from the conforming lot at Meridian Propulsion, then repeat preheat characterisation.',
  },
  {
    id: 'NCR-003', title: 'Propellant tank girth weld porosity found in radiography', partId: 'P-PROP-02',
    severity: 'major', status: 'dispositioned', disposition: 'use_as_is', blocksQualification: false,
    detectedBy: testFor('REQ-PROP-026', 'P-PROP-02'), requirementIds: ['REQ-PROP-026'], opened: '2026-06-30', owner: 'A. Chen (structures)',
    description: 'Two pores of 0.3 mm in the girth weld. Fracture mechanics analysis shows positive margin at 2.5 x MEOP.',
    nextAction: 'MRB approved use-as-is on 2026-07-15. Close after the flight unit radiography review.',
  },
  {
    id: 'NCR-004', title: 'Star tracker baffle anodize thickness below drawing', partId: 'P-ADCS-03',
    severity: 'minor', status: 'open', blocksQualification: false, requirementIds: ['REQ-ADCS-021'],
    opened: '2026-10-03', owner: 'L. Haddad (ADCS)',
    description: 'Black anodize measured 8 µm against a 12–18 µm drawing requirement. Risk of increased stray light near the sun exclusion angle; sun exclusion test (REQ-ADCS-021) has not been run.',
    nextAction: 'Rework anodize at Lumen Optics, then run the sun exclusion test before CDR.',
  },
  {
    id: 'NCR-005', title: 'Battery cell lot L-2611 capacity below specification', partId: 'P-PWR-03',
    severity: 'major', status: 'in_review', blocksQualification: true, detectedBy: testFor('REQ-PWR-020', 'P-PWR-03'),
    requirementIds: ['REQ-PWR-020'], opened: '2026-10-06', owner: 'S. Patel (power)',
    description: 'Lot acceptance test gives 9.6 Ah pack-equivalent capacity against a 10.0 Ah requirement. Arclight Energy reports a formation-cycle deviation at their plant.',
    nextAction: 'MRB review 2026-10-29: choose between a replacement lot (8-week lead time) or a requirement deviation backed by the power budget margin.',
  },
]

const quotes: Quote[] = [
  {
    id: 'Q-101', supplierId: 'SUP-HALDEN', partId: 'P-PROP-03', unitPriceUsd: 18_400, nreUsd: 0, leadTimeWeeks: 10,
    heritage: 'Incumbent supplier; same valve family flown on 2 LEO missions.',
    specs: { internal_leak_sccs: 1.0e-4, proof_pressure_psia: 450, pull_in_power_w: 7.5, mass_kg: 0.32, cycle_life: 5000, response_ms: 12 },
    exceptions: ['Datasheet leakage is at the limit with no margin; qualification unit failed at 3.2e-4 (NCR-001), root cause open.', 'Offers seat rework of the qualification unit at no cost.'],
    validUntil: '2026-12-15',
  },
  {
    id: 'Q-102', supplierId: 'SUP-CORVID', partId: 'P-PROP-03', unitPriceUsd: 24_900, nreUsd: 35_000, leadTimeWeeks: 16,
    heritage: 'Flown on 6 GEO missions; qualified to 20,000 cycles.',
    specs: { internal_leak_sccs: 5.0e-5, proof_pressure_psia: 500, pull_in_power_w: 9.5, mass_kg: 0.29, cycle_life: 20000, response_ms: 10 },
    exceptions: ['Pull-in power 9.5 W at 28 V exceeds the 8 W requirement; offers PWM drive to a 3 W hold, peak unchanged.'],
    validUntil: '2026-12-31',
  },
  {
    id: 'Q-103', supplierId: 'SUP-MERIDIAN', partId: 'P-PROP-03', unitPriceUsd: 21_000, nreUsd: 15_000, leadTimeWeeks: 22,
    heritage: 'New design derived from their thruster valve; no flight heritage as an isolation valve.',
    specs: { internal_leak_sccs: 1.0e-4, proof_pressure_psia: 450, pull_in_power_w: 6.0, mass_kg: 0.38, cycle_life: 10000, response_ms: 14 },
    exceptions: ['Mass 0.38 kg exceeds the 0.35 kg allocation.'],
    validUntil: '2026-11-30',
  },
]

export const programData: ProgramData = {
  program: {
    name: 'KESTREL-1',
    description: '180 kg ESPA-class Earth-observation smallsat with a green monopropellant propulsion module (fictional).',
    phase: 'Phase C: component and subsystem qualification',
    nextMilestone: 'Propulsion qualification review 2026-11-20; system CDR 2026-12-08',
  },
  parts, requirements, tests, nonconformances, suppliers, quotes,
}
