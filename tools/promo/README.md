# Promo animation

`ad.html` is the animated phone mockup used at the top of the main README
([`docs/media/distra-ad.gif`](../../docs/media/distra-ad.gif), and
[`distra-ad.mp4`](../../docs/media/distra-ad.mp4) in 1080p). It's a single page: Discord's chat,
Distra's Plugin Library, themes and profile screens drawn in HTML, animated on one timeline.

## Rendering

Needs `ffmpeg`, the repo's dev dependencies (`playwright-core`) and a Chromium build
(`pnpm exec playwright-core install chromium`, or point `CHROME_PATH` at one).

```sh
tools/promo/setup-assets.sh "<path to a decrypted Discord.app>"   # once
node tools/promo/render.mjs                                        # writes docs/media/distra-ad.{mp4,gif}
node tools/promo/render.mjs --frame 9.6                            # one still at 9.6 s, to check a moment
```

`setup-assets.sh` copies Discord's fonts (gg sans, gg mono, ABC Ginto Nord) and redesign icons
from the app and downloads badge images, default avatars and an emoji from Discord's CDN into
`tools/promo/assets/`. These are Discord's, so they're kept out of the repo.

The Plugin Library scene lists every built-in plugin with its real description and authors;
`render.mjs` reads them from `builtin-plugins/catalog.json` and `src/plugins/core` each time, so the
count and list stay current.

## Editing

All timings are in `build()` in `ad.html`, in seconds. `A(element, keyframes, start, duration, easing)`
adds one animation; later animations on the same property take over once they start. Captions on the
left use `capIn`/`capOut`, plugin chips light up with `chipOn` when the phone shows that feature.
Theme colours on the phone are registered custom properties (`--bg`, `--text`, ...), so `theme()`
crossfades them.
