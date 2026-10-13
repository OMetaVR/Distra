# Discordia

A Discord client mod for iOS. Discordia runs plugins written for **Vendetta**,
**Bunny**, **Enmity** and **Aliucord**, plus its own format, and supports
swappable **icon packs** and extra **app icons**. It is managed from a
Discordia section in Discord's own settings.

> Early development (beta). Built and tested against Discord 348.0 (113691). See [docs/ROADMAP.md](docs/ROADMAP.md).

## Install

The latest build of `main` is always on the [**beta** release](../../releases/tag/beta):

- **`Discordia.dylib`**: inject into Discord with LiveContainer or an IPA patcher (no Substrate needed).
- **`*_iphoneos-arm.deb`** / **`*_iphoneos-arm64.deb`**: rootful / rootless jailbreak packages.

## How it works

Discordia has two halves:

- **`tweak/`**: a Theos tweak (Objective-C/Logos). It evaluates Discordia's JS right
  before Discord's own bundle in the same Hermes runtime, provides a small native
  bridge (files, loader config, icon packs, app icons), and protects against crash
  loops with an automatic safe mode.
- **`src/`**: the JS runtime (TypeScript, bundled with esbuild + swc). It hooks
  Metro's module system, adds the settings UI, and runs plugins through
  per-mod compatibility layers.

The JS bundle is embedded into the dylib at build time, so the tweak is a single
file whether it's installed with a jailbreak or injected into an IPA.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the startup sequence and each part in detail.

## Built-in plugins

Discordia ships **104 plugins**, all disabled until turned on in
**Settings > Discordia > Plugin Library**:

- **4 of its own**, rebuilt for current Discord from the most popular plugins of other mods,
  merging their features: **Message Logger** (deleted messages stay in red, edits keep their
  history, deleted images are greyed out; stored in an on-device SQLite database),
  **Platform Indicators**, **Radial Status**, and **Hide Chat Buttons** (chat bar and call buttons).
- **100 community plugins** (89 Vendetta/Bunny/Revenge, 11 Enmity), vendored in
  `builtin-plugins/sources/` at pinned upstream commits under their authors' licenses and built
  with the rest of Discordia. Fixes for current Discord live in `builtin-plugins/patches/`.

Duplicates were merged or removed (36, each listed with the reason). The library also offers
17 more plugins that are installed from their authors because their code can't be
redistributed. Full list and credits: [builtin-plugins/README.md](builtin-plugins/README.md).

## Building

Requirements: Node 22+, pnpm, and [Theos](https://theos.dev) (macOS or Linux).

```sh
pnpm bootstrap        # installs dependencies for Discordia and the built-in plugins
pnpm build            # built-in plugins + dev bundle, embedded into tweak/Sources/Generated
pnpm test             # runs the bundle against an emulated Discord/Metro runtime
pnpm typecheck

pnpm tweak            # release bundle + rootful .deb   (tweak/packages/*_iphoneos-arm.deb)
pnpm tweak:rootless   # release bundle + rootless .deb  (*_iphoneos-arm64.deb)
```

> On filesystems that don't support Unix permissions (e.g. NTFS), Theos's .deb
> step fails with "control directory has bad permissions"; add
> `THEOS_STAGING_DIR=/tmp/discordia-stage` to the `make` command.

### IPA

`scripts/build-ipa.py` turns a **decrypted** Discord IPA into a Discordia IPA using
[cyan](https://github.com/asdfzxcvbn/pyzule-rw):

```sh
pipx install https://github.com/asdfzxcvbn/pyzule-rw/archive/main.zip
python3 scripts/build-ipa.py --ipa Discord.ipa \
    --deb tweak/packages/dev.discordia.tweak_0.1.0_iphoneos-arm.deb \
    --output dist/Discordia.ipa \
    [--icon-pack path/to/Plumpy] [--alt-icon DiscordiaIcon=icon.png] \
    [--name Discordia --bundle-id dev.discordia.client]
```

The GitHub Actions workflow builds the dylib and .debs on every push, and each push
to `main` replaces the `beta` prerelease with the new build. Run it manually with an
`ipa_url` to also produce an IPA (optionally with rosiecord's icon packs).

## Development loop

```sh
pnpm serve   # rebuilds on change, serves http://<lan-ip>:4040/discordia.js
```

On the device, enable **Settings > Discordia > Developer settings**, then in
**Developer** turn on *Load from custom URL* with that address and reload. The
tweak falls back to the embedded bundle if the server can't be reached.

## Troubleshooting on device

No Mac needed:

- **Startup banner**: a few seconds after launch, a banner says whether Discordia started
  (toggle in Developer). No banner at all means the dylib didn't load.
- **Three-finger long press** anywhere (or tap the banner) opens the log viewer: native and JS
  logs for this launch and the previous one, with Copy/Share.
- The same logs are in `Documents/Discordia/logs/latest.log` and `previous.log`.

## Layout

```text
src/
  entry.ts          bootstrap: captures Metro, holds Discord's UI start until init is done
  index.ts          startup sequence
  core/             loader payload, native bridge, file access, storage, settings
  metro/            module registry, filters, finders, persistent find cache
  lib/              patcher, assets, commands, icon packs, app icons, logging
  compat/           window.vendetta / window.bunny / window.enmity + window.aliucord
  plugins/          plugin manager and one adapter per plugin flavor
  ui/               settings injection, pages, Discord component lookups
shims/              maps `react`/`react-native` imports onto Discord's own copies
builtin-plugins/    vendored plugin sources, catalog (pinned commits/licenses), credits
tweak/              Theos project (Tweak.x hooks, loader, bridge, boot guard)
scripts/            build, plugin sync/build, dev server, IPA builder
tests/              Node harness emulating Metro + the native bridge
```

## Credits

Ideas and approaches are drawn from [Vendetta](https://github.com/vendetta-mod),
[Bunny](https://github.com/pyoncord/Bunny), [Kettu](https://github.com/C0C0B01/Kettu),
[rain](https://codeberg.org/raincord/rain), [Enmity](https://github.com/enmity-mod),
[Aliucord iOS](https://github.com/Aliucord/Aliucord-iOS) and
[rosiecord](https://github.com/acquitelol/rosiecord). Icon packs are not part of
this repository; rosiecord's packs are GPL-3.0 licensed and fetched at build time.
