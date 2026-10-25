'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RECORD_ID } from '@/lib/agent/citations'
import { CitationChip } from './citation-chip'

/** Turn record ids (bare or [bracketed]) into links the renderer shows as chips. */
function linkifyIds(md: string): string {
  return md.replace(new RegExp(`\\[?(${RECORD_ID.source})\\]?(?!\\()`, 'g'), (_m, id: string) => `[${id}](#rec:${id})`)
}

export function Markdown({ text, onOpenRecord, unknownIds = [] }: { text: string; onOpenRecord: (id: string) => void; unknownIds?: string[] }) {
  return (
    <div className="prose-sg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('#rec:')) {
              const id = href.slice(5)
              return <CitationChip id={id} unknown={unknownIds.includes(id)} onClick={() => onOpenRecord(id)} />
            }
            return <a href={href} className="text-accent underline" target="_blank" rel="noreferrer">{children}</a>
          },
        }}
      >
        {linkifyIds(text)}
      </ReactMarkdown>
    </div>
  )
}
