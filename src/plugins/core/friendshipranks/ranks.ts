// The ranks, from Equicord's FriendshipRanks (GPL-3.0-or-later, by Samwich). The icons are its artwork
// redrawn as plain SVGs (icons/*.svg) and rendered to PNG for the badge images:
//   rsvg-convert -w 72 -h 72 icons/<rank>.svg | magick - -strip icons/<rank>.png

import besties from "./icons/besties.png";
import blooming from "./icons/blooming.png";
import burning from "./icons/burning.png";
import fighter from "./icons/fighter.png";
import royal from "./icons/royal.png";
import sprout from "./icons/sprout.png";
import star from "./icons/star.png";

export interface Rank {
    id: string;
    title: string;
    description: string;
    /** Days of friendship needed. */
    days: number;
    /** `days`, for people. */
    after: string;
    icon: string;
}

export const ranks: Rank[] = [
    { id: "sprout", title: "Sprout", description: "Your friendship is just starting", days: 0, after: "New", icon: sprout },
    { id: "blooming", title: "Blooming", description: "Your friendship is getting there!", days: 30, after: "1 month", icon: blooming },
    { id: "burning", title: "Burning", description: "Your friendship has reached terminal velocity", days: 90, after: "3 months", icon: burning },
    { id: "fighter", title: "Fighter", description: "Your friendship is strong", days: 182.5, after: "6 months", icon: fighter },
    { id: "star", title: "Star", description: "Your friendship has been going on for a WHILE", days: 365, after: "1 year", icon: star },
    { id: "royal", title: "Royal", description: "Your friendship has gone through thick and thin", days: 730, after: "2 years", icon: royal },
    { id: "besties", title: "Besties", description: "How do you even manage this???", days: 1826.25, after: "5 years", icon: besties },
];

const DAY = 24 * 60 * 60 * 1000;

export const daysSince = (since: string | number | Date) => (Date.now() - new Date(since).getTime()) / DAY;

/** The highest rank reached after `days` of friendship. */
export function rankFor(days: number): Rank | undefined {
    if (!Number.isFinite(days) || days < 0) return undefined;
    let reached: Rank | undefined;
    for (const rank of ranks) if (days >= rank.days) reached = rank;
    return reached;
}

/** "3 days", "5 months", "2 years, 4 months". */
export function formatDuration(days: number): string {
    const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
    if (days < 1) return "less than a day";
    if (days < 30) return plural(Math.floor(days), "day");
    const months = Math.floor(days / 30.4375);
    if (months < 12) return plural(months, "month");
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return rest ? `${plural(years, "year")}, ${plural(rest, "month")}` : plural(years, "year");
}
