// OWNER: subagent D. 1–5 stars with hover scale/rotate and a gradient fill.
import { useId, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const STAR = 'M12 2.5l2.92 5.92 6.53.95-4.72 4.6 1.11 6.5L12 17.4l-5.84 3.07 1.11-6.5-4.72-4.6 6.53-.95L12 2.5z'

export function StarRating({
  value,
  onChange,
  size = 30,
  readOnly = false
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
  readOnly?: boolean
}): React.JSX.Element {
  const [hover, setHover] = useState(0)
  const gid = useId().replace(/:/g, '')
  const shown = hover || value

  return (
    <div className={cn('flex items-center', readOnly ? 'gap-0.5' : 'gap-1')} onMouseLeave={() => setHover(0)} role={readOnly ? 'img' : 'radiogroup'} aria-label={`${value} of 5 stars`}>
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient id={`star-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="55%" stopColor="#EC4899" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
      </svg>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24" className="overflow-visible">
            <path
              d={STAR}
              fill={filled ? `url(#star-${gid})` : 'transparent'}
              stroke={filled ? 'transparent' : '#cfcbe6'}
              strokeWidth={1.6}
              strokeLinejoin="round"
              style={{ transition: 'fill .15s, stroke .15s', filter: filled && !readOnly ? 'drop-shadow(0 3px 6px rgb(236 72 153 / .35))' : undefined }}
            />
          </svg>
        )
        if (readOnly) return <span key={n}>{star}</span>
        return (
          <motion.button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            data-star={n}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange?.(n)}
            whileHover={{ scale: 1.3, rotate: n % 2 ? 14 : -14 }}
            whileTap={{ scale: 0.85 }}
            animate={value === n ? { scale: [1, 1.35, 1] } : { scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 14 }}
            className="cursor-pointer rounded-md p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/40"
          >
            {star}
          </motion.button>
        )
      })}
    </div>
  )
}
