// Icon packs that can be downloaded in the app (Settings > Distra > Icon Packs), for installs that
// don't have them bundled (the dylib, jailbreak packages). They come from rosiecord's repository
// (GPL-3.0) through jsDelivr, which also lists the files, and are saved file by file into
// Documents/Distra/IconPacks/<name>/.

import { callNative } from "@/core/bridge";
import { fileExists, removeFile, writeFile } from "@/core/fs";

const REPO = "acquitelol/rosiecord";
const REF = "master";
const LISTING = `https://data.jsdelivr.com/v1/packages/gh/${REPO}@${REF}?structure=flat`;
const FILES = `https://cdn.jsdelivr.net/gh/${REPO}@${REF}`;
const CONCURRENCY = 12;
/** Written last; a pack folder without it was interrupted and can be resumed. */
const COMPLETE_MARKER = ".distra-complete";

export interface DownloadablePack {
    id: string;
    name: string;
    description: string;
    credit: string;
}

export const DOWNLOADABLE_PACKS: DownloadablePack[] = [
    { id: "Plumpy", name: "Plumpy", description: "Rounded, filled icons", credit: "rosiecord (GPL-3.0)" },
    { id: "Iconsax", name: "Iconsax", description: "Thin outline icons", credit: "rosiecord (GPL-3.0)" },
];

const packDir = (id: string) => `IconPacks/${id}`;

export type PackState = "missing" | "partial" | "installed";

export async function packState(id: string): Promise<PackState> {
    if (await fileExists(`${packDir(id)}/${COMPLETE_MARKER}`).catch(() => false)) return "installed";
    return await fileExists(packDir(id)).catch(() => false) ? "partial" : "missing";
}

let listing: Promise<string[]> | undefined;
async function repoFiles(): Promise<string[]> {
    listing ??= fetch(LISTING)
        .then(response => {
            if (!response.ok) throw new Error(`Couldn't list the packs (HTTP ${response.status})`);
            return response.json();
        })
        .then((data: { files?: { name: string }[] }) => (data.files ?? []).map(file => file.name))
        .catch(error => {
            listing = undefined;
            throw error;
        });
    return listing;
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/**
 * Downloads (or resumes) a pack. `onProgress(done, total)` is called as files arrive.
 * Files already on the device are skipped, so an interrupted download picks up where it stopped.
 */
export async function downloadPack(id: string, onProgress: (done: number, total: number) => void) {
    const prefix = `/Packs/${id}/`;
    const files = (await repoFiles()).filter(name => name.startsWith(prefix)).map(name => name.slice(prefix.length));
    if (!files.length) throw new Error(`${id} isn't in ${REPO} any more`);

    let done = 0;
    let next = 0;
    onProgress(0, files.length);
    const worker = async () => {
        while (next < files.length) {
            const file = files[next++];
            const target = `${packDir(id)}/${file}`;
            if (!await fileExists(target).catch(() => false)) {
                await callNative("fs.download", `${FILES}${encodePath(prefix + file)}`, target);
            }
            onProgress(++done, files.length);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await writeFile(`${packDir(id)}/${COMPLETE_MARKER}`, new Date().toISOString());
}

export const removePack = (id: string) => removeFile(packDir(id));
