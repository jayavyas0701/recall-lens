import type { CVApi } from '../shared/types'

declare global {
  interface Window {
    cv: CVApi
  }
}

export {}
