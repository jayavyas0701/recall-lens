// OWNER: subagent A. Live mic waveform drawn on a <canvas> from an AnalyserNode.
import { useEffect, useRef } from 'react'
import { getAnalyser } from './recorder'

const BARS = 56

export function Waveform({ active, className }: { active: boolean; className?: string }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let buf: Uint8Array<ArrayBuffer> | null = null
    const levels = new Float32Array(BARS)

    const draw = (now: number): void => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const analyser = active ? getAnalyser() : null
      if (analyser) {
        if (!buf || buf.length !== analyser.fftSize) buf = new Uint8Array(new ArrayBuffer(analyser.fftSize))
        analyser.getByteTimeDomainData(buf)
        const per = Math.floor(buf.length / BARS)
        for (let i = 0; i < BARS; i++) {
          let sum = 0
          for (let j = 0; j < per; j++) {
            const v = (buf[i * per + j] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / per)
          const target = Math.min(1, rms * 4.5)
          levels[i] = levels[i] * 0.6 + target * 0.4
        }
      } else {
        // Idle "breathing" line so the panel never looks dead.
        for (let i = 0; i < BARS; i++) {
          const target = 0.06 + 0.05 * Math.sin(now / 500 + i * 0.45) * (active ? 0.4 : 1)
          levels[i] = levels[i] * 0.85 + Math.max(0.02, target) * 0.15
        }
      }

      const grad = ctx.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, '#7C3AED')
      grad.addColorStop(0.55, '#EC4899')
      grad.addColorStop(1, '#F59E0B')
      ctx.fillStyle = grad
      const gap = 3
      const bw = (w - gap * (BARS - 1)) / BARS
      for (let i = 0; i < BARS; i++) {
        const bh = Math.max(3, levels[i] * (h - 6))
        const x = i * (bw + gap)
        const y = (h - bh) / 2
        const r = Math.min(bw / 2, bh / 2)
        ctx.beginPath()
        ctx.roundRect(x, y, bw, bh, r)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active])

  return <canvas ref={ref} className={className} aria-label="Live microphone waveform" />
}
