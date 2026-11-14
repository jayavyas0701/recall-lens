// Makes sure the Electron binary is downloaded (npm sometimes skips Electron's postinstall,
// e.g. with ignore-scripts or an interrupted install). Runs before `npm run dev` / `npm run build`.
const { existsSync, readFileSync } = require('fs')
const { join } = require('path')
const { execFileSync } = require('child_process')

const dir = join(__dirname, '..', 'node_modules', 'electron')
const pathFile = join(dir, 'path.txt')
const ok = existsSync(pathFile) && existsSync(join(dir, 'dist', readFileSync(pathFile, 'utf8').trim()))
if (!ok) {
  console.log('[ContextVault] Electron binary missing — downloading it now (one time)…')
  execFileSync(process.execPath, [join(dir, 'install.js')], { stdio: 'inherit' })
}
