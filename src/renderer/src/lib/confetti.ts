// OWNER: orchestrator
import confetti from 'canvas-confetti'

const COLORS = ['#7C3AED', '#EC4899', '#F59E0B', '#06B6D4', '#84CC16']

export function celebrate(): void {
  const end = Date.now() + 900
  const frame = (): void => {
    confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: COLORS })
    confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: COLORS })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  confetti({ particleCount: 140, spread: 100, startVelocity: 45, origin: { y: 0.6 }, colors: COLORS })
  frame()
}

export function sparkle(x = 0.5, y = 0.5): void {
  confetti({ particleCount: 40, spread: 60, startVelocity: 25, scalar: 0.8, origin: { x, y }, colors: COLORS })
}
