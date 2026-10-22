#!/usr/bin/env bash
# Collects what the promo mockup needs into tools/promo/assets (not committed):
#   - gg sans / gg mono / ABC Ginto Nord fonts and redesign icons, copied from a decrypted Discord.app
#     (Discord's own artwork, so it isn't redistributed in this repo);
#   - badge images, default avatars and one custom emoji from Discord's CDN;
#   - the Friendship Ranks icons from this repo.
#
# Usage: tools/promo/setup-assets.sh <path to Discord.app>
set -euo pipefail

app="${1:?usage: $0 <path to Discord.app>}"
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
out="$here/assets"
icons="$app/assets/design/components/Icon/native/redesign/generated/images"
[ -d "$icons" ] || { echo "No redesign icons in $app (expected a decrypted Discord.app)" >&2; exit 1; }

mkdir -p "$out/fonts" "$out/icons"

for font in ggsans-400-normal ggsans-500-medium ggsans-600-semibold ggsans-700-bold ggsans-800-extrabold \
    ggmono-400-normal ggmono-600-semibold abcgintonord-800-extrabold; do
    cp "$app/$font.ttf" "$out/fonts/"
done

for icon in ArrowSmallLeftIcon ChannelListMagnifyingGlassIcon ChatIcon CheckmarkLargeIcon ChevronSmallRightIcon \
    ClockIcon FolderIcon GiftIcon GroupIcon KeyboardIcon MagnifyingGlassIcon MicrophoneIcon PaintPaletteIcon \
    PlusLargeIcon PuzzlePieceIcon ReactionIcon TextIcon; do
    cp "$icons/$icon@3x.png" "$out/icons/$icon.png"
done

for badge in 5e74e9b61934fc1f67c65515d1f7e60d 3f9748e53446a137a052f3454e2de41e fee1624003e2fee35cb398e125dc479b \
    8a88d63823d8a71cd5e390baa45efa02 2717692c7dca7289b35297368a940dd0 6bdc42827a38498929a4920da12695d9 \
    7060786766c9c840eb3019e725d2b358 6de6d34650760ba5551a79732e98ed60 7d9ae358c8c5e118768335dbe68b4fb8 \
    83d8a1eb09a8d64e59233eec5d4d5c2d 2ba85e8026a8614b640c2837bcdfe21b 0d61871f72bb9a33a7ae568c1fb4f20a \
    991c9f39ee33d7537d9f408c3e53141e 011940fd013da3f7fb926e4a1cd2e618; do
    curl -fsSL -o "$out/badge_$badge.png" "https://cdn.discordapp.com/badge-icons/$badge.png"
done
for i in 0 1 2 3 4 5; do
    curl -fsSL -o "$out/av$i.png" "https://cdn.discordapp.com/embed/avatars/$i.png"
done
curl -fsSL -o "$out/emoji1.png" "https://cdn.discordapp.com/emojis/1026533070955872337.png?size=96"

cp "$repo/src/plugins/core/friendshipranks/icons/royal.png" "$repo/src/plugins/core/friendshipranks/icons/besties.png" "$out/"

echo "Assets ready in $out"
