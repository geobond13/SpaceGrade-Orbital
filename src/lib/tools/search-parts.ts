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
    let parts = query ? resolveParts(query) : db.parts
    // "propulsion" as a query with no part-name hit means the whole assembly.
    if (query && parts.length === 0 && matchAssembly(query)) parts = db.parts.filter((p) => p.assembly === matchAssembly(query))
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
