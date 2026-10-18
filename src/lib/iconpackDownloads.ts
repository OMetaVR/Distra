// Icon packs that can be downloaded in the app (Settings > Distra > Icon Packs), for installs that
// don't have them bundled (the dylib, jailbreak packages). They come from rosiecord's repository
// (GPL-3.0) through jsDelivr, which also lists the files, and are saved file by file into
// Documents/Distra/IconPacks/<name>/. Distra's own additions to a pack (iconpacks/<name> in this
// repository: icons the pack lacks, fixes) are downloaded after it and replace its files.

import { callNative } from "@/core/bridge";
import { fileExists, readFile, removeFile, writeFile } from "@/core/fs";

const REPO = "acquitelol/rosiecord";
const REF = "master";
const ADDITIONS_REPO = "OMetaVR/Distra";
const ADDITIONS_REF = "main";
const CONCURRENCY = 12;
/** Written last; a pack folder without it was interrupted and can be resumed. */
const COMPLETE_MARKER = ".distra-complete";

export interface DownloadablePack {
    id: string;
    name: string;
    description: string;
    credit: string;
    /** Bumped when Distra's additions for the pack change, so installed copies offer an update. */
    additionsVersion?: number;
}

export const DOWNLOADABLE_PACKS: DownloadablePack[] = [
    { id: "Plumpy", name: "Plumpy", description: "Rounded, filled icons", credit: "rosiecord (GPL-3.0)", additionsVersion: 1 },
    { id: "Iconsax", name: "Iconsax", description: "Bold Iconsax icons", credit: "rosiecord (GPL-3.0), Iconsax (MIT)", additionsVersion: 1 },
];

const packDir = (id: string) => `IconPacks/${id}`;

export type PackState = "missing" | "partial" | "outdated" | "installed";

const markerFor = (pack: DownloadablePack | undefined) => `additions ${pack?.additionsVersion ?? 0}`;

export async function packState(id: string): Promise<PackState> {
    const marker = await readFile(`${packDir(id)}/${COMPLETE_MARKER}`).catch(() => null);
    if (marker != null) {
        const pack = DOWNLOADABLE_PACKS.find(candidate => candidate.id === id);
        return !pack?.additionsVersion || marker.trim() === markerFor(pack) ? "installed" : "outdated";
    }
    return await fileExists(packDir(id)).catch(() => false) ? "partial" : "missing";
}

const listings = new Map<string, Promise<string[]>>();
function listRepo(repo: string, ref: string): Promise<string[]> {
    const key = `${repo}@${ref}`;
    let listing = listings.get(key);
    if (!listing) {
        listing = fetch(`https://data.jsdelivr.com/v1/packages/gh/${key}?structure=flat`)
            .then(response => {
                if (!response.ok) throw new Error(`Couldn't list the packs (HTTP ${response.status})`);
                return response.json();
            })
            .then((data: { files?: { name: string }[] }) => (data.files ?? []).map(file => file.name))
            .catch(error => {
                listings.delete(key);
                throw error;
            });
        listings.set(key, listing);
    }
    return listing;
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

interface Download { url: string; target: string; replace: boolean }

/**
 * Downloads (or resumes) a pack. `onProgress(done, total)` is called as files arrive.
 * Files already on the device are skipped, so an interrupted download picks up where it stopped;
 * Distra's additions are always fetched again, since they replace the pack's own files.
 */
export async function downloadPack(id: string, onProgress: (done: number, total: number) => void) {
    const pack = DOWNLOADABLE_PACKS.find(candidate => candidate.id === id);
    const prefix = `/Packs/${id}/`;
    const files = (await listRepo(REPO, REF)).filter(name => name.startsWith(prefix)).map(name => name.slice(prefix.length));
    if (!files.length) throw new Error(`${id} isn't in ${REPO} any more`);

    const downloads: Download[] = files.map(file => ({
        url: `https://cdn.jsdelivr.net/gh/${REPO}@${REF}${encodePath(prefix + file)}`,
        target: `${packDir(id)}/${file}`,
        replace: false,
    }));
    if (pack?.additionsVersion) {
        const additionsPrefix = `/iconpacks/${id}/`;
        for (const name of await listRepo(ADDITIONS_REPO, ADDITIONS_REF)) {
            if (!name.startsWith(additionsPrefix)) continue;
            downloads.push({
                url: `https://cdn.jsdelivr.net/gh/${ADDITIONS_REPO}@${ADDITIONS_REF}${encodePath(name)}`,
                target: `${packDir(id)}/${name.slice(additionsPrefix.length)}`,
                replace: true,
            });
        }
    }

    // The pack's files first, then the additions over them.
    const run = async (batch: Download[], offset: number) => {
        let next = 0;
        let done = 0;
        const worker = async () => {
            while (next < batch.length) {
                const { url, target, replace } = batch[next++];
                if (replace || !await fileExists(target).catch(() => false)) await callNative("fs.download", url, target);
                onProgress(offset + ++done, downloads.length);
            }
        };
        await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    };
    onProgress(0, downloads.length);
    await run(downloads.filter(download => !download.replace), 0);
    await run(downloads.filter(download => download.replace), files.length);
    await writeFile(`${packDir(id)}/${COMPLETE_MARKER}`, markerFor(pack));
}

export const removePack = (id: string) => removeFile(packDir(id));
