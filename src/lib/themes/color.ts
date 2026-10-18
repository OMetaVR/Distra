// Small colour helpers for themes: everything is normalised to "#rrggbbaa".

import { processColor } from "react-native";

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", rgb()/rgba(), "transparent" or a named colour -> "#rrggbbaa". */
export function normalizeColor(input: unknown): string | undefined {
    if (typeof input !== "string") return undefined;
    const value = input.trim().toLowerCase();
    if (!value) return undefined;
    if (value === "transparent") return "#00000000";

    const hex = /^#([0-9a-f]{3,8})$/.exec(value)?.[1];
    if (hex) {
        if (hex.length === 3 || hex.length === 4) return `#${[...hex].map(c => c + c).join("")}${hex.length === 3 ? "ff" : ""}`;
        if (hex.length === 6) return `#${hex}ff`;
        if (hex.length === 8) return `#${hex}`;
        return undefined;
    }

    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(value);
    if (rgb) {
        const alpha = rgb[4] == null ? 1 : rgb[4].endsWith("%") ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
        return `#${hex2(+rgb[1])}${hex2(+rgb[2])}${hex2(+rgb[3])}${hex2(alpha * 255)}`;
    }

    // Named colours and anything else React Native understands. processColor returns 0xAARRGGBB.
    const processed = processColor(value);
    if (typeof processed !== "number") return undefined;
    const n = processed >>> 0;
    return `#${hex2((n >> 16) & 0xff)}${hex2((n >> 8) & 0xff)}${hex2(n & 0xff)}${hex2((n >>> 24) & 0xff)}`;
}

/** `color` with its alpha multiplied by `opacity`. */
export function withOpacity(color: string, opacity: number): string {
    const normalized = normalizeColor(color);
    if (!normalized || opacity >= 1) return normalized ?? color;
    const alpha = parseInt(normalized.slice(7, 9), 16) / 255;
    return normalized.slice(0, 7) + hex2(alpha * opacity * 255);
}
