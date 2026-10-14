import { slugify } from "@/lib/utils";

/** Where a plugin's code is stored (relative to Documents/Distra). */
export const pluginCodePath = (id: string) => `plugins/code/${slugify(id)}.js`;

/** Storage file for a plugin's own settings. */
export const pluginDataPath = (id: string) => `plugins/data/${slugify(id)}.json`;
