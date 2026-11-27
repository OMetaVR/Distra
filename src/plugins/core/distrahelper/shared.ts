// What Distra Helper messages look like, shared with Distra Desktop's DistraHelper so either client can
// send them and both show the cards: the last line of a message from the owner is a marker,
//   -# Distra · plugin:PinDMs,FakeBadges | update | open:<section> | debug

import { loader } from "@/core/loader";
import { builtins, getRecord, isRunning, plugins } from "@/plugins/manager";
import type { PluginRecord } from "@/plugins/types";
import { findByStoreName } from "@/metro";

/** mmeta. Only their messages turn into cards, and only they get the helper commands. */
export const OWNER_ID = "297075664530440192";

export const MARKER = /^-# Distra · (plugin|update|open|debug)(?::(.+))?$/m;

export type MarkerKind = "plugin" | "update" | "open" | "debug";

export const parseMarker = (content: string | undefined) => {
    const match = MARKER.exec(content ?? "");
    return match ? { kind: match[1] as MarkerKind, arg: match[2] ?? "" } : null;
};

/** Desktop settings sections; iOS shows the closest page, or says it doesn't have one. */
export const SECTIONS = {
    distra: { label: "Distra settings", page: () => import("@/ui/pages/General") },
    plugins: { label: "Plugins", page: () => import("@/ui/pages/PluginLibrary") },
    themes: { label: "Themes", page: () => import("@/ui/pages/Themes") },
    updater: { label: "Updater", page: null },
    cloud: { label: "Cloud", page: null },
    backup: { label: "Backup & Restore", page: null },
} as const;

export type SectionId = keyof typeof SECTIONS;

export const currentUserId = (): string | undefined => findByStoreName("UserStore")?.getCurrentUser?.()?.id;
export const isOwner = () => currentUserId() === OWNER_ID;

/** "Pin DMs", "PinDMs" and "pindms" are the same plugin (desktop names have no spaces). */
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Name to send for a plugin: its name without spaces, which desktop matches too. */
export const shareName = (record: PluginRecord) => record.manifest.name.replace(/\s+/g, "");

const allRecords = (): PluginRecord[] => [...Object.values(builtins), ...Object.values(plugins)];

export function findPlugin(name: string): PluginRecord | undefined {
    const wanted = normalize(name);
    if (!wanted) return undefined;
    // Prefer Distra's own plugins, then built-ins, then installed ones.
    const matches = allRecords().filter(record => normalize(record.manifest.name) === wanted);
    return matches.find(record => record.builtin?.core) ?? matches.find(record => record.builtin) ?? matches[0];
}

export const suggestions = (name: string) => {
    const wanted = normalize(name);
    return allRecords().map(record => record.manifest.name).filter(n => normalize(n).includes(wanted)).slice(0, 5);
};

export const pluginState = (record: PluginRecord) => (getRecord(record.id)?.enabled ? (isRunning(record.id) ? "Enabled" : "Enabled, not running") : "Disabled");

export function buildDate() {
    const date = new Date(DISTRA_BUILT_AT);
    return Number.isNaN(date.getTime()) ? "an unknown date" : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export const versionLine = () => `Distra ${DISTRA_VERSION} (${DISTRA_COMMIT.slice(0, 7)}), built ${buildDate()}; tweak ${loader.version}`;

/** A desktop-compatible helper message: an optional note, the body, then the marker. */
export const withNote = (note: string | undefined, body: string) => (note?.trim() ? `${note.trim()}\n${body}` : body);
