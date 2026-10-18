# Icon pack additions

Distra's additions to the downloadable icon packs: icons a pack is missing for the current
Discord version, and fixes to its own icons. They're laid over the pack when it's downloaded
in Settings > Distra > Icon Packs, and when it's bundled into a release IPA
(`scripts/build-ipa.py --icon-pack`).

`<Pack>/` mirrors Discord's `assets/` layout, like the packs themselves. `sources/<Pack>/` has the
SVG each PNG was rendered from: 24-unit grid, black, with the body at 35% opacity and details at
100% to match Plumpy. Re-render with `resvg -w 48 -h 48` (@2x) and `-w 72 -h 72` (@3x).

When the additions for a pack change, bump its `additionsVersion` in
`src/lib/iconpackDownloads.ts` so installed copies offer an update.

## Plumpy

Missing from rosiecord's Plumpy pack for Discord 348: UserCircleIcon, ShieldLockIcon,
QuestsIcon, ClipsIcon, QrCodeIcon, PaintPaletteIcon, ChatCheckIcon, ShopIcon, BoostGemIcon,
CircleQuestionIcon, CircleInformationIcon, FileWarningIcon, MobilePhoneSettingsIcon.

Replaced: ChevronSmallRightIcon (the pack's version has a flat, notched tip at settings-row size).
