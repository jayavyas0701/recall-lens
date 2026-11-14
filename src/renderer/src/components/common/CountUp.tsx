// OWNER: orchestrator. Animated count-up number.
import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'

export function CountUp({ value, decimals = 0, duration = 1.2, suffix = '' }: { value: number; decimals?: number; duration?: number; suffix?: string }): React.JSX.Element {
  const [display, setDisplay] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v)
    })
    prev.current = value
    return () => controls.stop()
  }, [value, duration])
  return (
    <span className="tabular-nums">
      {display.toFixed(decimals)}
      {suffix}
    </span>
  )
}
