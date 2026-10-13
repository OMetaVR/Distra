import { findByProps } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import randomString from "./lib/randomString";

storage.nameLength ??= 8;

function anonymousFileName(file: any, length: number) {
    const fileData = file?.file ?? file;
    if (!fileData) return;

    const originalFilename = fileData.filename ?? fileData.name;
    if (typeof originalFilename !== 'string') return;

    if (
        originalFilename.length ===
        length + (originalFilename.lastIndexOf(".") > -1 ? originalFilename.length - originalFilename.lastIndexOf(".") : 0)
    ) {
        return;
    }

    const extIdx = originalFilename.lastIndexOf(".");
    const ext = extIdx !== -1 ? originalFilename.slice(extIdx) : "";
    const newFilename = randomString(length) + ext;

    if (typeof fileData.filename !== 'undefined') fileData.filename = newFilename;
    if (typeof fileData.name !== 'undefined') fileData.name = newFilename;
}

const unpatches: (() => void)[] = [];

try {
    const uploadModule = findByProps("uploadLocalFiles");
    if (uploadModule) {
        unpatches.push(
            before("uploadLocalFiles", uploadModule, (args) => {
                const files = args[0]?.items ?? args[0]?.files ?? args[0]?.uploads;
                if (!Array.isArray(files)) return;

                const length = isNaN(parseInt(storage.nameLength)) ? 8 : parseInt(storage.nameLength);
                for (const file of files) {
                    anonymousFileName(file, length);
                }
            })
        );
    }
} catch {}

// just because discord exploded uploadModule
try {
    const cloudUploadModule = findByProps("CloudUpload");
    if (cloudUploadModule) {
        unpatches.push(
            before("CloudUpload", cloudUploadModule, (args) => {
                const uploadObject = args[0];
                if (!uploadObject) return;

                const length = isNaN(parseInt(storage.nameLength)) ? 8 : parseInt(storage.nameLength);
                anonymousFileName(uploadObject, length);
            })
        );
    }
} catch {}

export const onUnload = () => {
    for (const unpatch of unpatches) {
        unpatch();
    }
};

export { default as settings } from "./Settings";