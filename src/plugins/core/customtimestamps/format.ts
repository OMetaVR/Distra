// Formats dates with Discord's moment (so its language follows Discord's), like Equicord's
// CustomTimestamps: moment tokens, plus [calendar] (Today / Yesterday / ... formats) and
// [relative] ("4 hours ago").

import { findByProps } from "@/metro";

import { type FormatKey, formatOf } from "./settings";

let cachedMoment: any;
function moment(): any {
    if (cachedMoment) return cachedMoment;
    const found = findByProps("isMoment", "duration");
    cachedMoment = typeof found === "function" ? found : found?.default;
    return cachedMoment;
}

/** Formats `date` with `template`; `calendar` overrides the [calendar] formats (for previews). */
export function format(date: Date | number, template: string, calendar?: Partial<Record<FormatKey, string>>): string {
    const m = moment()?.(date);
    if (!m?.isValid?.()) return "";
    const pick = (key: FormatKey) => calendar?.[key] ?? formatOf(key);
    return m.format(template)
        .replace("calendar", () => m.calendar(null, {
            sameDay: pick("sameDay"),
            lastDay: pick("lastDay"),
            lastWeek: pick("lastWeek"),
            sameElse: pick("sameElse"),
            nextDay: pick("sameElse"),
            nextWeek: pick("sameElse"),
        }))
        .replace("relative", () => m.fromNow());
}

export const formatAs = (date: Date | number, key: FormatKey) => format(date, formatOf(key));
