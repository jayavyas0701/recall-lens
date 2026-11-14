// OWNER: subagent B. Tiny, safe markdown renderer (bold, italics, inline code, bullets, numbered lists, line breaks).
// Builds React nodes directly — never uses dangerouslySetInnerHTML.
import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const INLINE = /(\[[^\]\n]{1,120}\]\(https?:\/\/[^)\s]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\b\d{1,2}:\d{2}\b)/g

function inline(text: string, keyBase: string, timeChips: boolean): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0]
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${keyBase}-${i++}`
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(tok)
    if (link) {
      out.push(
        <a key={k} href={link[2]} target="_blank" rel="noreferrer" className="font-semibold text-violet underline decoration-violet/30 underline-offset-2 hover:decoration-violet">
          {link[1]}
        </a>
      )
    } else if (tok.startsWith('**')) {
      const innerText = tok.slice(2, -2)
      out.push(
        /^\d{1,2}:\d{2}$/.test(innerText) && timeChips ? (
          <TimeChip key={k} t={innerText} />
        ) : (
          <strong key={k} className="font-semibold text-ink">
            {inline(innerText, k, timeChips)}
          </strong>
        )
      )
    } else if (tok.startsWith('`')) {
      out.push(
        <code key={k} className="rounded bg-violet/10 px-1 py-0.5 text-[0.85em] text-violet">
          {tok.slice(1, -1)}
        </code>
      )
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>)
    } else if (timeChips) {
      out.push(<TimeChip key={k} t={tok} />)
    } else out.push(tok)
    last = at + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function TimeChip({ t }: { t: string }): React.JSX.Element {
  return <span className="mx-0.5 inline-flex items-center rounded-md bg-violet/10 px-1.5 py-px font-display text-[0.8em] font-semibold tabular-nums text-violet">{t}</span>
}

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] }

function blocks(src: string): Block[] {
  const out: Block[] = []
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line)
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const prev = out[out.length - 1]
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol'
      const text = (ul ?? ol)![1]!
      if (prev && prev.kind === kind) prev.items.push(text)
      else out.push({ kind, items: [text] })
    } else if (!line.trim()) {
      out.push({ kind: 'p', lines: [] }) // paragraph break marker
    } else {
      const heading = /^#{1,6}\s+(.*)$/.exec(line)
      const text = heading ? `**${heading[1]}**` : line
      if (prev && prev.kind === 'p' && prev.lines.length) prev.lines.push(text)
      else out.push({ kind: 'p', lines: [text] })
    }
  }
  return out.filter((b) => (b.kind === 'p' ? b.lines.length > 0 : true))
}

export function Markdown({
  text,
  className,
  timeChips = true,
  trailing
}: {
  text: string
  className?: string
  timeChips?: boolean
  /** Rendered inline at the very end (e.g. a streaming caret). */
  trailing?: ReactNode
}): React.JSX.Element {
  const bs = blocks(text)
  if (!bs.length) return <div className={cn('leading-relaxed', className)}>{trailing}</div>
  return (
    <div className={cn('space-y-2 leading-relaxed', className)}>
      {bs.map((b, bi) => {
        const isLast = bi === bs.length - 1
        if (b.kind === 'p')
          return (
            <p key={bi}>
              {b.lines.map((l, li) => (
                <Fragment key={li}>
                  {li > 0 && <br />}
                  {inline(l, `${bi}-${li}`, timeChips)}
                </Fragment>
              ))}
              {isLast && trailing}
            </p>
          )
        const List = b.kind === 'ul' ? 'ul' : 'ol'
        return (
          <List key={bi} className={cn('space-y-1.5', b.kind === 'ol' ? 'list-decimal pl-5' : '')}>
            {b.items.map((it, ii) => (
              <li key={ii} className={cn(b.kind === 'ul' && 'relative pl-4')}>
                {b.kind === 'ul' && <span className="absolute left-0 top-[0.6em] size-1.5 rounded-full bg-grad" />}
                {inline(it, `${bi}-${ii}`, timeChips)}
                {isLast && ii === b.items.length - 1 && trailing}
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
