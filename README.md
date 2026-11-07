# ClearCut Desktop

ClearCut uses Electron, electron-vite, and the existing HTML/CSS/JavaScript UI.
Electron starts a local FastAPI service on a free loopback port; rembg runs
U2Net on the CPU. Python and Node are needed for development, but Python is
bundled in the desktop installer through PyInstaller.

## Development

Use Node.js 22.12 or newer and Python 3.11 or newer with compatible rembg wheels.
From the repository root on Windows:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
npm run dev
```

On macOS/Linux, use `.venv/bin/python` for Python commands. Electron selects
the platform's virtual environment automatically. Set `CLEARCUT_PYTHON` to use
another Python executable.

The first launch downloads U2Net and can take several minutes. Models are
cached in the application's user data directory under `models/`. Later launches
can process uploaded images offline. URL input requires internet access.

During development FastAPI serves the original `static/` files; reload the
window after frontend changes. electron-vite rebuilds Electron main/preload
code. Production frontend assets are compiled by Vite and copied outside ASAR
so the Python service can read them.

## Packaging

```powershell
npm run build          # Compile Electron and frontend assets
npm run backend:build  # Build the Python service in dist-backend/
npm run package:win    # Build backend, frontend, and Windows installer
```

Use `npm run package:mac` on macOS and `npm run package:linux` on Linux.
Build each release on its target OS and architecture: the PyInstaller output
is platform specific. Installers are written to `release/`. `npm run preview`
runs the compiled Electron code using the development Python environment.

Set up electron-builder signing credentials for signed public releases.
The default application ID is `com.clearcut.desktop`; choose your own ID before
publishing. Default Electron icons are used until application icons are added.

## Troubleshooting

Startup errors appear in a native dialog. Backend output is saved to
`backend.log` in Electron's application logs directory. Check connectivity if
the initial model download fails. Closing the app stops its backend; on macOS
closing the last window keeps the application available until Quit is selected.

The original web app remains runnable with `uvicorn main:app --reload`.

## Linux build on GitHub

If a local Linux environment is unavailable, push this project to GitHub and
open **Actions → Build Linux desktop → Run workflow** on the branch containing
these changes. The workflow builds the Python service and AppImage on Ubuntu
22.04 for x64, then uploads a `ClearCut-Linux-x64` artifact. Download and extract
that artifact, then on Linux run:

```bash
chmod +x ClearCut-*.AppImage
./ClearCut-*.AppImage
```

The workflow does not publish a release. It checks the native backend format and
packaged files; test the graphical application on the intended Linux desktop.
