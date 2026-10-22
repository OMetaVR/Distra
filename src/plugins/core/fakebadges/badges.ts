// The badge list and the About Me encoding, shared with Distra Desktop's FakeBadges so both read
// and write the same thing (badge codes as invisible Unicode tag characters).

export interface FakeBadge {
    /** Stored in bios, never change or reuse one. */
    code: string;
    name: string;
    icon: string;
}

export const BADGE_GROUPS: { name: string; badges: FakeBadge[] }[] = [
    {
        name: "Discord",
        badges: [
            { code: "a", name: "Discord Staff", icon: "5e74e9b61934fc1f67c65515d1f7e60d" },
            { code: "b", name: "Partnered Server Owner", icon: "3f9748e53446a137a052f3454e2de41e" },
            { code: "c", name: "Moderator Programs Alumni", icon: "fee1624003e2fee35cb398e125dc479b" },
            { code: "h", name: "Discord Bug Hunter", icon: "2717692c7dca7289b35297368a940dd0" },
            { code: "i", name: "Discord Bug Hunter Level 2", icon: "848f79194d4be5ff5f81505cbd0ce1e6" },
            { code: "j", name: "Early Verified Bot Developer", icon: "6df5892e0f35b051f8b61eace34f4967" },
            { code: "l", name: "Active Developer", icon: "6bdc42827a38498929a4920da12695d9" },
            { code: "k", name: "Early Supporter", icon: "7060786766c9c840eb3019e725d2b358" },
            { code: "E", name: "Legacy Username", icon: "6de6d34650760ba5551a79732e98ed60" },
            { code: "F", name: "Completed a Quest", icon: "7d9ae358c8c5e118768335dbe68b4fb8" },
            { code: "G", name: "Orb Profile Badge", icon: "83d8a1eb09a8d64e59233eec5d4d5c2d" }
        ]
    },
    {
        name: "HypeSquad",
        badges: [
            { code: "d", name: "HypeSquad Events", icon: "bf01d1073931f921909045f3a39fd264" },
            { code: "e", name: "HypeSquad Bravery", icon: "8a88d63823d8a71cd5e390baa45efa02" },
            { code: "f", name: "HypeSquad Brilliance", icon: "011940fd013da3f7fb926e4a1cd2e618" },
            { code: "g", name: "HypeSquad Balance", icon: "3aa41de486fa12454c3761e8e223442e" }
        ]
    },
    {
        name: "Nitro",
        badges: [
            { code: "m", name: "Nitro", icon: "2ba85e8026a8614b640c2837bcdfe21b" },
            { code: "n", name: "Nitro Bronze", icon: "4f33c4a9c64ce221936bd256c356f91f" },
            { code: "o", name: "Nitro Silver", icon: "4514fab914bdbfb4ad2fa23df76121a6" },
            { code: "p", name: "Nitro Gold", icon: "2895086c18d5531d499862e41d1155a6" },
            { code: "q", name: "Nitro Platinum", icon: "0334688279c8359120922938dcb1d6f8" },
            { code: "r", name: "Nitro Diamond", icon: "0d61871f72bb9a33a7ae568c1fb4f20a" },
            { code: "s", name: "Nitro Emerald", icon: "11e2d339068b55d3a506cff34d3780f3" },
            { code: "t", name: "Nitro Ruby", icon: "cd5e2cfd9d7f27a8cdcd3e8a8d5dc9f4" },
            { code: "u", name: "Nitro Opal", icon: "5b154df19c53dce2af92c9b61e6be5e2" }
        ]
    },
    {
        name: "Server Boosting",
        badges: [
            { code: "v", name: "Server Booster 1 Month", icon: "51040c70d4f20a921ad6674ff86fc95c" },
            { code: "w", name: "Server Booster 2 Months", icon: "0e4080d1d333bc7ad29ef6528b6f2fb7" },
            { code: "x", name: "Server Booster 3 Months", icon: "72bed924410c304dbe3d00a6e593ff59" },
            { code: "y", name: "Server Booster 6 Months", icon: "df199d2050d3ed4ebf84d64ae83989f8" },
            { code: "z", name: "Server Booster 9 Months", icon: "996b3e870e8a22ce519b3a50e6bdd52f" },
            { code: "A", name: "Server Booster 1 Year", icon: "991c9f39ee33d7537d9f408c3e53141e" },
            { code: "B", name: "Server Booster 15 Months", icon: "cb3ae83c15e970e8f3d410bc62cb8b99" },
            { code: "C", name: "Server Booster 18 Months", icon: "7142225d31238f6387d9f09efaa02759" },
            { code: "D", name: "Server Booster 2 Years", icon: "ec92202290b48d0879b7413d2dde3bab" }
        ]
    },
    {
        name: "Apps",
        badges: [
            { code: "H", name: "Supports Commands", icon: "6f9e37f9029ff57aef81db857890005e" },
            { code: "I", name: "Uses AutoMod", icon: "f2459b691ac7453ed6039bbcfaccbfcd" }
        ]
    }
];

export const badgeIconUrl = (badge: FakeBadge) => `https://cdn.discordapp.com/badge-icons/${badge.icon}.png`;

// Badge codes are stored as invisible Unicode tag characters, like FakeProfileThemes' 3y3 colors.
const toTags = (text: string) => Array.from(text, char => String.fromCodePoint(char.charCodeAt(0) + 0xE0000)).join("");

const PAYLOAD_SOURCE = `${toTags("{DB:")}([\\u{E0030}-\\u{E007A}]*)${toTags("}")}`;
const PAYLOAD = new RegExp(PAYLOAD_SOURCE, "u");
const ALL_PAYLOADS = new RegExp(PAYLOAD_SOURCE, "gu");

const BADGES_BY_TAG = new Map(BADGE_GROUPS.flatMap(group => group.badges).map(badge => [toTags(badge.code), badge]));

export function decodeBadges(bio: string | undefined) {
    const codes = bio?.match(PAYLOAD)?.[1];
    if (!codes) return [];

    return [...new Set(Array.from(codes, tag => BADGES_BY_TAG.get(tag)))].filter((badge): badge is FakeBadge => badge !== undefined);
}

export const stripBadges = (bio: string) => bio.replace(ALL_PAYLOADS, "");

export function encodeBadges(bio: string, badges: FakeBadge[]) {
    const payload = badges.length ? toTags(`{DB:${badges.map(badge => badge.code).join("")}}`) : "";
    return stripBadges(bio) + payload;
}

export const fakeName = (badge: FakeBadge) => `${badge.name} (fake, self-assigned with Distra)`;
