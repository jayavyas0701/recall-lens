// OWNER: orchestrator
export const log = {
  info: (...a: unknown[]): void => console.log('[ContextVault]', ...a),
  warn: (...a: unknown[]): void => console.warn('[ContextVault]', ...a),
  error: (...a: unknown[]): void => console.error('[ContextVault]', ...a)
}
