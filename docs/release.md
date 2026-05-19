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
