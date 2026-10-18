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

## Iconsax

rosiecord's Iconsax pack only covers Discord's old `ic_*` assets, none of the redesign icons
Discord 348 shows. These additions cover the same 128 redesign icons as Plumpy (126 here;
ClydeIcon and NitroWheelIcon stay Discord's, as brand marks).

Most are Iconsax's own artwork from [iconsax-react](https://github.com/rendinjast/iconsax-react)
(MIT): Bold where Discord's icon is filled, Linear where it's a line icon. Lock, warning and
settings variants are an Iconsax base with a small Iconsax badge cut in; slashed variants have a
cut-through slash. Where Iconsax has no matching glyph (megaphone, accessibility, @, backspace,
eyedropper, keyboard, robot, puzzle piece, wrench, and similar) the icon is drawn on Iconsax's grid
with its rounding and 1.5-unit weight, starting from Discord's shape.
