# Talus Tally Development Environment Setup

This guide walks through getting a local dev environment running for the Talus Tally desktop/web app.

## 1. Base OS Requirements

Talus Tally currently targets Ubuntu 25.10 (or a compatible Debian-based distro). You need sudo access to install system packages.

## 2. Enable Universe Repository (Ubuntu Only)

Some dependencies such as libsoup live in the *universe* repo.

```bash
sudo add-apt-repository universe
sudo apt update
```

## 3. Install System Packages

Install build tooling, Python, Node.js 20, Rust/Tauri prerequisites, and desktop libs.

```bash
sudo apt install \
  build-essential \
  python3 python3-venv python3-pip \
  nodejs npm \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  libsoup-3.0-dev libssl-dev pkg-config librsvg2-dev \
  curl git patchelf
```

> Tip: Ubuntu 25.10 already ships Node.js 20.x. If your distro does not, install Node 20 from NodeSource before continuing.

## 4. Install Rust Toolchain (for Tauri Desktop Builds)

Install Rust via rustup and add it to your shell profile.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
rustup update
```

Verify the toolchain:

```bash
cargo --version
rustc --version
```

## 5. Clone the Repository

```bash
git clone <your-fork-or-origin-url>
cd Talus\ Tally
```

If the path includes spaces (as above), keep the quoting when running shell commands.

## 6. Python Virtual Environment

Create and activate a virtualenv in the project root.

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install backend dependencies:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## 7. Frontend Dependencies

Install Node packages for the Vite/React frontend.

```bash
cd frontend
npm install
cd ..
```

## 8. Running the App (Web Dev Flow)

Open two terminals.

1. **Backend**
   ```bash
   source .venv/bin/activate
   python -m backend
   ```
   Backend listens on http://127.0.0.1:5000.

2. **Frontend (Vite)**
   ```bash
   cd frontend
   npm run dev
   ```
   Vite serves the UI at http://127.0.0.1:5173 and proxies API calls to the backend.

## 9. Running the Desktop App (Tauri Dev Flow)

Tauri launches the backend and desktop WebView together.

```bash
cd frontend
npm run desktop:dev
```

If you see errors about missing GTK or libsoup libraries, re-run the system package installation step.

## 10. Tests

Backend tests (pytest):

```bash
source .venv/bin/activate
pytest
```

Frontend unit tests (Vitest):

```bash
cd frontend
npm run test
```

Run targeted CSV utility tests:

```bash
npm run test -- csvPreview
```

## 11. Building the Desktop Package (.deb)

The build script bundles the backend (PyInstaller), frontend, and the Tauri desktop binary. It uses Docker to guarantee glibc compatibility.

Prerequisites:
- Docker installed and running (user has access to `docker` group or uses sudo).

Command:

```bash
./build-deb.sh
```

Output:
- `talus-tally_0.1.0_amd64.deb` in the project root.

Install locally for testing:

```bash
sudo dpkg -i talus-tally_0.1.0_amd64.deb
```

Launch the installed desktop app:

```bash
talus-tally
```

## 12. Useful Maintenance Commands

- Clean Python artifacts: `find . -name "__pycache__" -delete`
- Reset Node modules (if Docker build ran as root):
  ```bash
  sudo rm -rf frontend/node_modules
  npm install
  ```
- Update requirements after adding Python packages: `pip freeze > requirements.txt` (review before committing).

## 13. Troubleshooting

| Issue | Fix |
| ----- | --- |
| `libsoup-3.0-dev` not found | Ensure *universe* repo is enabled (Step 2) and rerun apt install. |
| `node: command not found` | Install Node.js 20.x (Step 3). |
| Vite cannot connect to backend | Start backend first or check API_URL in `frontend/.env` if you created one. |
| Tauri build fails with GTK/WebKit errors | Double-check all GTK/WebKit packages in Step 3, then rerun `npm run desktop:dev`. |
| `Permission denied` on `frontend/node_modules` after Docker build | Delete the directory with sudo and reinstall (Maintenance commands above). |

## 14. Summary

1. Enable universe repo and install system packages.
2. Install rustup toolchain.
3. Create `.venv` and install Python requirements.
4. Run `npm install` inside `frontend/`.
5. Start backend (`python -m backend`) and frontend (`npm run dev`) or use Tauri (`npm run desktop:dev`).
6. Build the .deb via `./build-deb.sh` when ready.

You should now have a fully functional dev environment for Talus Tally. Happy hacking!
