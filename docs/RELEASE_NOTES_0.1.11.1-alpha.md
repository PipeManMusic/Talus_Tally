# Talus Tally 0.1.11.1-alpha Release Notes

Release date: 2026-05-06
Release type: Alpha hotfix (pre-release)

## Summary

`0.1.11.1-alpha` is a hotfix that restores backend connectivity in the Windows desktop build. The Linux and macOS builds were unaffected.

## Fixes

### Windows: UI cannot connect to backend (IPv4/IPv6 mismatch)

- The backend binds the Flask + Socket.IO server only to `127.0.0.1` (IPv4) on port 5000.
- The frontend defaulted its API and Socket.IO base URLs to `http://localhost:5000`.
- On Windows, `localhost` resolves to the IPv6 loopback address (`::1`) first. The webview attempted to connect to `[::1]:5000`, which fails because nothing is listening on IPv6. Linux and macOS resolvers prefer IPv4 for `localhost`, so those platforms were unaffected.
- The frontend default URLs in `frontend/src/api/client.ts` (`API_URL`, and via it `SOCKET_URL`) now use `http://127.0.0.1:5000`, forcing IPv4 to match the backend bind address.

If you set `VITE_API_URL` or `VITE_SOCKET_URL` as a build-time override, ensure those also use `127.0.0.1` rather than `localhost` on Windows.

## Version Metadata

- Frontend package: `0.1.11.1-alpha`
- Tauri config: `0.1.11.1-alpha`
- Tauri Rust crate: `0.1.11.1-alpha`
- Debian package: `0.1.11.1~alpha-1`

## Upgrade / Build Notes

- Desktop dev: `cd frontend && npm install && npm run desktop:dev`
- Installer build scripts:
  - Linux: `./build-deb.sh`
  - macOS: `./build-macos.sh`
  - Windows: `./build-windows.ps1`
