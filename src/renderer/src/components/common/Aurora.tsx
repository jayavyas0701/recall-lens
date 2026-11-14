// OWNER: orchestrator. Animated gradient-mesh "aurora" blobs.
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const BLOBS = [
  { c: '#7C3AED', x: ['-10%', '25%', '-5%'], y: ['-10%', '20%', '-10%'], s: 520 },
  { c: '#EC4899', x: ['55%', '20%', '55%'], y: ['5%', '40%', '5%'], s: 460 },
  { c: '#F59E0B', x: ['30%', '60%', '30%'], y: ['60%', '30%', '60%'], s: 420 },
  { c: '#06B6D4', x: ['-5%', '30%', '-5%'], y: ['55%', '70%', '55%'], s: 400 }
]

export function Aurora({ className, intensity = 1 }: { className?: string; intensity?: number }): React.JSX.Element {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {BLOBS.map((b, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: b.s,
            height: b.s,
            background: `radial-gradient(circle at center, ${b.c} 0%, transparent 65%)`,
            filter: 'blur(40px)',
            opacity: 0.75 * intensity
          }}
          animate={{ left: b.x, top: b.y }}
          transition={{ duration: 16 + i * 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

/** Subtle aurora for app backgrounds; opacity follows the theme (vibrant vs light). */
export function AppAurora(): React.JSX.Element {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0" style={{ opacity: 'var(--cv-aurora-opacity)' as unknown as number }}>
      <Aurora intensity={0.45} />
    </div>
  )
}
