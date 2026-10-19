// Compiles the keyword list into regular expressions and tests messages against it. Ported from
// Equicord's BlockKeywords (GPL-3.0-or-later, by catcraft): content and embed titles/descriptions.

import { findByStoreName } from "@/metro";

import { settings } from "./settings";

const UserStore = findByStoreName("UserStore");

let compiled: RegExp[] = [];
let invalid = new Set<string>();

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function compile() {
    const flags = settings.caseSensitive ? "" : "i";
    const next: RegExp[] = [];
    invalid = new Set();
    for (const raw of settings.keywords) {
        const keyword = raw.trim();
        if (!keyword) continue;
        try {
            if (settings.useRegex) next.push(new RegExp(keyword, flags));
            else if (settings.wholeWords) next.push(new RegExp(`${/^\w/.test(keyword) ? "\\b" : ""}${escape(keyword)}${/\w$/.test(keyword) ? "\\b" : ""}`, flags));
            else next.push(new RegExp(escape(keyword), flags));
        } catch {
            invalid.add(raw);
        }
    }
    compiled = next;
}

/** Keywords that aren't valid regular expressions (regex mode). */
export const isInvalid = (keyword: string) => invalid.has(keyword);

export const hasKeywords = () => compiled.length > 0;

const test = (text: unknown) => typeof text === "string" && text.length > 0 && compiled.some(regex => regex.test(text));

/** Whether `message` (a message record or API message) contains a blocked keyword. */
export function containsBlockedKeywords(message: any): boolean {
    if (!compiled.length || !message) return false;
    if (settings.ignoreOwnMessages && message.author?.id && message.author.id === UserStore?.getCurrentUser?.()?.id) return false;
    if (test(message.content)) return true;
    if (!settings.checkEmbeds || !Array.isArray(message.embeds)) return false;
    return message.embeds.some((embed: any) => embed && (
        test(embed.rawTitle ?? embed.title) || test(embed.rawDescription ?? embed.description)
        || test(embed.author?.name) || test(embed.footer?.text)
        || (Array.isArray(embed.fields) && embed.fields.some((field: any) => test(field?.rawName ?? field?.name) || test(field?.rawValue ?? field?.value)))
    ));
}
