import type { ToolDef } from './types'
import { cite, db, matchAssembly, openNcrsForPart, resolveParts, str, supplierById } from './lookup'

export const searchParts: ToolDef = {
  name: 'search_parts',
  description: 'Search the parts list (BOM) by name, part number or id, and/or filter by assembly (Propulsion, ADCS, Power, Avionics, Comms, Structure) and qualification status. Returns part ids, supplier, qualification status and open NCR ids.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Part name fragment, part number or id, e.g. "star tracker" or "P-PROP-03"' },
      assembly: { type: 'string', description: 'Assembly name, e.g. "Propulsion"' },
      qualStatus: { type: 'string', enum: ['qualified', 'in_qualification', 'not_started'] },
    },
  },
  run(args) {
    const assembly = matchAssembly(args.assembly)
    const query = str(args.query)
    // A bare assembly name ("propulsion", "the ADCS subsystem") means the whole assembly.
    const bare = query?.toLowerCase().replace(/\b(the|assembly|module|subsystem|parts?)\b/g, '').trim()
    const queryAssembly = bare ? matchAssembly(bare) : undefined
    let parts = queryAssembly && bare === queryAssembly.toLowerCase()
      ? db.parts.filter((p) => p.assembly === queryAssembly)
      : query ? resolveParts(query) : db.parts
    if (assembly) parts = parts.filter((p) => p.assembly === assembly)
    const qual = str(args.qualStatus)
    if (qual) parts = parts.filter((p) => p.qualStatus === qual)
    const data = parts.map((p) => ({
      id: p.id, partNumber: p.partNumber, name: p.name, assembly: p.assembly, parentId: p.parentId ?? null,
      supplier: supplierById(p.supplierId)?.name, criticality: p.criticality, qualStatus: p.qualStatus,
      openNcrs: openNcrsForPart(p.id).map((n) => n.id),
    }))
    return { data, citations: parts.map(cite.part), summary: `${parts.length} part${parts.length === 1 ? '' : 's'} matched` }
  },
}
