// The Theme Library: themes bundled with Distra, ready to apply without downloading anything.
// Community themes are redistributed under their licences (builtin-themes/LICENSES.md); the
// `distra/` ones were made for Distra.

import t_distra_night from "../../../builtin-themes/distra/distra-night.json";
import t_distra_daylight from "../../../builtin-themes/distra/distra-daylight.json";
import t_ember from "../../../builtin-themes/distra/ember.json";
import t_moss from "../../../builtin-themes/distra/moss.json";
import t_catppuccin_mocha from "../../../builtin-themes/vendetta/catppuccin-mocha-mauve.json";
import t_catppuccin_macchiato from "../../../builtin-themes/vendetta/catppuccin-macchiato-mauve.json";
import t_catppuccin_frappe from "../../../builtin-themes/vendetta/catppuccin-frappe-mauve.json";
import t_catppuccin_latte from "../../../builtin-themes/vendetta/catppuccin-latte-mauve.json";
import t_pixel_city from "../../../builtin-themes/vendetta/pixel-city.json";
import t_purple_mountains from "../../../builtin-themes/vendetta/purple-mountains.json";
import t_vulcan from "../../../builtin-themes/vendetta/vulcan.json";
import t_glorious_sunset from "../../../builtin-themes/vendetta/glorious-sunset.json";
import t_dreamy from "../../../builtin-themes/vendetta/dreamy.json";
import t_gruv_yellow from "../../../builtin-themes/vendetta/gruv-yellow.json";
import t_nord from "../../../builtin-themes/enmity/nord.json";
import t_dracula from "../../../builtin-themes/enmity/dracula.json";
import t_tokyo_night from "../../../builtin-themes/enmity/tokyonight.json";
import t_gruvbox_dark from "../../../builtin-themes/enmity/gruvboxdark.json";
import t_lotus from "../../../builtin-themes/enmity/lotus.json";
import t_mars from "../../../builtin-themes/enmity/mars.json";
import t_mist from "../../../builtin-themes/enmity/mist.json";

export interface LibraryTheme {
    id: string;
    manifest: any;
    /** Who made it, for credit. */
    author: string;
    license: string;
    source: string;
    /** Made for Distra (shown first). */
    official: boolean;
}

export const LIBRARY: LibraryTheme[] = [
    { id: "distra-night", manifest: t_distra_night, author: "Distra", license: "GPL-3.0-or-later", source: "https://github.com/OMetaVR/Distra", official: true },
    { id: "distra-daylight", manifest: t_distra_daylight, author: "Distra", license: "GPL-3.0-or-later", source: "https://github.com/OMetaVR/Distra", official: true },
    { id: "ember", manifest: t_ember, author: "Distra", license: "GPL-3.0-or-later", source: "https://github.com/OMetaVR/Distra", official: true },
    { id: "moss", manifest: t_moss, author: "Distra", license: "GPL-3.0-or-later", source: "https://github.com/OMetaVR/Distra", official: true },
    { id: "catppuccin-mocha", manifest: t_catppuccin_mocha, author: "Catppuccin", license: "MIT", source: "https://github.com/catppuccin/vendetta", official: false },
    { id: "catppuccin-macchiato", manifest: t_catppuccin_macchiato, author: "Catppuccin", license: "MIT", source: "https://github.com/catppuccin/vendetta", official: false },
    { id: "catppuccin-frappe", manifest: t_catppuccin_frappe, author: "Catppuccin", license: "MIT", source: "https://github.com/catppuccin/vendetta", official: false },
    { id: "catppuccin-latte", manifest: t_catppuccin_latte, author: "Catppuccin", license: "MIT", source: "https://github.com/catppuccin/vendetta", official: false },
    { id: "pixel-city", manifest: t_pixel_city, author: "Wizzy", license: "MIT", source: "https://github.com/Wizzy-TV/VendettaThemes", official: false },
    { id: "purple-mountains", manifest: t_purple_mountains, author: "Wizzy", license: "MIT", source: "https://github.com/Wizzy-TV/VendettaThemes", official: false },
    { id: "vulcan", manifest: t_vulcan, author: "Wizzy", license: "MIT", source: "https://github.com/Wizzy-TV/VendettaThemes", official: false },
    { id: "glorious-sunset", manifest: t_glorious_sunset, author: "myxi", license: "MIT", source: "https://github.com/eeriemyxi/glorious-sunset", official: false },
    { id: "dreamy", manifest: t_dreamy, author: "LewdLilly", license: "MIT", source: "https://github.com/LewdLillyVT/RevengeThemes", official: false },
    { id: "gruv-yellow", manifest: t_gruv_yellow, author: "Taki Shiwa", license: "MIT", source: "https://github.com/TakiShiwa/Themes", official: false },
    { id: "nord", manifest: t_nord, author: "Nebula", license: "BSD-3-Clause", source: "https://github.com/itsnebulalol/static", official: false },
    { id: "dracula", manifest: t_dracula, author: "Nebula", license: "BSD-3-Clause", source: "https://github.com/itsnebulalol/static", official: false },
    { id: "tokyo-night", manifest: t_tokyo_night, author: "Nebula", license: "BSD-3-Clause", source: "https://github.com/itsnebulalol/static", official: false },
    { id: "gruvbox-dark", manifest: t_gruvbox_dark, author: "Nebula", license: "BSD-3-Clause", source: "https://github.com/itsnebulalol/static", official: false },
    { id: "lotus", manifest: t_lotus, author: "Nebula", license: "BSD-3-Clause", source: "https://github.com/itsnebulalol/static", official: false },
    { id: "mars", manifest: t_mars, author: "Nebula", license: "BSD-3-Clause", source: "https://github.com/itsnebulalol/static", official: false },
    { id: "mist", manifest: t_mist, author: "Nebula", license: "BSD-3-Clause", source: "https://github.com/itsnebulalol/static", official: false },
];
