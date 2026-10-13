# Architecture

## Startup

```text
dylib loads (%ctor)                               tweak/Sources/Tweak.x
  hooks RCTCxxBridge / RCTInstance / RCTFileReaderModule / NSFileManager

React Native loads Discord's bundle
  -[RCTInstance _loadScriptFromSource:]           (bridgeless; Discord 348 uses this)
  -[RCTCxxBridge executeApplicationScript:...]    (legacy bridge)
    DCDBootGuard beginLaunch                      decides normal / safe / disabled
    DCDLoader scriptForLaunch                     payload + bundle (embedded or dev URL)
    evaluate Discordia's script, then Discord's bundle

Discordia's script (src/entry.ts)
  defines accessors for Metro's __r / __d globals
Discord's bundle
  __d(...) x N            first read of __d: we call __c() to get the live module registry
  __r(InitializeCore)
  __r(0)                  intercepted:
    patch module factories (track initialization + source file paths)
    hold native calls that start the UI (RN$AppRegistry.runApplication, batched bridge)
    run Discord's entry module normally
    init() (src/index.ts), max 10s
      settings + loader config (via native bridge)
      metro find cache (per Discord build)
      window.vendetta / window.bunny / window.enmity / window.aliucord
      settings UI patch, slash commands, icon pack
    release held calls -> Discord's UI starts
    start(): plugins
```

Discord's entry module runs synchronously, unlike Kettu/rain which defer it. In
bridgeless mode native may call `runApplication` as soon as the bundle finishes
evaluating, and `RN$AppRegistry` only exists once the entry module has run, so
deferring it leaves a window where the UI start could fail. Holding only the
UI-start calls avoids that. Patches still apply because they modify module
exports, which are looked up at call time.

If anything in `init()` throws or times out, Discord starts anyway and an alert
explains what failed.

## Native bridge

JS calls native through `FileReaderModule.readAsDataURL({ discordia: { method, args } })`.
The tweak hooks `-[RCTFileReaderModule readAsDataURL:resolve:reject:]`, handles
payloads with the `discordia` key, and passes everything else through. The module
is part of React Native itself, takes an arbitrary object, and returns a promise,
so this works in both architectures. (rain uses the same trick.)

| Method | Purpose |
| --- | --- |
| `fs.read/write/exists/remove/list` | Files under `Documents/Discordia`, sandboxed natively |
| `loader.getConfig/setConfig` | `Documents/Discordia/loader.json` (custom bundle URL, safe mode) |
| `boot.markStable` | Reset the crash counter |
| `iconpacks.list/index` | Find packs and list their files |
| `builtins.index/code` | Built-in plugin list and code |
| `log.write`, `diag.ready`, `diag.showLogs` | On-device diagnostics |
| `appicon.list/set` | Alternate home screen icons |

## Crash-loop protection

`DCDBootGuard` counts launches that didn't stay up for 15 seconds:

- 3 in a row: **safe mode**. Discordia loads with no plugins and no icon pack, and
  a native alert explains why.
- 5 in a row: **Discordia is not injected**, so Discord runs stock for that launch.
  The counter resets once that launch is stable.

Users can also turn safe mode on from settings.

## Storage (`Documents/Discordia`)

```text
loader.json              native loader config
settings.json            Discordia settings
state/boot.json          crash counter
cache/metro.json         module find cache, invalidated per Discord build
plugins/index.json       installed plugin records
plugins/code/*.js        plugin code
plugins/data/*.json      per-plugin storage
compat/enmity-settings.json
IconPacks/<name>/        user-installed icon packs (visible in the Files app on IPA builds)
```

## Plugins

`src/plugins/manager.ts` stores records and drives the lifecycle. Each flavor in
`src/plugins/flavors/` knows how to fetch and start its plugins:

| Flavor | Install URL | Evaluated as | API |
| --- | --- | --- | --- |
| Vendetta | folder with `manifest.json` (polymanifest) | `vendetta => <code>` returns `{ onLoad, onUnload, settings }` | `window.vendetta` |
| Bunny | folder or `manifest.json` with `spec: 3` | `(bunny, definePlugin) => { <code>; return plugin }` | `bunny` object |
| Enmity / Aliucord | single `.js` file | calls `registerPlugin(plugin)` | `window.enmity` / `window.aliucord` |
| Discordia | folder with `manifest.json` containing `discordia` | `definePlugin => (<code>)` | scoped API, patches auto-reverted |

The flavor is detected from the URL and manifest, and the user can override it
when installing.

### Built-in plugins

