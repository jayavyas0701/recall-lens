// OWNER: orchestrator. Shown when ANTHROPIC_API_KEY is missing → mock AI in use.
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { KeyRound, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

export function ApiKeyBanner(): React.JSX.Element | null {
  const { info } = useAuth()
  const [hidden, setHidden] = useState(false)
  const nav = useNavigate()
  const show = info && !info.hasAnthropicKey && !hidden
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="relative z-20 overflow-hidden px-8">
          <div className="flex items-center gap-3 rounded-2xl border border-orange/30 bg-gradient-to-r from-orange/15 via-pink/10 to-violet/10 px-4 py-2.5 text-sm text-ink">
            <span className="flex size-7 items-center justify-center rounded-lg bg-grad-warm text-white">
              <KeyRound className="size-3.5" />
            </span>
            <span className="flex-1">
              <b>Demo AI mode.</b> No Anthropic API key yet, so screen descriptions, summaries and answers come from an offline engine, not Claude.
            </span>
            <button onClick={() => nav('/app/settings')} className="rounded-lg bg-white/80 px-3 py-1 text-xs font-bold text-violet shadow-soft hover:bg-white cursor-pointer">
              Add API key →
            </button>
            <button onClick={() => setHidden(true)} className="rounded-lg p-1 text-ink-faint hover:bg-white/60 hover:text-ink cursor-pointer">
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
