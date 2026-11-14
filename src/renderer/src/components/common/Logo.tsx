// OWNER: orchestrator. Glowing vault logo built from SVG.
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function VaultMark({ size = 40, glow = false, className }: { size?: number; glow?: boolean; className?: string }): React.JSX.Element {
  return (
    <div className={cn('relative inline-flex', className)} style={{ width: size, height: size }}>
      {glow && (
        <motion.div
          className="absolute inset-0 rounded-[30%] bg-grad blur-2xl"
          animate={{ opacity: [0.45, 0.85, 0.45], scale: [0.9, 1.15, 0.9] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <svg viewBox="0 0 64 64" width={size} height={size} className="relative drop-shadow-[0_6px_18px_rgba(124,58,237,0.45)]">
        <defs>
          <linearGradient id="cv-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="0.55" stopColor="#EC4899" />
            <stop offset="1" stopColor="#F59E0B" />
          </linearGradient>
          <linearGradient id="cv-g2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#cv-g)" />
        <circle cx="32" cy="32" r="17" fill="none" stroke="url(#cv-g2)" strokeWidth="3.5" />
        <motion.g
          style={{ originX: '32px', originY: '32px' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        >
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <rect key={a} x="30.5" y="11" width="3" height="6" rx="1.5" fill="#fff" opacity="0.9" transform={`rotate(${a} 32 32)`} />
          ))}
        </motion.g>
        <circle cx="32" cy="32" r="7.5" fill="#fff" />
        <path d="M28.5 32a3.5 3.5 0 1 1 7 0" stroke="url(#cv-g)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <circle cx="32" cy="34.5" r="1.8" fill="url(#cv-g)" />
      </svg>
    </div>
  )
}

export function Wordmark({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={cn('font-display font-bold tracking-tight text-ink', className)}>
      Context <span className="text-grad">Vault</span>
    </span>
  )
}
