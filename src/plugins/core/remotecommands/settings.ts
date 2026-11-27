import { createFileStorage } from "@/core/storage";

export interface Backend {
    id: string;
    /** Base URL, e.g. http://mesbot.lan */
    url: string;
    token: string;
    enabled: boolean;
}

export interface RemoteCommandsSettings {
    backends: Backend[];
}

export const defaults: RemoteCommandsSettings = { backends: [] };

export let settings: RemoteCommandsSettings = { backends: [] };

export async function loadSettings() {
    settings = await createFileStorage<RemoteCommandsSettings>("plugins/data/core-remotecommands.json", defaults);
    if (!Array.isArray(settings.backends)) settings.backends = [];
}
