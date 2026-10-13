// File access, sandboxed natively to Documents/Discordia. Paths are relative.

import { callNative } from "./bridge";

export const readFile = (path: string) => callNative<string>("fs.read", path);
export const writeFile = (path: string, contents: string) => callNative<void>("fs.write", path, contents);
export const fileExists = (path: string) => callNative<boolean>("fs.exists", path);
export const removeFile = (path: string) => callNative<void>("fs.remove", path);
export const listDirectory = (path: string) => callNative<string[]>("fs.list", path);

export async function readJSON<T>(path: string): Promise<T | null> {
    if (!await fileExists(path)) return null;
    return JSON.parse(await readFile(path)) as T;
}

export const writeJSON = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
