import { before } from "@vendetta/patcher";
import { FluxDispatcher } from '@vendetta/metro/common';
import { storage } from "@vendetta/plugin";

export function msgSuccess() {
    return before("actionHandler", FluxDispatcher._actionHandlers._computeOrderedActionHandlers("LOAD_MESSAGES_SUCCESS").find(i => i.name === "MessageStore"), (args) => {
        if (!storage.allAsVM) return;
        args[0].messages.forEach(x => {
            if (x.flags == 8192) return;
            x.attachments.forEach(a => {
                if (a.content_type?.startsWith?.("audio")) {
                    x.flags |= 8192;
                    a.waveform = "AEtWPyUaGA4OEAcA";
                    a.duration_secs = 60;
                }
            })
        }
        );
    })
}

export function msgCreate() {
    return before("actionHandler", FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_CREATE").find(i => i.name === "MessageStore"), (args) => {
        if (!storage.allAsVM || args[0].message.flags == 8192) return;
        let message = args[0].message
        if (message?.attachments?.[0]?.content_type?.startsWith("audio")) {
            message.flags |= 8192
            message.attachments.forEach(x => { x.waveform = "AEtWPyUaGA4OEAcA", x.duration_secs = 60 })
        }
    })
}

export function msgUpdate() {
    return before("actionHandler", FluxDispatcher._actionHandlers._computeOrderedActionHandlers("MESSAGE_UPDATE").find(i => i.name === "MessageStore"), (args) => {
        if (!storage.allAsVM || args[0].message.flags == 8192) return;
        let message = args[0].message
        if (message?.attachments?.[0]?.content_type?.startsWith("audio")) {
            message.flags |= 8192
            message.attachments.forEach(x => { x.waveform = "AEtWPyUaGA4OEAcA", x.duration_secs = 60 })
        }
    })
}