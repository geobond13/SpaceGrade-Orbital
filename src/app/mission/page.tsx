import type { Metadata } from 'next'
import { AgentApp } from '@/components/agent-app'

export const metadata: Metadata = {
  title: 'SpaceGrade Mission Control',
  description: 'The build phase: a Nemotron agent on Nebius Token Factory that answers aerospace hardware questions with cited program records.',
}

export default function MissionPage() {
  return <AgentApp />
}
