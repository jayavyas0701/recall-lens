// OWNER: subagent A. Storage donut (Audio / Screen / Other) + free-disk bar.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { HardDrive } from 'lucide-react'
import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import type { StorageStats } from '@shared/types'
import { formatBytes } from '@/lib/utils'

// Validated categorical order (dataviz validator: CVD + normal-vision pass; cyan contrast WARN → always labelled in the legend).
const SERIES = [
  { key: 'audioBytes', label: 'Audio', color: '#EC4899' },
  { key: 'screenBytes', label: 'Screen', color: '#7C3AED' },
  { key: 'otherBytes', label: 'Screenshots & transcripts', color: '#06B6D4' }
] as const

export function StorageMeter({ stats }: { stats: StorageStats }): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const vault = stats.audioBytes + stats.screenBytes + stats.otherBytes
  const data = SERIES.map((s) => ({ name: s.label, value: stats[s.key], color: s.color }))
  const empty = vault === 0
  const usedDisk = Math.max(0, stats.totalBytes - stats.freeBytes)
  const usedPct = stats.totalBytes ? (usedDisk / stats.totalBytes) * 100 : 0
  const vaultPct = stats.totalBytes ? Math.max(vault ? 0.6 : 0, (vault / stats.totalBytes) * 100) : 0
  const center = hover != null && !empty ? data[hover] : null

  return (
    <div className="flex h-full items-center gap-6">
      <div className="relative size-[176px] shrink-0">
        <PieChart width={176} height={176}>
          <Pie
            data={empty ? [{ name: 'Empty', value: 1, color: '#ECE9FB' }] : data}
            dataKey="value"
            innerRadius={60}
            outerRadius={84}
            startAngle={90}
            endAngle={-270}
            paddingAngle={empty ? 0 : 2}
            cornerRadius={4}
            stroke="#ffffff"
            strokeWidth={2}
            isAnimationActive
            animationDuration={900}
            onMouseEnter={(_, i) => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {(empty ? [{ color: '#ECE9FB' }] : data).map((d, i) => (
              <Cell key={i} fill={d.color} opacity={hover == null || hover === i ? 1 : 0.45} style={{ transition: 'opacity .2s', outline: 'none' }} />
            ))}
          </Pie>
          {!empty && (
            <Tooltip
              formatter={(v) => formatBytes(Number(v))}
              contentStyle={{ borderRadius: 12, border: '1px solid #ECE9FB', fontSize: 12, boxShadow: '0 8px 30px -8px rgb(124 58 237 / 0.25)' }}
            />
          )}
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{center ? center.name.split(' ')[0] : 'In vault'}</span>
          <span className="font-display text-xl font-bold text-ink tabular-nums">{formatBytes(center ? center.value : vault)}</span>
          {!center && <span className="text-[11px] text-ink-soft">{formatBytes(stats.freeBytes)} free</span>}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <ul className="space-y-2">
          {SERIES.map((s, i) => (
            <li
              key={s.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="flex items-center gap-2.5 rounded-lg px-1.5 py-0.5 text-sm transition-colors hover:bg-violet/5"
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="flex-1 truncate text-ink-soft">{s.label}</span>
              <span className="font-semibold text-ink tabular-nums">{formatBytes(stats[s.key])}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-ink-soft">
              <HardDrive className="size-3.5" /> Disk
            </span>
            <span className="text-ink-soft tabular-nums">
              <span className="font-bold text-ink">{formatBytes(stats.freeBytes)}</span> free of {formatBytes(stats.totalBytes)}
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-lime/15" title={`Used ${usedPct.toFixed(0)}% · Context Vault ${formatBytes(vault)}`}>
            <motion.div className="absolute inset-y-0 left-0 rounded-full bg-ink/15" initial={{ width: 0 }} animate={{ width: `${usedPct}%` }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
            <motion.div className="absolute inset-y-0 left-0 rounded-full bg-grad" initial={{ width: 0 }} animate={{ width: `${vaultPct}%` }} transition={{ duration: 1, delay: 0.2 }} />
          </div>
          <div className="mt-1.5 flex gap-3 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-grad" /> Context Vault
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-ink/15" /> Other apps
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-lime/40" /> Free
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
