import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const python = process.env.CLEARCUT_PYTHON || resolve(
  '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
)
const result = spawnSync(python, [
  '-m', 'PyInstaller', '--clean', '--noconfirm',
  '--distpath', 'dist-backend', '--workpath', 'build/backend', 'backend.spec'
], { stdio: 'inherit', windowsHide: true })
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
