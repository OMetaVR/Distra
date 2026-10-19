// Finding color codes in text (ported from Vencord's MessageColors constants, by Hen).

export type ColorType = "rgb" | "rgba" | "hex" | "hsl";

export interface FoundColor {
    index: number;
    text: string;
    /** "#rrggbb" or "#rrggbbaa". */
    hex: string;
}

const VALUE = "\\s*?\\d+?\\s*?";
const SEP = "(?:,|\\s)";
const FLOAT = "[+-]?(?:[0-9]*[.])?[0-9]+";

const SOURCES = [
    `rgb\\(${VALUE}${SEP}${VALUE}${SEP}${VALUE}\\)`,
    `rgba\\(${VALUE}${SEP}${VALUE}${SEP}${VALUE}(?:${SEP}|\\/?)\\s*${FLOAT}\\)`,
    `hsl\\(${VALUE}°?${SEP}\\s*?\\d+%?\\s*?${SEP}\\s*?\\d+%?\\s*?\\)`,
];

let cached: { short: boolean; regex: RegExp } | undefined;
function colorRegex(shortHex: boolean) {
    if (cached?.short === shortHex) return cached.regex;
    // Not inside a longer word, so "#abcdefg" or "#add1" aren't half-colored.
    const hex = `#(?:[0-9a-fA-F]{3})${shortHex ? "{1,2}" : "{2}"}(?![0-9a-zA-Z_])`;
    const regex = new RegExp([...SOURCES, hex].join("|"), "gi");
    cached = { short: shortHex, regex };
    return regex;
}

const clamp = (value: number, max = 255) => Math.max(0, Math.min(max, value));
const byte = (value: number) => Math.round(clamp(value)).toString(16).padStart(2, "0");

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    s = clamp(s, 100) / 100;
    l = clamp(l, 100) / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Converts a matched color code to hex, or undefined if it isn't a valid color. */
export function toHex(text: string): string | undefined {
    const lower = text.toLowerCase();
    if (lower.startsWith("#")) {
        const digits = lower.slice(1);
        return `#${digits.length === 3 ? digits.split("").map(d => d + d).join("") : digits}`;
    }
    const numbers = lower.match(/[+-]?(?:\d*\.)?\d+/g)?.map(Number) ?? [];
    if (lower.startsWith("hsl")) return numbers.length >= 3 ? `#${hslToRgb(numbers[0] % 360, numbers[1], numbers[2]).map(byte).join("")}` : undefined;
    if (numbers.length < 3) return undefined;
    const rgb = numbers.slice(0, 3).map(byte).join("");
    if (lower.startsWith("rgba") && numbers.length >= 4) {
        const alpha = numbers[3] > 1 ? numbers[3] / 100 : numbers[3];
        return `#${rgb}${byte(alpha * 255)}`;
    }
    return `#${rgb}`;
}

/** Every color code in `text`. */
export function findColors(text: string, shortHex: boolean): FoundColor[] {
    // Cheap check first: every color code starts with r, h or #.
    if (!/[rh#]/i.test(text)) return [];
    const regex = colorRegex(shortHex);
    regex.lastIndex = 0;
    const found: FoundColor[] = [];
    for (const match of text.matchAll(regex)) {
        const hex = toHex(match[0]);
        if (hex) found.push({ index: match.index!, text: match[0], hex });
    }
    return found;
}