`builtin-plugins/catalog.json` pins each upstream repository (commit + license) and
lists the plugin folders that ship. `scripts/sync-plugins.py` vendors the sources;
`scripts/build-plugins.mjs` builds each plugin with the same import mapping as the
upstream templates (`@vendetta/x` -> `vendetta.x`, `enmity/*` -> the enmity API
package), falling back to the author's committed build where the source can't be
built. The result is one JSON blob linked into the dylib (`.incbin`); JS reads the
index at startup (`builtins.index`) and a plugin's code only when it is enabled
(`builtins.code`). Built-ins are never uninstalled; only their enabled state is
stored (`plugins/builtins.json`).

`window.bunny` is installed alongside `window.vendetta`, since Bunny/Kettu-era
plugins call it directly.

Compatibility is API-shape compatibility, plus shims for the Discord changes that broke
most older plugins:

- **Minified component names.** Plugins find elements by `type.name` ("TableRow",
  "ActionSheetRowGroup"). When a module initializes, minified components get their export
  name back (the source file name for default exports), including inside `memo`/`forwardRef`
  and static sub-components (`ActionSheetRow.Group` -> "ActionSheetRowGroup").
  `findByName` also falls back to a module's source file name.
- **Renamed native modules.** `nativeModuleProxy` is wrapped before Discord's bundle runs so
  old names (`MediaManager`, `DCDFileManager`, `InfoDictionaryManager`, ...) resolve to their
  TurboModule replacements, with constants read from `getConstants()`.
- **`DCDChatManager.updateRows`.** Chat rows now go through the DCDChat native component's
  `updateRows` command with the same arguments; calls are routed through a
  `DCDChatManager` object so plugins that rewrite rows there keep working.
- **Settings rows.** `SETTING_RENDERER_CONFIG` is one object updated in place, so plugins
  that wrap it themselves don't hide rows registered later.
- **Removed exports** (as in Kettu): `ActionSheetTitleHeader` -> `BottomSheetTitleHeader`,
  `ActionSheetContentContainer` -> a View; `meta` -> `internal` on the color module.

Plugins that depend on Discord internals which have changed in other ways still break; those
are fixed per plugin in `builtin-plugins/patches/` or replaced by a Discordia plugin.

### Discordia plugins

`src/plugins/core/` holds plugins written for Discordia itself (`definePlugin`), loaded
like built-ins. The message logger keeps only deleted and edited messages, in SQLite (WAL,
snowflakes as INTEGER keys, edits in a `WITHOUT ROWID` table) through the native `db.*`
bridge methods, and prunes by age and count. Rows are decorated in
`RowManager.prototype.generate`.

## Icon packs

Packs mirror the layout of `Discord.app/assets` and are applied on JS reload:
`AssetSourceResolver.prototype.defaultAsset` is patched so any asset present in
the active pack resolves to the pack's file. Packs come from
`Documents/Discordia/IconPacks`, `Discord.app/DiscordiaIconPacks` (IPA builds), or
`/Library/Application Support/Discordia/IconPacks` (jailbreak).

Native images in `Assets.car` are not covered.

Coverage note: Discord 348 keeps most icons under
`assets/design/components/Icon/native/redesign/generated/images/`, a layout that
postdates rosiecord's packs. Of their PNGs, Plumpy matches 803 of 1728 and
Iconsax 282 of 725 asset paths in 348; none cover the redesign icons.

## Settings UI

`src/ui/settings/index.tsx` patches two things in Discord's data-driven settings:

- `SETTING_RENDERER_CONFIG` (via a getter): adds row definitions and the custom page routes
  (`DISCORDIA_CUSTOM_PAGE` plus `VendettaCustomPage` / `BUNNY_CUSTOM_PAGE` for plugins that navigate to those).
- `createList`: inserts the Discordia section after the Account section.

Pages live in `src/ui/pages/` and use Discord's own design-system components
(`TableRowGroup`, `TableRow`, `TableSwitchRow`, …).

## Discordia plugin format

```json
{ "name": "Example", "version": "1.0.0", "main": "index.js", "discordia": { "spec": 1 } }
```

```js
definePlugin({
    start(api) {
        const Messages = api.metro.findByProps("sendMessage", "editMessage");
        api.patcher.before("sendMessage", Messages, args => { /* ... */ });
        api.commands.register({ name: "hello", description: "Say hi", execute: () => ({ content: "hi" }) });
    },
    stop() { },          // optional; patches and commands are reverted automatically
    SettingsComponent,   // optional
})
```

`api.storage` is persisted automatically.
