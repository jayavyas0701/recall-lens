// OWNER: subagent A (Recording). Top-bar record button + the recorder panel it opens.
import { useCallback } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { MAX_SESSION_SECONDS } from '@shared/types'
import { useAppEvent } from '@/lib/events'
import { cn, formatClock } from '@/lib/utils'
import { openPanel, useRecorder } from './recorder'
import { RecorderPanel } from './RecorderPanel'

export function RecordButton(): React.JSX.Element {
  const s = useRecorder()
  const onOpen = useCallback(() => openPanel(), [])
  useAppEvent('recording:open', onOpen)

  const recording = s.phase === 'recording'
  const busy = s.phase === 'starting' || s.phase === 'stopping'
  const frac = Math.min(1, s.elapsed / MAX_SESSION_SECONDS)

  return (
    <>
      <motion.button
        onClick={openPanel}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.96 }}
        data-testid="cv-record-button"
        className={cn(
          'relative flex h-10 cursor-pointer items-center gap-2 overflow-hidden rounded-full border px-4 text-sm font-bold transition-colors',
          recording ? 'border-danger/30 bg-danger/10 text-danger' : 'border-line bg-white/80 text-ink hover:border-pink/40 hover:text-pink'
        )}
        aria-label={recording ? 'Recording — open recorder' : 'Open recorder'}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin text-pink" />
        ) : (
          <span className="relative flex size-2.5">
            <motion.span
              className="absolute inline-flex size-full rounded-full bg-danger"
              animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
              transition={{ duration: recording ? 1 : 1.8, repeat: Infinity, ease: 'easeOut' }}
            />
            <span className="relative inline-flex size-2.5 rounded-full bg-danger" />
          </span>
        )}
        {recording ? (
          <span className="tabular-nums">
            {formatClock(s.elapsed)} <span className="font-semibold text-danger/60">/ 3:00</span>
          </span>
        ) : s.phase === 'stopping' ? (
          'Saving…'
        ) : s.phase === 'starting' ? (
          'Starting…'
        ) : (
          'Record'
        )}
        {recording && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-danger/10">
            <span className="block h-full bg-danger transition-[width] duration-300 ease-linear" style={{ width: `${frac * 100}%` }} />
          </span>
        )}
      </motion.button>
      <RecorderPanel />
    </>
  )
}
