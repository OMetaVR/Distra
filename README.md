# Distra

[![Latest release](https://img.shields.io/github/v/release/OMetaVR/Distra?label=release)](https://github.com/OMetaVR/Distra/releases/latest)
[![Beta](https://img.shields.io/badge/beta-latest%20main-5865f2)](https://github.com/OMetaVR/Distra/releases/tag/beta)
[![Build](https://github.com/OMetaVR/Distra/actions/workflows/build.yml/badge.svg)](https://github.com/OMetaVR/Distra/actions/workflows/build.yml)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)

A Discord client mod for iOS. Distra runs plugins written for **Vendetta**,
**Bunny**, **Enmity** and **Aliucord**, plus its own format, and supports
**themes** (Vendetta, Bunny and Enmity theme files), swappable **icon packs** and extra
**app icons**. It is managed from a
Distra section in Discord's own settings.

> Early development. Built and tested against Discord 348.0 (113691). See [docs/ROADMAP.md](docs/ROADMAP.md).

> [!WARNING]
> Distra is an unofficial modification, not affiliated with or endorsed by Discord. Client mods
> break Discord's Terms of Service; use them at your own risk. Plugins run with full access to
> your account, and some (token tools, account switchers, HypeSquad changer, silent leave) act on
> it directly: only enable what you understand.

## Install

**Releases** ([latest](../../releases/latest)) are tested builds and include everything:

- **`Distra.ipa`**: Discord with Distra already injected, for sideloading (AltStore, SideStore,
  Sideloadly, TrollStore…). IPAs are only published with full releases.
- **`Distra.dylib`**: inject into Discord yourself with LiveContainer or an IPA patcher (no Substrate needed).
- **`*_iphoneos-arm.deb`** / **`*_iphoneos-arm64.deb`**: rootful / rootless jailbreak packages.

The [**beta** prerelease](../../releases/tag/beta) is rebuilt from every push to `main` and has
the dylib and .debs only.

## How it works

Distra has two halves:

- **`tweak/`**: a Theos tweak (Objective-C/Logos). It evaluates Distra's JS right
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

Distra ships **98 plugins**, all disabled until turned on in
**Settings > Distra > Plugin Library**:

- **5 of its own**, rebuilt for current Discord from the most popular plugins of other mods,
  merging their features: **Message Logger** (deleted messages stay in red, edits keep their
  history, deleted images are greyed out; stored in an on-device SQLite database),
  **Platform Indicators**, **Radial Status**, **Hide Chat Buttons** (chat bar and call buttons,
  swipe to collapse) and **Fake Nitro** (fake emoji and sticker links shown as the real thing).
- **93 community plugins** (86 Vendetta/Bunny/Revenge, 7 Enmity), vendored in
  `builtin-plugins/sources/` at pinned upstream commits under their authors' licenses and built
  with the rest of Distra. Fixes for current Discord live in `builtin-plugins/patches/`.

Duplicates, plugins for features Discord now has itself, and Android-only plugins were merged or
removed (44, each listed with the reason). The library also offers 17 more plugins that are
installed from their authors because their code can't be redistributed. Full list and credits:
[builtin-plugins/README.md](builtin-plugins/README.md).

## Themes

Distra applies Vendetta (spec 2), Bunny (spec 3) and Enmity theme files, installed from a link,
pasted, or picked from the **Theme Library** in Settings > Distra. Themes change how Discord looks
on the device only; Discord's own appearance setting is never touched. Themes made for older
Discord versions are mapped onto the current design (renamed colour tokens, and the old grey
palette onto the new one), and the tweak applies the colours to Discord's natively drawn UI too.

The library has 4 themes made for Distra and 17 community themes (Catppuccin, Nord, Dracula,
Tokyo Night, Gruvbox and more) redistributed under their authors' MIT and BSD licences; see
[builtin-themes/LICENSES.md](builtin-themes/LICENSES.md).

## Building

Requirements: Node 22+, pnpm, and [Theos](https://theos.dev) (macOS or Linux).

```sh
pnpm bootstrap        # installs dependencies for Distra and the built-in plugins
pnpm build            # built-in plugins + dev bundle, embedded into tweak/Sources/Generated
pnpm test             # runs the bundle against an emulated Discord/Metro runtime
pnpm typecheck

pnpm tweak            # release bundle + rootful .deb   (tweak/packages/*_iphoneos-arm.deb)
pnpm tweak:rootless   # release bundle + rootless .deb  (*_iphoneos-arm64.deb)
```

> On filesystems that don't support Unix permissions (e.g. NTFS), Theos's .deb
> step fails with "control directory has bad permissions"; add
> `THEOS_STAGING_DIR=/tmp/distra-stage` to the `make` command.

### IPA

`scripts/build-ipa.py` turns a **decrypted** Discord IPA into a Distra IPA using
[cyan](https://github.com/asdfzxcvbn/pyzule-rw):

```sh
pipx install https://github.com/asdfzxcvbn/pyzule-rw/archive/main.zip
python3 scripts/build-ipa.py --ipa Discord.ipa \
    --deb tweak/packages/dev.distra.tweak_0.1.0_iphoneos-arm.deb \
    --output dist/Distra.ipa \
    [--icon-pack path/to/Plumpy] [--alt-icon DistraIcon=icon.png] \
    [--name Distra --bundle-id dev.distra.client]
```

The GitHub Actions workflow builds the dylib and .debs on every push, and each push
to `main` replaces the `beta` prerelease with the new build. Run it manually with an
`ipa_url` to also produce an IPA (optionally with rosiecord's icon packs).

## Development loop

```sh
pnpm serve   # rebuilds on change, serves http://<lan-ip>:4040/distra.js
```

On the device, enable **Settings > Distra > Developer settings**, then in
**Developer** turn on *Load from custom URL* with that address and reload. The
tweak falls back to the embedded bundle if the server can't be reached.

### Remote debugger

```sh
pnpm devtools                          # prints http://<lan-ip>:4041/?token=…
node scripts/dt.mjs 'dt.tree({ match: "ChatInput", depth: 6 })'
node scripts/dt.mjs 'vendetta.metro.findByProps("TableRow")'
node scripts/dt.mjs logs -f
```

In **Developer > Remote debugger**, enter the printed URL and reload. The device then
long-polls the server: code sent with `dt.mjs` runs in Discord's JS runtime (results come back
as JSON), and Distra's log, console output and uncaught errors stream to
`dist/devtools.log`. `dt.tree()` prints the rendered React component tree with each
component's source file, which is what most plugin fixes need. Anyone with the URL can run code
in your Discord session, so only use it on a trusted network and turn it off afterwards.

## Troubleshooting on device

No Mac needed:

- **Startup banner**: a few seconds after launch, a banner says whether Distra started
  (toggle in Developer). No banner at all means the dylib didn't load.
- **Three-finger long press** anywhere (or tap the banner) opens the log viewer: native and JS
  logs for this launch and the previous one, with Copy/Share.
- The same logs are in `Documents/Distra/logs/latest.log` and `previous.log`.

## Layout

```text
src/
  entry.ts          bootstrap: captures Metro, holds Discord's UI start until init is done
  index.ts          startup sequence
  core/             loader payload, native bridge, file access, storage, settings
  metro/            module registry, filters, finders, persistent find cache
  lib/              patcher, assets, commands, themes, icon packs, app icons, logging
  compat/           window.vendetta / window.bunny / window.enmity + window.aliucord
  plugins/          plugin manager and one adapter per plugin flavor
  ui/               settings injection, pages, Discord component lookups
shims/              maps `react`/`react-native` imports onto Discord's own copies
builtin-plugins/    vendored plugin sources, catalog (pinned commits/licenses), credits
builtin-themes/     Theme Library themes and their licences
tweak/              Theos project (Tweak.x hooks, loader, bridge, boot guard)
scripts/            build, plugin sync/build, dev server, IPA builder
tests/              Node harness emulating Metro + the native bridge
```

## License

Distra is licensed under the [GNU General Public License v3.0 or later](LICENSE). The built-in
plugins in `builtin-plugins/sources/` keep their own licenses (listed per plugin in
[builtin-plugins/README.md](builtin-plugins/README.md)); several are GPL-3.0, which is one reason
Distra itself is GPL.

## Credits

Ideas and approaches are drawn from [Vendetta](https://github.com/vendetta-mod),
[Bunny](https://github.com/pyoncord/Bunny), [Kettu](https://github.com/C0C0B01/Kettu),
[rain](https://codeberg.org/raincord/rain), [Enmity](https://github.com/enmity-mod),
[Aliucord iOS](https://github.com/Aliucord/Aliucord-iOS) and
[rosiecord](https://github.com/acquitelol/rosiecord). Icon packs are not part of
this repository; rosiecord's Plumpy and Iconsax packs (GPL-3.0) are bundled into release IPAs
and can be downloaded in the app (Settings > Distra > Icon Packs) on other installs.
