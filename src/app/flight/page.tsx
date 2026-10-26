import type { Metadata } from 'next'
import { FlightApp } from '@/components/flight/flight-app'

export const metadata: Metadata = {
  title: 'SpaceGrade Flight Mode',
  description: 'A ground autonomy agent that reasons over telemetry and the spacecraft build pedigree, with a deterministic autonomy policy.',
}

export default function FlightPage() {
  return <FlightApp />
}
