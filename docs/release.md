# Release Desktop

Hiraishin uses Tauri v2 platform-specific config files:

- `src-tauri/tauri.macos.conf.json`: builds `.app` and `.dmg`
- `src-tauri/tauri.windows.conf.json`: builds NSIS `.exe`
- `src-tauri/tauri.linux.conf.json`: builds `.deb` and `.AppImage`

## Local Build

Run the command for the current host platform:

```sh
bun run release:desktop
```

Or use a platform-specific bundle target:

```sh
bun run release:macos
bun run release:windows
bun run release:linux
```

Tauri outputs bundles under:

```text
src-tauri/target/release/bundle/
```

### Windows Build From macOS

The local Windows build uses `cargo-xwin` and targets `x86_64-pc-windows-msvc`.
Some Rust dependencies, including `aws-lc-sys`, compile native assembly for Windows x64 and require NASM.

Install the required tools before running the Windows build from macOS:

```sh
brew install nasm makensis
cargo install cargo-xwin
rustup target add x86_64-pc-windows-msvc
```

Then run:

```sh
bun run release:windows
```

If the build fails with `NASM command not found or failed to execute`, confirm NASM is available:

```sh
nasm -v
```

If the build succeeds but NSIS bundling fails while downloading `nsis_tauri_utils.dll`
with `timeout: global`, prefill the Tauri NSIS cache and rerun the build:

```sh
mkdir -p "$HOME/Library/Caches/tauri/NSIS/Plugins/x86-unicode/additional"
curl -L --retry 5 --retry-delay 2 --connect-timeout 30 --max-time 300 \
  -o "$HOME/Library/Caches/tauri/NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll" \
  "https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll"
shasum -a 1 "$HOME/Library/Caches/tauri/NSIS/Plugins/x86-unicode/additional/nsis_tauri_utils.dll"
```

The expected SHA1 is:

```text
75197fee3c6a814fe035788d1c34ead39349b860
```

For the most reliable Windows installer build, use the GitHub Actions release workflow or build directly on Windows.

## GitHub Release

The release workflow is in `.github/workflows/release.yml`.

Trigger it manually from GitHub Actions, or push a version tag:

```sh
git tag app-v0.1.0
git push origin app-v0.1.0
```

The workflow creates a draft GitHub release and uploads desktop bundles from:

- `macos-latest`: universal macOS build
- `windows-latest`: Windows NSIS installer
- `ubuntu-22.04`: Linux Debian package and AppImage

## Signing

The current workflow creates release artifacts without production code signing.
For public production distribution, configure platform signing before publishing:

- macOS: Developer ID certificate and Apple notarization secrets
- Windows: Authenticode certificate or signing command
- Linux: optional package signing depending on your distribution channel
