// settings wip
const sortObject = <T extends object>(obj: T): T => {
    return Object.fromEntries(Object.entries(obj).sort(([k1], [k2]) => k1.localeCompare(k2))) as T
}

export const cleanMessage = (msg) => {
    // Add null/undefined check
    if (!msg) {
        console.warn("[ViewRaw] cleanMessage: No message provided")
        return null
    }

    try {
        const clone = JSON.parse(JSON.stringify(msg))
        
        // Only try to clean author if it exists
        if (clone && clone.author && typeof clone.author === 'object') {
            const sensitiveKeys = ["email", "phone", "mfaEnabled", "hasBouncedEmail"]
            for (const key of sensitiveKeys) {
                if (key in clone.author) {
                    delete clone.author[key]
                }
            }
        }
        
        return clone
    } catch (e) {
        console.error("[ViewRaw] cleanMessage error:", e)
        // Return original message if cleaning fails
        return msg
    }
}