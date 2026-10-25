import type { ToolDef } from './types'
import { cite, db, isOpen, matchAssembly, partById, resolveParts, str, supplierById } from './lookup'

export const listNonconformances: ToolDef = {
  name: 'list_nonconformances',
  description: 'List nonconformance reports (NCRs). status "open" (default) means open or in MRB review; "closed" includes dispositioned. Filter by assembly, part (id or name) or whether the NCR blocks qualification. Returns severity, disposition, owner, description and next action.',
  parameters: {
    type: 'object',
    properties: {
      assembly: { type: 'string' },
      part: { type: 'string' },
      status: { type: 'string', enum: ['open', 'closed', 'any'] },
      blocksQualification: { type: 'boolean' },
    },
  },
  run(args) {
    const status = str(args.status) ?? 'open'
    let ncrs = db.nonconformances.filter((n) => (status === 'any' ? true : status === 'closed' ? !isOpen(n) : isOpen(n)))
    const assembly = matchAssembly(args.assembly)
    if (assembly) ncrs = ncrs.filter((n) => partById(n.partId)?.assembly === assembly)
    const partRef = str(args.part)
    if (partRef) {
      const ids = new Set(resolveParts(partRef).map((p) => p.id))
      ncrs = ncrs.filter((n) => ids.has(n.partId))
    }
    if (typeof args.blocksQualification === 'boolean') ncrs = ncrs.filter((n) => n.blocksQualification === args.blocksQualification)
    const data = ncrs.map((n) => {
      const part = partById(n.partId)
      return { ...n, partName: part?.name, assembly: part?.assembly, supplier: part ? supplierById(part.supplierId)?.name : undefined }
    })
    const parts = ncrs.flatMap((n) => partById(n.partId) ?? [])
    return {
      data,
      citations: [...ncrs.map(cite.ncr), ...parts.map(cite.part)],
      summary: `${ncrs.length} NCR${ncrs.length === 1 ? '' : 's'} (${ncrs.filter((n) => n.blocksQualification).length} blocking qualification)`,
    }
  },
}
