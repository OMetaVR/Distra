# Roadmap

## Status (0.1.0)

Done and verified on a host machine:

- JS runtime builds, typechecks, and passes the Node harness (`tests/`), which
  emulates Metro, the native bridge, and bridgeless `RN$AppRegistry`. It covers
  startup ordering, settings injection, persistence, Vendetta and Enmity plugin
  lifecycles, safe mode, failure fallbacks, and icon pack resolution.
- Tweak compiles with Theos (no warnings) into rootful and rootless .debs with
  no Substrate dependency.
- `scripts/build-ipa.py` produces an IPA from the Discord 348.0 (113691)
  decrypted IPA with the dylib load command, bundled icon packs, extra alternate
  icons, and Files app access.

Verified on a device (Discord 348): the tweak loads, the
Distra settings section works, and the on-device log viewer works.

## 1. Device bring-up

Checklist against Discord 348:

- [x] Tweak loads; the `dev.distra` log shows "Discord bundle ... is loading on RCTInstance"
- [x] Discord starts normally with Distra injected, including after a JS reload
- [ ] `RCTInstanceDidLoadBundle` firing twice (once for our script) has no side effects
- [ ] Bridge round trip works (Developer > Copy loader info shows the payload; settings persist across launches)
- [x] Distra section appears in Settings below Account; pages open and render
- [ ] Built-in plugin pass on device (100 community + 4 Distra plugins; fixed against the 348 bundle, not yet re-tested)
- [ ] Discord component lookups resolve (TableRow, TableSwitchRow, TextInput, Stack, Text, …)
- [ ] Crash loop: 3 forced failures -> safe mode alert; 5 -> stock Discord
- [ ] Install a known Vendetta plugin from the vd-proxy and an Enmity plugin
- [ ] Icon pack applies after reload (rosiecord Plumpy: partial coverage expected)
- [ ] App icon switching
- [ ] Login, messaging, media, voice unaffected; side-by-side install with a custom bundle id

## 2. Near term

- Plugin browser (Vendetta/Bunny proxy repos)
- Themes: Vendetta/Bunny theme JSON (`semanticColors`/`rawColors`). Needs a native
  `DCDThemeColor` swizzle like VendettaTweak's `Themes.x.swift`, plus JS-side color patching
- Fonts (Bunny font manifests)
- In-app icon pack install (download + unzip natively)
- Native `Assets.car` icon overrides (`UIImage imageNamed:` hook backed by a pack's CUICatalog)
- Update icon packs for the redesign icon set (`design/components/Icon/native/redesign/generated/images`)
- React DevTools / remote debugger connection
- Wider Enmity/Aliucord API coverage (themer, clyde, toasts)

## 3. IPA releases

- Distra app icon artwork (wire into CI with `--alt-icon`)
- CI matrix of IPA variants (icon packs, side-by-side bundle id)
- [x] Rolling `beta` prerelease (dylib + debs) on every push to `main`
- Release publishing on tags with IPA artifacts (needs a hosted decrypted IPA URL as a secret)
