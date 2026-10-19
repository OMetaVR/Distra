import { logger } from "@vendetta"
import { findByProps } from "@vendetta/metro"
import { after } from "@vendetta/patcher"
import { safeFetch } from "@vendetta/utils"
import { showToast } from "@vendetta/ui/toasts"

import Settings from "./Settings"

interface userBGData {
    endpoint: string;
    bucket: string;
    prefix: string;
    users: Record<string, string>;
}

const getUserBannerURL = findByProps("default", "getUserBannerURL")

let data: userBGData
let unpatch: () => void

export const fetchData = async () => {
    try {
        data = await (await safeFetch("https://usrbg.is-hardly.online/users", { cache: "no-store" })).json()
        return data
    } catch (e) {
        logger.error("Failed to fetch userBG data", e)
    }
}

export const onLoad = async () => {
    await fetchData()
    if (!data) return showToast("Failed to load DB")
    // Distra: look the user up directly (the database lists ~200k users; scanning it cost ~60 ms on every
    // banner Discord built), read `data` each time so "Reload DB" applies, and treat a null banner (Discord 348's
    // user records) like a missing one. A Nitro banner still wins.
    unpatch = after("getUserBannerURL", getUserBannerURL, ([user]) => {
        const etag = user?.id ? data?.users[user.id] : undefined
        if (!user?.banner && etag != null) {
            const { endpoint, bucket, prefix } = data;
            return `${endpoint}/${bucket}/${prefix}${user.id}?${etag}`
        }
    })
}

export const onUnload = () => unpatch?.()

export const settings = Settings