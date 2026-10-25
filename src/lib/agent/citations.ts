import type { Citation } from '@/lib/tools'

/** Record id shapes in the program data: P-PROP-03, REQ-ADCS-021, TR-008, NCR-001, SUP-HALDEN, Q-101. */
export const RECORD_ID = /\b(?:P-[A-Z]+-\d{2}|REQ-[A-Z]+-\d{3}|TR-\d{3}|NCR-\d{3}|SUP-[A-Z]+|Q-\d{3})\b/g

/**
 * Split the ids an answer mentions into those a tool actually returned
 * (cited, in order of first mention) and those it did not (unknown).
 */
export function validateCitations(text: string, seen: Map<string, Citation>): { cited: Citation[]; unknownIds: string[] } {
  const mentioned = [...new Set(text.match(RECORD_ID) ?? [])]
  return {
    cited: mentioned.flatMap((id) => seen.get(id) ?? []),
    unknownIds: mentioned.filter((id) => !seen.has(id)),
  }
}

/** Text between <tag> and </tag>; tolerates a missing close tag (streaming). */
export function extractTag(raw: string, tag: string): string | undefined {
  const start = raw.indexOf(`<${tag}>`)
  if (start === -1) return undefined
  const from = start + tag.length + 2
  const end = raw.indexOf(`</${tag}>`, from)
  return raw.slice(from, end === -1 ? undefined : end).trim()
}
