// Time in another time zone. Hermes on iOS formats with Intl.DateTimeFormat's `timeZone` (backed by
// the system's tz database), but formatToParts splits zone names like "GMT+1" into several parts and
// Intl.supportedValuesOf is missing, so zone names are taken from the formatted string and the zone
// list ships with the plugin. Fixed offsets ("UTC+5:30") work too, computed by hand.

import { settings } from "./settings";

const OFFSET = /^(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i;

/** Minutes east of UTC for a fixed "UTC±h[:mm]" zone, or undefined. */
function fixedOffset(zone: string): number | undefined {
    const match = OFFSET.exec(zone.trim());
    if (!match) return undefined;
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
    return minutes > 14 * 60 ? undefined : (match[1] === "-" ? -minutes : minutes);
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatter(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null {
    const key = `${zone}|${JSON.stringify(options)}`;
    let cached = formatters.get(key);
    if (cached === undefined) {
        try {
            cached = new Intl.DateTimeFormat(undefined, { ...options, timeZone: zone });
        } catch {
            cached = null;
        }
        formatters.set(key, cached);
    }
    return cached;
}

export const systemZone = (): string => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
        return "UTC";
    }
};

export const isValidZone = (zone: string) => fixedOffset(zone) != null || formatter(zone, {}) != null;

function hourOptions(): Intl.DateTimeFormatOptions {
    if (settings.hourCycle === "12") return { hour12: true };
    if (settings.hourCycle === "24") return { hourCycle: "h23" };
    return {};
}

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
const LONG: Intl.DateTimeFormatOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" };

const offsetLabel = (minutes: number) => {
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
};

/** Formats `date` as wall-clock time in `zone`. */
function formatIn(zone: string, date: Date, options: Intl.DateTimeFormatOptions): string | undefined {
    const fixed = fixedOffset(zone);
    if (fixed != null) {
        // The date shifted by the offset, formatted as UTC.
        return formatter("UTC", { ...options, ...hourOptions() })?.format(new Date(date.getTime() + fixed * 60000));
    }
    return formatter(zone, { ...options, ...hourOptions() })?.format(date);
}

/** Short zone name at `date` ("EDT", "GMT+1"), or the offset for fixed zones. */
export function zoneName(zone: string, date = new Date()): string {
    const fixed = fixedOffset(zone);
    if (fixed != null) return offsetLabel(fixed);
    const time = formatIn(zone, date, TIME);
    const withName = formatter(zone, { ...TIME, ...hourOptions(), timeZoneName: "short" })?.format(date);
    if (!time || !withName) return zone;
    return withName.replace(time, "").trim() || zone;
}

/** "9:10 PM" (and " EDT" with `withZone`) in `zone` at `date`. */
export function timeIn(zone: string, date = new Date(), withZone = settings.showZoneName): string {
    const time = formatIn(zone, date, TIME) ?? "";
    return withZone && time ? `${time} ${zoneName(zone, date)}` : time;
}

/** "Sunday, October 18, 2026 at 9:10 PM" in `zone`. */
export const longTimeIn = (zone: string, date = new Date()) => formatIn(zone, date, LONG) ?? "";

/** Minutes east of UTC in `zone` at `date` (for sorting and labels). */
export function offsetOf(zone: string, date = new Date()): number {
    const fixed = fixedOffset(zone);
    if (fixed != null) return fixed;
    const parts = formatter(zone, { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })?.formatToParts(date);
    if (!parts) return 0;
    const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

export const offsetName = (zone: string, date = new Date()) => offsetLabel(offsetOf(zone, date));

/** "America/New_York" → "New York" (region in `region`). */
export function cityOf(zone: string): { city: string; region: string } {
    const parts = zone.split("/");
    return { city: parts[parts.length - 1].replace(/_/g, " "), region: parts.slice(0, -1).join(" / ").replace(/_/g, " ") };
}
