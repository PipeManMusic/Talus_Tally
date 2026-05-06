# Talus Tally 0.1.11-alpha.2 Release Notes

Release date: 2026-05-06
Release type: Alpha hotfix (pre-release)

## Summary

`0.1.11-alpha.2` raises the backend startup timeout so the Windows desktop build can wait long enough for the PyInstaller-bundled Python server to come up on first launch.

## Fixes

### Windows: "Cannot connect to backend" on first launch

- The frontend gave up after **30s** of waiting for `GET /api/v1/health` to return.
- PyInstaller-bundled Python executables on Windows can take **30–90s** to start the first time the app is launched, because Windows Defender scans every file as the bundle unpacks into `_MEIPASS`. Subsequent launches are much faster (typically < 5s) once Defender has cached scan results.
- The 30s ceiling caused a race: the backend was still unpacking when the frontend timed out, even though the launcher's diagnostic log showed `spawn()` succeeded.
- Raised the ceiling to **120s** in `frontend/src/App.tsx`. On Linux/macOS the backend is ready in ~1–2s, so the longer ceiling is invisible there.
- Loading screen now shows elapsed seconds (after 5s) and a hint after 15s explaining first-launch slowness on Windows, so users see progress instead of thinking the app has hung.

The earlier `0.1.11-alpha.1` IPv4-loopback fix in `client.ts` is also included.

## Version Metadata

- Frontend package: `0.1.11-alpha.2`
- Tauri config: `0.1.11-alpha.2`
- Tauri Rust crate: `0.1.11-alpha.2`
- Debian package: `0.1.11~alpha.2-1`

## Upgrade / Build Notes

- Desktop dev: `cd frontend && npm install && npm run desktop:dev`
- Installer build scripts:
  - Linux: `./build-deb.sh`
  - macOS: `./build-macos.sh`
  - Windows: `./build-windows.ps1`
