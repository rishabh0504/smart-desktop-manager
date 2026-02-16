# Local Build Instructions — Smart Desktop Manager

Build the application locally and generate **GUI wizard installers** (`.pkg` for macOS, `.exe` for Windows).

## Prerequisites

| Tool | Install |
|------|---------|
| **Rust** | [rustup.rs](https://www.rust-lang.org/tools/install) |
| **Node.js 20+** | [nodejs.org](https://nodejs.org/) |
| **pnpm** | `npm install -g pnpm` |
| **Tauri CLI** | `pnpm install -g @tauri-apps/cli` |

## Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Prepare the AI Bootstrapper (Sidecar)
The sidecar binary must be pre-built and placed with the correct target-triple name.

**macOS (Apple Silicon):**
```bash
cd src-tauri
cargo build --bin sdm-installer --release
mkdir -p binaries
cp target/release/sdm-installer binaries/sdm-installer-aarch64-apple-darwin
cd ..
```

**Windows (x64):**
```bash
cd src-tauri
cargo build --bin sdm-installer --release
mkdir binaries
copy target\release\sdm-installer.exe binaries\sdm-installer-x86_64-pc-windows-msvc.exe
cd ..
```

### 3. Build the GUI Wizard Installer

#### macOS — PKG Wizard (Welcome → License → Install → Done)
```bash
pnpm build:pkg
```
This produces `SmartDesktopManager.pkg` in the project root.
The installer shows a full GUI wizard with Welcome, License Agreement, and Conclusion screens.

#### Windows — NSIS Wizard (Welcome → License → Install → Done)
```bash
pnpm tauri build --bundles nsis
```
Output: `src-tauri/target/release/bundle/nsis/Smart Desktop Manager_0.1.0_x64-setup.exe`

### 4. Test the Installer
- **macOS**: Double-click `SmartDesktopManager.pkg` — you'll see the wizard GUI.
- **Windows**: Double-click the generated `.exe` — you'll see the NSIS wizard GUI.

## How the Installer Works
1. **Welcome** — Introduces the app
2. **License Agreement** — User must agree to the MIT license
3. **Installation** — Copies the app to `/Applications` (macOS) or `Program Files` (Windows)
4. **AI Bootstrapping** — Runs `sdm-installer` to set up Ollama & pull the AI model
    - **macOS**: View progress in `Cmd + L` (Installer Log) or `tail -f /var/log/sdm-install.log`
    - **Windows**: Click **"Show Details"** in the installer to see real-time progress.
5. **Conclusion** — Confirms success

## Troubleshooting
- **"resource path doesn't exist"** → Step 2 was skipped. Build the sidecar first.
- **Code Signing warning (macOS)** → Safe to ignore for local testing. Required for distribution.
- **UAC prompt (Windows)** → Expected. The NSIS installer runs as admin (`perMachine` mode).
