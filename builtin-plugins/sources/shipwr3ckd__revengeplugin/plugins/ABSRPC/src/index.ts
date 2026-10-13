import { FluxDispatcher } from "@vendetta/metro/common";
import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { showToast } from "@vendetta/ui/toasts";
import Settings from "./settings";

const assetManager = findByProps("getAssetIds", "fetchAssetIds");

const applicationId = "1381423044907503636";
const UPDATE_INTERVAL_MS = 5000;

let updateInterval: any;
let authToken: string | null = null;
let loginAttempt = false;

function setActivity(activity: any) {
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        socketId: "ABSRPC",
    });
}

async function authenticate(opts?: { success?: boolean }) {
    const { serverUrl, username, password } = storage;
    if (!serverUrl || !username || !password) {
        if (!loginAttempt) showToast("❌ AudioBookShelf RPC not configured.");
        loginAttempt = true;
        return false;
    }

    loginAttempt = true;
    try {
        const res = await fetch(`${serverUrl.replace(/\/$/, "")}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });

        if (!res.ok) throw new Error(`Server responded with ${res.status}`);
        const data = await res.json();
        authToken = data.user?.token;

        if (authToken) {
            if (!opts?.success) showToast("✅ Logged in successfully.");
            return true;
        } else {
            showToast("❌ AudioBookShelf login failed.");
            return false;
        }
    } catch {
        showToast("❌ Login failed. Check debug logs.");
        return false;
    }
}

async function fetchMediaData() {
    if (!authToken && !(await authenticate({ success: true }))) return null;

    try {
        const base = storage.serverUrl.replace(/\/$/, "");
        const res = await fetch(`${base}/api/me/listening-sessions`, {
            headers: { Authorization: `Bearer ${authToken}` },
        });

        if (!res.ok) {
            if (res.status === 401) {
                authToken = null;
                return fetchMediaData();
            }
            return null;
        }

        const { sessions } = await res.json();
        const active = sessions.find((s: any) => s.updatedAt && !s.isFinished);
        if (!active || Date.now() - active.updatedAt > 10000) return null;

        const media = active.mediaMetadata;
        if (!media) return null;

        return {
            name: media.title || "Unknown",
            type: active.mediaType || "book",
            author: media.authors?.map((a: any) => a.name).join(", "),
            publisher: media.publisher,
            series: media.series?.[0]?.name,
            duration: active.duration,
            currentTime: active.currentTime,
            updatedAt: active.updatedAt,
            imageUrl: active.libraryItemId ? `${base}/api/items/${active.libraryItemId}/cover` : undefined,
            isFinished: active.isFinished || false,
        };
    } catch {
        setActivity(null);
        return null;
    }
}

async function getActivity() {
    const media = await fetchMediaData();
    if (!media || media.isFinished) return null;

    let assets = {
        large_image: media.imageUrl ?? "audiobookshelf",
        large_text: media.publisher || "Unknown Publisher",
    };

    try {
        const args = [applicationId, [assets.large_image]];
        let assetIds = assetManager.getAssetIds?.(...args);
        if (!assetIds?.length && assetManager.fetchAssetIds) {
            assetIds = await assetManager.fetchAssetIds(...args);
        }
        assets.large_image = assetIds?.[0] ?? assets.large_image;
    } catch {
    }

    const timestamps = media.currentTime != null && media.duration && media.updatedAt
        ? {
              start: media.updatedAt - media.currentTime * 1000,
              end: (media.updatedAt - media.currentTime * 1000) + media.duration * 1000,
          }
        : undefined;

    return {
        application_id: applicationId,
        name: "AudioBookShelf",
        details: media.name,
        state: media.author || "Unknown Author",
        assets,
        timestamps,
        type: 2,
        flags: 1,
    };
}

async function updatePresence() {
    const activity = await getActivity();
    setActivity(activity);
}

function startPolling() {
    stopPolling();
    updatePresence();
    updateInterval = setInterval(updatePresence, UPDATE_INTERVAL_MS);
}

function stopPolling() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
        setActivity(null);
    }
}

export const api = {
    authenticate,
    startPolling,
    stopPolling,
};

export default {
    async onLoad() {
        if (await api.authenticate({ success: true })) {
            api.startPolling();
        }
    },
    onUnload() {
        api.stopPolling();
        authToken = null;
        loginAttempt = false;
    },
    settings: Settings,
};