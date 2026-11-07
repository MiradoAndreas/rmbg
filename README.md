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
Packaging commands explicitly disable publishing, including in CI. The separate
release workflow uploads completed packages to GitHub after both builds succeed.
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

## In-app updates

For a Windows installer from GitHub Actions, push the source and workflows,
then open **Actions → Build Windows desktop → Run workflow**. Download the
`ClearCut-Windows-x64` artifact from the completed run, extract it, close the
running app, and run the `.exe` installer over the existing installation.
This manual workflow builds downloadable files without publishing a release.

Version 1.1.0 adds a compact **Check for updates** button. It checks public GitHub
Releases at `MiradoAndreas/rmbg`. Users choose **Download update**, then
**Restart and install**. Windows uses the NSIS installer; Linux users must run
the AppImage from a writable location. Update checks are disabled in development.
The original 1.0.0 app must be upgraded manually once to gain this button.

For each future update, including HTML/CSS changes:

1. Increment `package.json` and `package-lock.json` with `npm version patch --no-git-tag-version`.
2. Commit and push the source changes, including the workflows.
3. Create and push a matching version tag, for example `git tag v1.1.1` and
   `git push origin v1.1.1` (replace with the actual package version).
4. **Publish desktop update** builds on Windows and Linux, then publishes a
   GitHub Release only after both builds succeed. It attaches the installers,
   block maps, `latest.yml`, and `latest-linux.yml` that the updater needs.

The repository and releases must be publicly readable for this configuration.
Change the `build.publish` owner/repository if distributing from another repo.
Do not put a GitHub token in the installed app. CI uses its scoped GitHub token.
Use Windows signing credentials in CI before distributing signed releases, and
keep the application ID and signing identity consistent across versions.

Verify an update using two published versions: install the older updater-enabled
version, publish a higher version with a visible change, then check, download,
restart, and confirm the new version and change. A local build alone cannot
verify the complete hosted update flow.
